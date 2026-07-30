#!/usr/bin/env node
/**
 * CSV → Postgres mirror import.
 *
 * A stopgap for when the Airtable API quota is exhausted. Airtable's web UI
 * exports are NOT metered against the API allowance, so this restores data to
 * the dashboards without spending a single API call.
 *
 * It is deliberately a fallback, not a replacement for scripts/sync-airtable.js
 * — see "Known losses" below. Re-running the real sync later overwrites
 * everything imported here with the authoritative version.
 *
 * Usage
 *   1. In Airtable, open each table and use  ...  →  Download CSV
 *   2. Save the files as  imports/<BASE>.<TABLE>.csv   e.g. imports/UK.ORDERS.csv
 *      (run `node scripts/import-csv.js --list` to print every expected filename)
 *   3. node --env-file-if-exists=.env.local scripts/import-csv.js
 *
 *   --dir=imports     directory to read (default "imports")
 *   --list            print expected filenames for every known table and exit
 *   --dry-run         parse and report, write nothing
 *
 * Known losses versus a real API sync:
 *   - Airtable CSV exports contain no record IDs, so rows get synthetic ones
 *     ("csv:<row>"). Opening a record's detail panel or posting a comment will
 *     not work for imported rows — those need the real Airtable record ID.
 *   - Everything arrives as text. Purely numeric cells are converted back to
 *     numbers; anything else stays a string, so a column Airtable treated as a
 *     number but exported oddly may format differently on screen.
 *   - Multi-value cells arrive as one comma-joined string rather than an array.
 *   - createdTime is not exported, so it is null.
 */
const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');
const { getPrisma, isConfigured } = require('../lib/prisma');
const { BASES, listTables } = require('../lib/airtable-tables');

const UPSERT_BATCH = 400;

