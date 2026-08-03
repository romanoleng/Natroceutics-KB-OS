/**
 * Move the Gamma Waves platform cost quote out of ME.FINANCE into
 * ME.COST_MODEL.
 *
 *   node --env-file-if-exists=.env.local scripts/move-me-cost-model.js [--dry-run]
 *
 * The quote was loaded into FINANCE on 3 August because it was the closest
 * existing table. It shares no fields with the revenue rows FINANCE was built
 * for, so it rendered as ten rows of dashes with only a Status badge. Finance
 * is bills and revenue; what it costs to run the store is a cost model, the
 * same split UK already keeps under `os:uk-cost-model`.
 *
 * Idempotent: rows already moved are left alone, and the source rows are only
 * deleted once their copies are confirmed present.
 */

const { getPrisma, isConfigured } = require('../lib/prisma');
const { BASES } = require('../lib/airtable-tables');
const { commitTable } = require('../lib/mirror-write');

const ME = BASES.ME;
const FROM = ME.tables.FINANCE;
const TO = ME.tables.COST_MODEL;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }
  const prisma = getPrisma();

  const inFinance = await prisma.$queryRaw`
    SELECT "recordId", "fields"::text AS raw, "createdTime", "position"
    FROM "AirtableRecord"
    WHERE "baseId" = ${ME.defaultBaseId} AND "tableId" = ${FROM}
      AND "fields"->>'Cost Component' IS NOT NULL
    ORDER BY "position", "recordId"`;

  const inCostModel = await prisma.$queryRaw`
    SELECT "recordId", "fields"::text AS raw, "createdTime", "position"
    FROM "AirtableRecord"
    WHERE "baseId" = ${ME.defaultBaseId} AND "tableId" = ${TO}
    ORDER BY "position", "recordId"`;

  console.log(`ME.FINANCE cost rows:   ${inFinance.length}`);
  console.log(`ME.COST_MODEL rows:     ${inCostModel.length}`);

  // Union by recordId, preferring whatever is already in the destination, so
  // a second run after a completed move re-commits the same rows rather than
  // committing an empty set and deleting them.
  const byId = new Map();
  for (const r of inFinance) byId.set(r.recordId, r);
  for (const r of inCostModel) byId.set(r.recordId, r);
  const source = [...byId.values()];

  if (!source.length) {
    console.error('Nothing to move and nothing already moved. Refusing to write an empty table.');
    await prisma.$disconnect();
    return 1;
  }

  console.log(`to commit into ME.COST_MODEL: ${source.length}`);
  for (const r of source) console.log('  ·', r.recordId, JSON.parse(r.raw)['Cost Component']);

  if (dryRun) { console.log('\n(dry run — nothing written)'); await prisma.$disconnect(); return 0; }

  // Write through commitTable, never a raw INSERT. lib/mirror.js only serves a
  // table that has a successful SyncRun row, so rows inserted directly are
  // invisible to every page: the destination looks permanently empty while the
  // data sits in the database. commitTable records the run as it writes.
  const records = source.map(r => ({
    recordId: r.recordId,
    fields: JSON.parse(r.raw),
    createdTime: r.createdTime,
    position: r.position,
  }));
  await commitTable(prisma, {
    baseKey: 'ME', tableKey: 'COST_MODEL',
    baseId: ME.defaultBaseId, tableId: TO,
    records, replace: true, source: 'move-me-cost-model',
  });

  // Only remove the originals once every copy is confirmed present, so an
  // interrupted run can never lose the quote.
  const confirmed = await prisma.$queryRaw`
    SELECT "recordId" FROM "AirtableRecord"
    WHERE "baseId" = ${ME.defaultBaseId} AND "tableId" = ${TO}`;
  const confirmedIds = new Set(confirmed.map(r => r.recordId));
  const missing = source.filter(r => !confirmedIds.has(r.recordId));
  if (missing.length) {
    console.error(`\nABORTED before delete: ${missing.length} rows did not copy across.`);
    await prisma.$disconnect();
    return 1;
  }

  const deleted = await prisma.$executeRaw`
    DELETE FROM "AirtableRecord"
    WHERE "baseId" = ${ME.defaultBaseId} AND "tableId" = ${FROM}
      AND "fields"->>'Cost Component' IS NOT NULL`;

  console.log(`\nME.COST_MODEL  ${confirmedIds.size} rows`);
  console.log(`ME.FINANCE     ${deleted} cost rows removed`);
  await prisma.$disconnect();
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.error(e); process.exit(1); });
