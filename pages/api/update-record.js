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
import { tableVerdict, rowEditable, fieldEditable } from '../../lib/editability';

/** baseId+tableId back to the registry keys, so the guard can name the table. */
function keysFor(baseId, tableId) {
  for (const [baseKey, b] of Object.entries(BASES)) {
    if (b.defaultBaseId !== baseId && resolveBaseId(b.envVar) !== baseId) continue;
    for (const [tableKey, id] of Object.entries(b.tables || {})) {
      if (id === tableId) return { baseKey, tableKey };
    }
  }
  return null;
}

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

  // The editability rule is enforced HERE, not only in the UI. A control that
  // is hidden is a suggestion; an API that refuses is a guarantee, and this is
  // the path every edit surface in the OS goes through.
  const keys = keysFor(baseId, tableId);
  if (keys) {
    const v = tableVerdict(keys.baseKey, keys.tableKey);
    if (v.verdict === 'feed') {
      return res.status(409).json({
        error: `${keys.baseKey}.${keys.tableKey} is maintained by a feed`,
        detail: v.reason,
      });
    }
    if (!rowEditable(keys.baseKey, keys.tableKey, recordId)) {
      return res.status(409).json({
        error: 'This row is maintained by a feed',
        detail: v.reason,
      });
    }
    const blocked = Object.keys(fields).filter(k => !fieldEditable(keys.baseKey, keys.tableKey, k));
    if (blocked.length) {
      return res.status(409).json({
        error: `Fields maintained by a feed: ${blocked.join(', ')}`,
        detail: v.reason,
      });
    }
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
    // Log the fields that change what a task IS, not just its status. Moving a
    // due date silently left no trace, so a date that had been pushed twice
    // looked identical to one nobody had touched.
    const LOGGED = ['Status', 'Due Date', 'Owner', 'Priority', 'Snoozed Until'];
    const changed = LOGGED.filter(k => fields[k] !== undefined && fields[k] !== current[k]);
    if (changed.length) {
      const stamp = new Date().toISOString();
      merged['Last Note At'] = stamp;
      const when = stamp.slice(0, 16).replace('T', ' ');
      const entries = changed.map(k => {
        const to = fields[k] === '' || fields[k] === null ? 'cleared' : fields[k];
        const from = current[k];
        return `${k} → ${to}${from ? ` (was ${from})` : ''} · ${when}`;
      });
      merged['Activity Log'] = [current['Activity Log'], ...entries].filter(Boolean).join('\n');
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
