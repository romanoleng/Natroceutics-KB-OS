/**
 * Write side of the Postgres mirror — upsert a full table's records and mark
 * the table synced. Shared by the /upload API route; the CLI import scripts
 * carry the same pattern.
 */
const { Prisma } = require('@prisma/client');
const { invalidateMirrorCache } = require('./mirror');

const UPSERT_BATCH = 400;

async function upsertRecords(prisma, baseId, tableId, records, syncToken) {
  for (let i = 0; i < records.length; i += UPSERT_BATCH) {
    const batch = records.slice(i, i + UPSERT_BATCH);
    const values = batch.map((r, j) => Prisma.sql`(
      ${baseId}, ${tableId}, ${r.recordId},
      ${JSON.stringify(r.fields)}::json,
      ${r.createdTime ?? null}::text, ${i + j}::int, ${syncToken}, (now() at time zone 'utc')
    )`);
    await prisma.$executeRaw`
      INSERT INTO "AirtableRecord"
        ("baseId","tableId","recordId","fields","createdTime","position","syncToken","syncedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("baseId","tableId","recordId") DO UPDATE SET
        "fields"    = EXCLUDED."fields",
        "createdTime" = EXCLUDED."createdTime",
        "position"  = EXCLUDED."position",
        "syncToken" = EXCLUDED."syncToken",
        "syncedAt"  = EXCLUDED."syncedAt"
    `;
  }
}

/**
 * Upsert `records` into a table and record the SyncRun that makes the mirror
 * serve it. With `replace` (default), rows not in this batch are deleted —
 * the batch IS the table. Without it, existing rows outside the batch survive.
 */
async function commitTable(prisma, { baseKey, tableKey, baseId, tableId, records, replace = true, source = 'upload' }) {
  const syncToken = `${source}-${Date.now()}-${tableKey}`;
  await upsertRecords(prisma, baseId, tableId, records, syncToken);

  let deleted = 0;
  if (replace) {
    ({ count: deleted } = await prisma.airtableRecord.deleteMany({
      where: { baseId, tableId, syncToken: { not: syncToken } },
    }));
  }

  await prisma.syncRun.create({
    data: {
      baseKey, tableKey, baseId, tableId,
      status: 'ok', recordCount: records.length, deleted,
      startedAt: new Date(), finishedAt: new Date(),
    },
  });

  // Make the newly-synced table visible to this server process immediately.
  invalidateMirrorCache();

  return { written: records.length, deleted };
}

module.exports = { commitTable, upsertRecords };
