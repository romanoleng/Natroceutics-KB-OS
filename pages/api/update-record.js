/**
 * PATCH /api/update-record — update one record's fields.
 *
 * Writes to POSTGRES, not Airtable. The mirror stopped being a cache on
 * 1 Aug 2026 and became the source of truth: Airtable Free allows 1,000 API
 * calls per month for the whole workspace, and a dashboard that spends them on
 * status edits is a dashboard that stops working mid-month.
 *
 * Rows are stored as a JSON blob per record, so an update is read-merge-write
 * rather than a column update. Merging (not replacing) matters: the caller
 * sends only the fields it changed.
 *
 * Airtable remains the upstream for a full re-sync, so a record edited here
 * would be overwritten by the next `npm run sync` of that table. That is
 * accepted and deliberate — post-migration the sync is a rescue tool, not a
 * routine, and `--only-missing` skips tables that already have data.
 */
import { getPrisma, isConfigured } from '../../lib/prisma';
import { invalidateMirrorCache } from '../../lib/mirror';
import { BASES, resolveBaseId } from '../../lib/airtable-tables';

/** Base IDs we accept writes for — every registered base, env override included. */
const ALLOWED_BASES = new Set(
  Object.values(BASES)
    .flatMap(b => [b.defaultBaseId, resolveBaseId(b.envVar)])
    .filter(Boolean)
);

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { baseId, tableId, recordId, fields } = req.body || {};

  if (!baseId || !tableId || !recordId || !fields) {
    return res.status(400).json({ error: 'Missing required fields: baseId, tableId, recordId, fields' });
  }
  if (typeof fields !== 'object' || Array.isArray(fields)) {
    return res.status(400).json({ error: 'fields must be an object' });
  }
  if (!ALLOWED_BASES.has(baseId)) {
    console.error('[update-record] Rejected base:', baseId, '— not in allowed list');
    return res.status(403).json({ error: 'Base not permitted' });
  }
  if (!isConfigured()) {
    return res.status(500).json({ error: 'No database configured (DATABASE_URL missing)' });
  }

  const prisma = getPrisma();

  try {
    const existing = await prisma.$queryRaw`
      SELECT "fields"::text AS raw
      FROM "AirtableRecord"
      WHERE "baseId" = ${baseId} AND "tableId" = ${tableId} AND "recordId" = ${recordId}
      LIMIT 1`;

    if (!existing.length) {
      return res.status(404).json({ error: 'Record not found' });
    }

    let current;
    try {
      current = JSON.parse(existing[0].raw);
    } catch {
      return res.status(500).json({ error: 'Stored record is not valid JSON' });
    }

    // Merge, never replace — callers send only what changed.
    const merged = { ...current, ...fields };

    // Status changes used to post an Airtable comment. Keep the audit trail
    // in the row itself, where it costs nothing and survives the migration.
    if (fields.Status && fields.Status !== current.Status) {
      const stamp = new Date().toISOString();
      merged['Last Note At'] = stamp;
      const entry = `Status → ${fields.Status} · ${stamp.slice(0, 16).replace('T', ' ')}`;
      merged['Activity Log'] = current['Activity Log']
        ? `${current['Activity Log']}\n${entry}`
        : entry;
    }

    await prisma.$executeRaw`
      UPDATE "AirtableRecord"
      SET "fields" = ${JSON.stringify(merged)}::json,
          "syncedAt" = (now() at time zone 'utc')
      WHERE "baseId" = ${baseId} AND "tableId" = ${tableId} AND "recordId" = ${recordId}`;

    invalidateMirrorCache();

    return res.status(200).json({ success: true, fields: merged });
  } catch (e) {
    console.error('[update-record]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
