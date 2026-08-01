/**
 * POST /api/ingest — machine-to-machine record ingestion.
 *
 * Built for the Natro-OS-Data-Fetch scheduler (the renamed email-capture
 * agent): it scans Outlook, classifies emails exactly as it always has, and
 * POSTs the parsed records here instead of writing to Airtable.
 *
 * Auth: `Authorization: Bearer <INGEST_TOKEN>` — no cookie involved.
 * middleware.js lets /api/ingest through specifically so this check is the
 * gate; if INGEST_TOKEN is unset in the environment, everything is rejected.
 *
 * Body:
 * {
 *   "table":   "UK.TASKS",              // BASE.TABLE key from the registry
 *   "records": [ { "fields": {...}, "recordId": "optional" } ],
 *   "keyField": "Order Number",         // optional — derive recordId from this field
 *   "replace":  false                   // default false: additive upsert
 * }
 *
 * recordId precedence: explicit recordId → keyField value → sha1 of the field
 * bag (stable, so resending identical content cannot duplicate).
 */
import { createHash } from 'crypto';
import { getPrisma, isConfigured } from '../../lib/prisma';
import { commitTable } from '../../lib/mirror-write';
import { BASES, realEnv } from '../../lib/airtable-tables';

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // More than one token, so each caller can be revoked on its own.
  //
  // The scheduled Outlook and Granola pulls run outside this codebase and hold
  // their credential in someone else's config. Handing them the same token the
  // Capture page uses would mean a leak there costs every ingest path at once.
  // A second variable costs nothing and makes revocation a one-line change.
  const accepted = [
    realEnv('INGEST_TOKEN'),
    realEnv('INGEST_TOKEN_SCHEDULER'),
  ].filter(Boolean).map(t => t.trim());
  const got = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!accepted.length || !got || !accepted.includes(got)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!isConfigured()) return res.status(500).json({ error: 'No database configured' });

  const { table, records, keyField, replace = false } = req.body || {};

  const [baseKey, tableKey] = String(table || '').split('.');
  const base = BASES[baseKey];
  const tableId = base?.tables?.[tableKey];
  if (!tableId) {
    return res.status(400).json({
      error: `Unknown table "${table}"`,
      detail: 'Use BASE.TABLE, e.g. "UK.TASKS". Bases: ' + Object.keys(BASES).join(', '),
    });
  }

  if (!Array.isArray(records) || !records.length) {
    return res.status(400).json({ error: 'records must be a non-empty array' });
  }
  if (records.length > 5000) {
    return res.status(400).json({ error: 'Too many records in one call (max 5000) — split the batch' });
  }

  try {
    const prepared = [];
    for (const r of records) {
      const fields = r?.fields;
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        return res.status(400).json({ error: 'Every record needs a fields object' });
      }
      let recordId = r.recordId ? String(r.recordId) : null;
      if (!recordId && keyField && fields[keyField] !== undefined && fields[keyField] !== '') {
        recordId = String(fields[keyField]);
      }
      if (!recordId) {
        recordId = 'h:' + createHash('sha1').update(JSON.stringify(fields)).digest('hex').slice(0, 20);
      }
      prepared.push({ recordId, fields });
    }

    const { written, deleted } = await commitTable(getPrisma(), {
      baseKey, tableKey,
      baseId: base.defaultBaseId,
      tableId,
      records: prepared,
      replace: Boolean(replace),
      source: 'ingest',
    });

    return res.status(200).json({ ok: true, table, written, replaced: deleted });
  } catch (err) {
    console.error('[api/ingest]', err.message);
    return res.status(500).json({ error: 'Ingest failed', detail: err.message });
  }
}
