/**
 * Clean what is STORED on tasks, not just what is displayed.
 *
 *   node --env-file-if-exists=.env.local scripts/normalise-tasks.js [--dry-run]
 *
 * Two jobs, one pass, because both touch every task row.
 *
 * 1. STATUS. `lib/tasks.js` has normalised status on read since July, which
 *    made the cards look tidy while the stored values stayed as they were:
 *    "In Progress" and "🟡 In Progress" are still two different strings in the
 *    database, as are "Blocked" / "🔴 Blocked" and "Not Started" /
 *    "⚪ Not Started". That is invisible until you group or sort by status, at
 *    which point one group becomes four. Display normalisation hid the problem
 *    rather than fixing it, so this writes the clean value back.
 *
 * 2. ADDED DATE. Sorting "what arrived recently" to the top needs a date, and
 *    `createdTime` is empty on every open UK task. It is recoverable anyway:
 *    `syncToken` embeds the millisecond timestamp of the write that created the
 *    row ("ingest-1785655848721-TASKS"). Where both exist, createdTime wins,
 *    because syncToken records the LAST write rather than the first, so on a
 *    row edited since it reads later than the truth.
 *
 * Never overwrites an Added value that is already there, so re-running is safe
 * and a hand-corrected date is never clobbered.
 */

const { getPrisma, isConfigured } = require('../lib/prisma');
const { BASES } = require('../lib/airtable-tables');
const { normStatus } = require('../lib/tasks');

const TASK_BASES = ['UK', 'SA', 'ME', 'PT', 'AFF'];

/** "ingest-1785655848721-TASKS" → ISO date, or null. */
function dateFromSyncToken(token) {
  const m = String(token || '').match(/(\d{13})/);
  if (!m) return null;
  const d = new Date(Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }
  const prisma = getPrisma();

  let totalStatus = 0, totalAdded = 0, totalRows = 0;

  for (const key of TASK_BASES) {
    const b = BASES[key];
    const tableId = b?.tables?.TASKS;
    if (!tableId) continue;

    const rows = await prisma.$queryRaw`
      SELECT "recordId", "fields"::text AS raw, "createdTime", "syncToken"
      FROM "AirtableRecord"
      WHERE "baseId" = ${b.defaultBaseId} AND "tableId" = ${tableId}`;

    const changes = [];
    for (const r of rows) {
      const f = JSON.parse(r.raw);
      const next = { ...f };
      let touched = false;

      const clean = normStatus(f.Status);
      if (f.Status && clean && f.Status !== clean) {
        next.Status = clean;
        touched = true;
        totalStatus++;
      }

      if (!f.Added) {
        const added = (r.createdTime && new Date(r.createdTime).toISOString().slice(0, 10))
          || dateFromSyncToken(r.syncToken);
        if (added) {
          next.Added = added;
          touched = true;
          totalAdded++;
        }
      }

      if (touched) changes.push({ recordId: r.recordId, fields: next, before: f.Status, after: next.Status });
    }

    totalRows += changes.length;
    console.log(`${key.padEnd(4)} ${String(rows.length).padStart(4)} tasks → ${changes.length} to update`);

    if (!dryRun) {
      for (const c of changes) {
        await prisma.$executeRaw`
          UPDATE "AirtableRecord" SET "fields" = ${JSON.stringify(c.fields)}::json
          WHERE "baseId" = ${b.defaultBaseId} AND "tableId" = ${tableId} AND "recordId" = ${c.recordId}`;
      }
    }
  }

  console.log(`\nstatus rewritten : ${totalStatus}`);
  console.log(`Added backfilled : ${totalAdded}`);
  console.log(`rows touched     : ${totalRows}`);
  if (dryRun) console.log('\n(dry run — nothing written)');
  await prisma.$disconnect();
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.error(e); process.exit(1); });
