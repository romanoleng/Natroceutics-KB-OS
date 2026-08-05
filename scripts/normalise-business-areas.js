/**
 * Collapse the Business Area field onto one vocabulary, IN THE DATABASE.
 *
 *   node --env-file-if-exists=.env.local scripts/normalise-business-areas.js            # dry run
 *   node --env-file-if-exists=.env.local scripts/normalise-business-areas.js --write    # apply
 *
 * Read-time normalisation was never enough: it makes the cards look tidy while
 * "Amazon", "🛒 Amazon UK" and "Amazon UK" stay three different strings that no
 * GROUP BY, lane or filter can join. Same lesson as the stored task statuses.
 *
 * Values that are REGIONS rather than areas ("Middle East" on a UK task) are
 * reported and left alone. Mapping them to some UK area would bury a filing
 * mistake under a tidy label, and the right fix is to move the task's region,
 * which is Romano's call and not something a normaliser should guess.
 */
const { PrismaClient } = require('@prisma/client');
const { normaliseArea } = require('../lib/business-areas');
const { BASES } = require('../lib/airtable-tables');

const WRITE = process.argv.includes('--write');

async function main() {
  const prisma = new PrismaClient();

  // Every TASKS-shaped table across the regions, not just UK: the same three
  // writers fill all of them.
  const targets = [];
  for (const [baseKey, base] of Object.entries(BASES)) {
    for (const tableKey of ['TASKS', 'RISKS']) {
      const tableId = base.tables?.[tableKey];
      if (tableId) targets.push({ baseKey, tableKey, tableId });
    }
  }

  let scanned = 0, changed = 0, regionFlagged = 0;
  const moves = new Map();
  const flagged = [];

  for (const t of targets) {
    const rows = await prisma.airtableRecord.findMany({
      where: { tableId: t.tableId },
      select: { baseId: true, tableId: true, recordId: true, fields: true },
    });

    for (const row of rows) {
      const raw = row.fields?.['Business Area'];
      if (raw === undefined) continue;
      scanned++;
      const { value, isRegion } = normaliseArea(raw);

      if (isRegion) {
        regionFlagged++;
        flagged.push(`${t.baseKey}.${t.tableKey}  "${raw}"  ${String(row.fields.Task || row.fields.Risk || '').slice(0, 60)}`);
        continue;
      }
      if (value === null || value === String(raw).trim()) continue;

      moves.set(`${raw} → ${value}`, (moves.get(`${raw} → ${value}`) || 0) + 1);
      changed++;

      if (WRITE) {
        await prisma.airtableRecord.update({
          where: {
            baseId_tableId_recordId: {
              baseId: row.baseId, tableId: row.tableId, recordId: row.recordId,
            },
          },
          data: { fields: { ...row.fields, 'Business Area': value } },
        });
      }
    }
  }

  console.log(`${WRITE ? 'APPLIED' : 'DRY RUN'} — scanned ${scanned} records across ${targets.length} tables\n`);
  if (moves.size) {
    console.log('Rewrites:');
    for (const [k, n] of [...moves].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${k}`);
    }
  } else {
    console.log('Nothing to rewrite.');
  }
  console.log(`\n${changed} record${changed === 1 ? '' : 's'} ${WRITE ? 'updated' : 'would change'}.`);

  if (regionFlagged) {
    console.log(`\n${regionFlagged} record${regionFlagged === 1 ? ' holds' : 's hold'} a REGION in the Business Area field.`);
    console.log('Left untouched on purpose — these look mis-filed and the fix is the region, not the label:');
    for (const f of flagged.slice(0, 12)) console.log(`  ${f}`);
  }

  if (!WRITE && changed) console.log('\nRe-run with --write to apply.');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
