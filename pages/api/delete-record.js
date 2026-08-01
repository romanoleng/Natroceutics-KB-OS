/**
 * DELETE /api/delete-record — remove one record from the mirror.
 *
 * Only possible now the OS owns its data: deleting an Airtable-backed row used
 * to be pointless because the next sync brought it straight back.
 *
 * Two safeguards, because delete is the one action with no undo:
 *
 *   1. It returns the deleted row. The caller keeps it in memory and can offer
 *      a real Undo by POSTing it back, so a misfire costs a tap rather than a
 *      record.
 *   2. Tables still fed by an Airtable sync are refused. Deleting there would
 *      look like it worked and silently reverse on the next `npm run sync`,
 *      which is worse than not offering the button at all.
 */
import { getPrisma, isConfigured } from '../../lib/prisma';
import { invalidateMirrorCache } from '../../lib/mirror';
import { BASES, resolveBaseId, isNativeTable } from '../../lib/airtable-tables';

const ALLOWED_BASES = new Set(
  Object.values(BASES).flatMap(b => [b.defaultBaseId, resolveBaseId(b.envVar)]).filter(Boolean)
);

/**
 * Tables safe to delete from: OS-native ones, plus the task and note tables we
 * now own outright. Everything else is still a mirror of Airtable.
 */
const DELETABLE_TABLE_KEYS = new Set([
  'TASKS', 'PRIORITIES', 'RISKS', 'MEETINGS', 'KNOWLEDGE',
]);

function isDeletable(tableId) {
  if (isNativeTable(tableId)) return true;
  for (const b of Object.values(BASES)) {
    for (const [key, id] of Object.entries(b.tables)) {
      if (id === tableId) return DELETABLE_TABLE_KEYS.has(key);
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { baseId, tableId, recordId, restore } = req.body || {};
  if (!baseId || !tableId || !recordId) {
    return res.status(400).json({ error: 'Missing baseId, tableId or recordId' });
  }
  if (!ALLOWED_BASES.has(baseId)) return res.status(403).json({ error: 'Base not permitted' });
  if (!isConfigured()) return res.status(500).json({ error: 'No database configured' });

  const prisma = getPrisma();

  try {
    /* Undo: put a previously deleted row back exactly as it was. */
    if (req.method === 'POST' && restore) {
      await prisma.$executeRaw`
        INSERT INTO "AirtableRecord"
          ("baseId","tableId","recordId","fields","createdTime","position","syncToken","syncedAt")
        VALUES (${baseId}, ${tableId}, ${recordId}, ${JSON.stringify(restore)}::json,
                null, 0, ${'restore-' + Date.now()}, (now() at time zone 'utc'))
        ON CONFLICT ("baseId","tableId","recordId") DO UPDATE SET "fields" = EXCLUDED."fields"`;
      invalidateMirrorCache();
      return res.status(200).json({ restored: true });
    }

    if (!isDeletable(tableId)) {
      return res.status(409).json({
        error: 'This table is still synced from Airtable, so a delete here would reappear on the next sync. Delete it in Airtable instead.',
      });
    }

    const rows = await prisma.$queryRaw`
      SELECT "fields"::text AS f FROM "AirtableRecord"
      WHERE "baseId" = ${baseId} AND "tableId" = ${tableId} AND "recordId" = ${recordId} LIMIT 1`;
    if (!rows.length) return res.status(404).json({ error: 'Record not found' });

    const deleted = JSON.parse(rows[0].f);

    await prisma.$executeRaw`
      DELETE FROM "AirtableRecord"
      WHERE "baseId" = ${baseId} AND "tableId" = ${tableId} AND "recordId" = ${recordId}`;

    invalidateMirrorCache();
    // Returned so the caller can offer a genuine Undo, not a confirmation.
    return res.status(200).json({ deleted: true, record: deleted });
  } catch (e) {
    console.error('[delete-record]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
