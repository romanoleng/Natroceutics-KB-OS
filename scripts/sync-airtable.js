#!/usr/bin/env node
/**
 * Airtable → Postgres mirror sync.
 *
 * Reads every table in the selected bases and upserts it into the
 * AirtableRecord mirror, so the website can serve dashboards from Postgres
 * instead of spending Airtable API quota on every page load.
 *
 * Usage
 *   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/sync-airtable.js
 *   node scripts/sync-airtable.js --bases=UK              # default
 *   node scripts/sync-airtable.js --bases=UK,SA,ME
 *   node scripts/sync-airtable.js --bases=all
 *   node scripts/sync-airtable.js --tables=UK.ORDERS,UK.TASKS
 *   node scripts/sync-airtable.js --bases=UK --dry-run    # fetch + report, no writes
 *   node scripts/sync-airtable.js --stats                 # DB row counts only, no Airtable calls
 *
 * Env
 *   AIRTABLE_API_KEY   required (except --stats)
 *   DATABASE_URL       required (or POSTGRES_PRISMA_URL / POSTGRES_URL)
 *   SYNC_BASES         default base selection when --bases is omitted (default "UK")
 *
 * Exit code is 1 if any table failed, so a scheduler can alert on it.
 */
const { randomUUID } = require('crypto');
const Airtable = require('airtable');
const { Prisma } = require('@prisma/client');
const { getPrisma, isConfigured } = require('../lib/prisma');
const {
  BASES,
  listTables,
  normaliseFields,
  realEnv,
} = require('../lib/airtable-tables');

/* ── config ──────────────────────────────────────────────── */
const UPSERT_BATCH = 400;      // rows per INSERT statement
const DELAY_BETWEEN_TABLES_MS = 250; // stay well under Airtable's 5 req/s

/* ── API call budget ─────────────────────────────────────────
 * Airtable meters API calls per workspace per calendar month — 1,000 on Free,
 * 100,000 on Team, uncapped on Business. Exhausting it takes the whole account
 * down (website and scheduler alike), which is exactly what happened on
 * 2026-07-27, so the sync refuses to spend more than it is allowed.
 *
 * One call = one page of up to 100 records, so a table costs
 * ceil(records / 100) calls.
 *
 * Set --max-calls=N or SYNC_MAX_CALLS. The run stops cleanly at the ceiling and
 * reports what it skipped rather than silently eating the month's allowance.
 * ─────────────────────────────────────────────────────────── */
const callBudget = {
  used: 0,
  max: Infinity,
  get remaining() { return this.max - this.used; },
  get exhausted() { return this.used >= this.max; },
};

/* ── args ────────────────────────────────────────────────── */
function parseArgs(argv) {
  const out = { bases: null, tables: null, dryRun: false, stats: false, maxCalls: null, onlyMissing: false };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--stats') out.stats = true;
    else if (arg === '--only-missing') out.onlyMissing = true;
    else if (arg.startsWith('--bases=')) out.bases = arg.slice(8);
    else if (arg.startsWith('--tables=')) out.tables = arg.slice(9);
    else if (arg.startsWith('--max-calls=')) out.maxCalls = Number(arg.slice(12));
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (out.maxCalls !== null && (!Number.isFinite(out.maxCalls) || out.maxCalls <= 0)) {
    throw new Error(`--max-calls must be a positive number, got "${out.maxCalls}"`);
  }
  return out;
}