function parseArgs(argv) {
  const out = { dir: 'imports', list: false, dryRun: false };
  for (const a of argv) {
    if (a === '--list') out.list = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--dir=')) out.dir = a.slice(6);
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

// Parser + numeric coercion shared with import-sellerboard.js — see the
// comments there for why it is hand-rolled (xlsx reformats date strings).
const { parseDelimited, toObjects } = require('./lib/csv');

function readCsv(file) {
  return toObjects(parseDelimited(fs.readFileSync(file, 'utf8'), ','));
}

async function upsert(prisma, baseId, tableId, records, syncToken) {
  for (let i = 0; i < records.length; i += UPSERT_BATCH) {
    const batch = records.slice(i, i + UPSERT_BATCH);
    const values = batch.map(r => Prisma.sql`(
      ${baseId}, ${tableId}, ${r.recordId},
      ${JSON.stringify(r.fields)}::json,
      ${null}::text, ${r.position}::int, ${syncToken}, (now() at time zone 'utc')
    )`);
    await prisma.$executeRaw`
      INSERT INTO "AirtableRecord"
        ("baseId","tableId","recordId","fields","createdTime","position","syncToken","syncedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("baseId","tableId","recordId") DO UPDATE SET
        "fields"    = EXCLUDED."fields",
        "position"  = EXCLUDED."position",
        "syncToken" = EXCLUDED."syncToken",
        "syncedAt"  = EXCLUDED."syncedAt"
    `;
  }
}

function pad(s, n) { return String(s).padEnd(n); }

/*
 * Airtable CSV exports omit record IDs, which costs the detail panel and
 * comments. You can get them back by adding a formula field RECORD_ID() to the
 * table before exporting — if such a column is present we use it, and the
 * imported rows behave exactly like synced ones.
 */
const RECORD_ID_HEADERS = ['record id', 'recordid', '_recordid', 'record_id', 'airtable id', 'airtable record id'];

function findRecordIdHeader(fields) {
  return Object.keys(fields).find(k => RECORD_ID_HEADERS.includes(k.trim().toLowerCase()));
}

/** True when the column really holds Airtable record IDs, not something similarly named. */
function looksLikeRecordIds(rows, header) {
  const sample = rows.slice(0, 20).map(r => String(r[header] || '').trim()).filter(Boolean);
  return sample.length > 0 && sample.every(v => /^rec[A-Za-z0-9]{14}$/.test(v));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const all = listTables(Object.keys(BASES));

  if (args.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
    return 0;
  }

  if (args.list) {
    console.log('\nExpected filenames (save Airtable CSV exports under imports/ using these names):\n');
    for (const t of all) console.log(`  ${t.baseKey}.${t.tableKey}.csv`);
    console.log(`\n${all.length} tables. You do not need all of them — import whichever you need first.\n`);
    return 0;
  }

  if (!isConfigured()) {
    console.error('Missing DATABASE_URL (or POSTGRES_PRISMA_URL / POSTGRES_URL).');
    return 1;
  }

  const dir = path.resolve(args.dir);
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}\nCreate it and save your CSV exports there — run --list for the filenames.`);
    return 1;
  }

  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.csv'));
  if (!files.length) {
    console.error(`No .csv files in ${dir}. Run --list to see the expected filenames.`);
    return 1;
  }

  /*
   * Airtable names exports after the table and view ("🎯 UK Operational
   * Tasks-Grid view.csv"), which matches no naming convention we could pick.
   * Rather than making people rename every file, mapping.json says which file
   * is which table:
   *
   *   { "🎯 UK Operational Tasks-Grid view.csv": "UK.TASKS" }
   *
   * Files named BASE.TABLE.csv still work without an entry.
   */
  let mapping = {};
  const mappingPath = path.join(dir, 'mapping.json');
  if (fs.existsSync(mappingPath)) {
    try {
      mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
      console.log(`Using ${path.basename(mappingPath)} (${Object.keys(mapping).length} entries)`);
    } catch (e) {
      console.error(`mapping.json is not valid JSON: ${e.message}`);
      return 1;
    }
  }

  const prisma = getPrisma();
  console.log(`\nImporting ${files.length} CSV file(s) from ${dir}${args.dryRun ? '  [DRY RUN]' : ''}\n`);

  const results = [];
  for (const file of files.sort()) {
    const stem = file.replace(/\.csv$/i, '');
    // mapping.json wins; otherwise fall back to the BASE.TABLE.csv convention.
    const spec = mapping[file] || mapping[stem] || stem;
    const [baseKey, tableKey] = String(spec).split('.');
    const target = all.find(t => t.baseKey === baseKey && t.tableKey === tableKey);

    const label = mapping[file] || mapping[stem] ? `${spec}` : stem;
    process.stdout.write(pad(label.length > 28 ? label.slice(0, 27) + '…' : label, 30));
    if (!target) {
      console.log('SKIP  no mapping — add it to imports/mapping.json (see --list)');
      results.push({ stem, ok: false, error: 'no mapping' });
      continue;
    }

    try {
      const rows = readCsv(path.join(dir, file));

      // Use real Airtable record IDs when the export includes them.
      const idHeader = rows.length ? findRecordIdHeader(rows[0]) : null;
      const realIds = idHeader && looksLikeRecordIds(rows, idHeader);

      const records = rows.map((fields, i) => {
        let recordId;
        if (realIds) {
          recordId = String(fields[idHeader]).trim();
          // The ID column is plumbing, not data — don't render it as a table column.
          fields = { ...fields };
          delete fields[idHeader];
        } else {
          // Index-based so re-importing the same export updates rows in place
          // rather than duplicating them.
          recordId = `csv:${i}`;
        }
        return { recordId, fields, position: i };
      });

      if (!args.dryRun) {
        const syncToken = `csv-${Date.now()}-${target.tableKey}`;
        await upsert(prisma, target.baseId, target.tableId, records, syncToken);
        const { count: deleted } = await prisma.airtableRecord.deleteMany({
          where: { baseId: target.baseId, tableId: target.tableId, syncToken: { not: syncToken } },
        });
        await prisma.syncRun.create({
          data: {
            baseKey: target.baseKey, tableKey: target.tableKey,
            baseId: target.baseId, tableId: target.tableId,
            status: 'ok', recordCount: records.length, deleted,
            startedAt: new Date(), finishedAt: new Date(),
          },
        });
        console.log(`ok    ${records.length} rows${deleted ? `  (-${deleted} replaced)` : ''}${realIds ? '  [real record IDs]' : '  [synthetic IDs]'}`);
      } else {
        const cols = records.length ? Object.keys(records[0].fields).length : 0;
        console.log(`ok    ${records.length} rows, ${cols} columns${realIds ? ', real record IDs' : ', synthetic IDs'} (not written)`);
      }
      results.push({ stem, ok: true, count: records.length });
    } catch (err) {
      console.log(`FAIL  ${err.message}`);
      results.push({ stem, ok: false, error: err.message });
    }
  }

  const failed = results.filter(r => !r.ok);
  const rows = results.reduce((n, r) => n + (r.count || 0), 0);
  console.log(`\n${results.length - failed.length}/${results.length} files imported, ${rows} rows.`);
  if (failed.length) {
    console.log('\nFailed:');
    for (const f of failed) console.log(`  ${f.stem}: ${f.error}`);
  }
  console.log(
    '\nImported rows use synthetic IDs, so record detail panels and comments will not\n' +
    'work for them. Re-run scripts/sync-airtable.js once API quota is available to\n' +
    'replace this with the authoritative data.\n'
  );

  return failed.length ? 1 : 0;
}

async function disconnect() {
  const p = globalThis.__natroPrisma;
  if (p) await p.$disconnect().catch(() => {});
}

main()
  .then(async code => { await disconnect(); process.exit(code); })
  .catch(async err => { console.error(err); await disconnect(); process.exit(1); });