/** Resolve CLI selection into a flat list of tables to sync. */
function selectTables(args) {
  if (args.tables) {
    const wanted = args.tables.split(',').map(s => s.trim()).filter(Boolean);
    const all = listTables(Object.keys(BASES));
    return wanted.map(spec => {
      const [baseKey, tableKey] = spec.split('.');
      const found = all.find(t => t.baseKey === baseKey && t.tableKey === tableKey);
      if (!found) throw new Error(`Unknown table "${spec}"`);
      return found;
    });
  }

  const raw = args.bases || process.env.SYNC_BASES || 'UK';
  const baseKeys = raw.toLowerCase() === 'all'
    ? Object.keys(BASES)
    : raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  return listTables(baseKeys);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Airtable read ───────────────────────────────────────── */
/**
 * Fetch a whole table in its default view order.
 *
 * Deliberately unsorted: the position of each record here IS the table's
 * default view order, which lib/mirror.js replays for the getters that pass no
 * sort field. Sorted/limited reads are applied in SQL at request time instead.
 */
async function fetchTable(apiKey, baseId, tableId) {
  // noRetryIfRateLimited so a 429 surfaces immediately instead of the SDK
  // retrying forever — same reasoning as lib/airtable.js.
  const base = new Airtable({ apiKey, noRetryIfRateLimited: true, requestTimeout: 30_000 }).base(baseId);
  const records = [];

  await new Promise((resolve, reject) => {
    base(tableId).select({}).eachPage(
      (page, next) => {
        callBudget.used++; // one page fetched = one Airtable API call
        for (const r of page) {
          records.push({
            recordId: r.id,
            fields: normaliseFields(r.fields),
            // r.createdTime is undefined in airtable.js v0.12 — read _rawJson
            createdTime: (r._rawJson && r._rawJson.createdTime) || r.createdTime || null,
            position: records.length,
          });
        }
        if (callBudget.exhausted) {
          return reject(new Error(
            `API call budget exhausted mid-table (${callBudget.used}/${callBudget.max}) — table left unchanged`
          ));
        }
        next();
      },
      err => (err ? reject(err) : resolve())
    );
  });

  return records;
}

/* ── Postgres write ──────────────────────────────────────── */
/**
 * Note the casts: `::json` (not jsonb) to preserve Airtable's field order, and
 * syncedAt set server-side with now() rather than bound from JS — see the
 * comments on the schema for why neither is incidental.
 */
async function upsertRecords(prisma, baseId, tableId, records, syncToken) {
  for (let i = 0; i < records.length; i += UPSERT_BATCH) {
    const batch = records.slice(i, i + UPSERT_BATCH);
    const values = batch.map(r => Prisma.sql`(
      ${baseId},
      ${tableId},
      ${r.recordId},
      ${JSON.stringify(r.fields)}::json,
      ${r.createdTime}::text,
      ${r.position}::int,
      ${syncToken},
      (now() at time zone 'utc')
    )`);

    await prisma.$executeRaw`
      INSERT INTO "AirtableRecord"
        ("baseId", "tableId", "recordId", "fields", "createdTime", "position", "syncToken", "syncedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("baseId", "tableId", "recordId") DO UPDATE SET
        "fields"      = EXCLUDED."fields",
        "createdTime" = EXCLUDED."createdTime",
        "position"    = EXCLUDED."position",
        "syncToken"   = EXCLUDED."syncToken",
        "syncedAt"    = EXCLUDED."syncedAt"
    `;
  }
}

/**
 * Remove rows the upstream table no longer contains — i.e. everything this run
 * did not just stamp with its own token.
 *
 * Safe because it only runs after a complete, successful fetch: a partial fetch
 * throws before reaching this point, leaving the previous mirror intact.
 */
async function deleteStale(prisma, baseId, tableId, syncToken) {
  const { count } = await prisma.airtableRecord.deleteMany({
    where: { baseId, tableId, syncToken: { not: syncToken } },
  });
  return count;
}

/* ── stats mode ──────────────────────────────────────────── */
async function printStats(prisma, tables) {
  const grouped = await prisma.airtableRecord.groupBy({
    by: ['baseId', 'tableId'],
    _count: { _all: true },
    _max: { syncedAt: true },
  });
  const byKey = new Map(grouped.map(g => [`${g.baseId}::${g.tableId}`, g]));

  console.log('\nMirror contents\n');
  console.log(pad('TABLE', 28) + pad('ROWS', 10) + 'LAST SYNCED');
  console.log('-'.repeat(70));
  for (const t of tables) {
    const g = byKey.get(`${t.baseId}::${t.tableId}`);
    console.log(
      pad(`${t.baseKey}.${t.tableKey}`, 28) +
      pad(g ? String(g._count._all) : '—', 10) +
      (g && g._max.syncedAt ? g._max.syncedAt.toISOString() : 'never')
    );
  }
  console.log('');
}

/* ── main ────────────────────────────────────────────────── */
function pad(s, n) { return String(s).padEnd(n); }

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]);
    return 0;
  }

  if (!isConfigured()) {
    console.error('Missing DATABASE_URL (or POSTGRES_PRISMA_URL / POSTGRES_URL).');
    return 1;
  }

  const prisma = getPrisma();
  let tables = selectTables(args);

  if (args.stats) {
    await printStats(prisma, tables);
    return 0;
  }

  const apiKey = realEnv('AIRTABLE_API_KEY');
  if (!apiKey) {
    if (process.env.AIRTABLE_API_KEY) {
      console.error(
        'AIRTABLE_API_KEY is the placeholder "' + process.env.AIRTABLE_API_KEY + '", not a real token.\n' +
        'That happens when `vercel env pull` copies a variable marked Sensitive in Vercel —\n' +
        'those values cannot be read back. Put the real personal access token in .env.local by hand.'
      );
    } else {
      console.error('Missing AIRTABLE_API_KEY.');
    }
    return 1;
  }
  if (!apiKey.startsWith('pat')) {
    console.error(`AIRTABLE_API_KEY does not look like a personal access token (expected it to start with "pat").`);
    return 1;
  }

  const missingBase = tables.find(t => !t.baseId);
  if (missingBase) {
    console.error(`No base ID resolved for ${missingBase.baseKey} (${missingBase.envVar}).`);
    return 1;
  }

  const maxCalls = args.maxCalls || Number(process.env.SYNC_MAX_CALLS) || null;
  if (maxCalls) callBudget.max = maxCalls;

  // --only-missing: skip tables already mirrored successfully. Makes a
  // budget-limited migration resumable across several runs without re-spending
  // calls on tables that are already in, which matters when the whole month's
  // allowance is 1,000.
  if (args.onlyMissing) {
    const done = await prisma.syncRun.findMany({
      where: { status: 'ok' },
      distinct: ['baseId', 'tableId'],
      select: { baseId: true, tableId: true },
    });
    const doneSet = new Set(done.map(d => `${d.baseId}::${d.tableId}`));
    const before = tables.length;
    tables = tables.filter(t => !doneSet.has(`${t.baseId}::${t.tableId}`));
    console.log(`\n--only-missing: ${before - tables.length} table(s) already mirrored, ${tables.length} remaining.`);
    if (!tables.length) {
      console.log('Nothing left to sync.\n');
      return 0;
    }
  }

  const baseKeys = [...new Set(tables.map(t => t.baseKey))];
  console.log(
    `\nSyncing ${tables.length} table(s) across ${baseKeys.length} base(s): ${baseKeys.join(', ')}` +
    (args.dryRun ? '  [DRY RUN — no writes]' : '') +
    (maxCalls ? `  [budget: ${maxCalls} API calls]` : '') + '\n'
  );

  const results = [];
  const skipped = [];

  for (const t of tables) {
    const startedAt = new Date();
    const label = `${t.baseKey}.${t.tableKey}`;

    // Stop before spending a call we do not have. Remaining tables keep
    // whatever the mirror already holds and fall back to live Airtable.
    if (callBudget.exhausted) {
      skipped.push(label);
      continue;
    }

    process.stdout.write(pad(label, 30));

    try {
      const records = await fetchTable(apiKey, t.baseId, t.tableId);
      let deleted = 0;

      if (!args.dryRun) {
        // One token for the whole table: every row written gets it, and
        // anything still carrying an older token is by definition gone upstream.
        const syncToken = randomUUID();
        await upsertRecords(prisma, t.baseId, t.tableId, records, syncToken);
        deleted = await deleteStale(prisma, t.baseId, t.tableId, syncToken);

        await prisma.syncRun.create({
          data: {
            baseKey: t.baseKey, tableKey: t.tableKey,
            baseId: t.baseId, tableId: t.tableId,
            status: 'ok',
            recordCount: records.length,
            deleted,
            durationMs: Date.now() - startedAt.getTime(),
            startedAt,
            finishedAt: new Date(),
          },
        });
      }

      const ms = Date.now() - startedAt.getTime();
      console.log(`ok    ${pad(records.length + ' rows', 14)}${deleted ? `-${deleted} stale  ` : ''}${ms}ms`);
      results.push({ label, ok: true, count: records.length, deleted });
    } catch (err) {
      console.log(`FAIL  ${err.message}`);
      results.push({ label, ok: false, error: err.message });

      if (!args.dryRun) {
        // Best-effort: if the DB itself is the problem this will also fail.
        await prisma.syncRun.create({
          data: {
            baseKey: t.baseKey, tableKey: t.tableKey,
            baseId: t.baseId, tableId: t.tableId,
            status: 'error',
            durationMs: Date.now() - startedAt.getTime(),
            error: String(err.message).slice(0, 1000),
            startedAt,
            finishedAt: new Date(),
          },
        }).catch(e => console.error(`  (could not record SyncRun: ${e.message})`));
      }
    }

    await sleep(DELAY_BETWEEN_TABLES_MS);
  }

  const failed = results.filter(r => !r.ok);
  const rows = results.reduce((n, r) => n + (r.count || 0), 0);
  console.log(`\n${results.length - failed.length}/${results.length} tables synced, ${rows} rows total.`);
  console.log(`Airtable API calls used: ${callBudget.used}${maxCalls ? ` / ${maxCalls}` : ''}`);

  if (failed.length) {
    console.log('\nFailed:');
    for (const f of failed) console.log(`  ${f.label}: ${f.error}`);
  }

  // Never let a truncated run look like a complete one.
  if (skipped.length) {
    console.log(`\nSKIPPED ${skipped.length} table(s) — API call budget reached:`);
    console.log(`  ${skipped.join(', ')}`);
    console.log('  These keep their existing mirrored data, or fall back to live Airtable if never synced.');
  }
  console.log('');

  return failed.length || skipped.length ? 1 : 0;
}

async function disconnect() {
  const p = globalThis.__natroPrisma;
  if (p) await p.$disconnect().catch(() => {});
}

main()
  .then(async code => { await disconnect(); process.exit(code); })
  .catch(async err => { console.error(err); await disconnect(); process.exit(1); });
