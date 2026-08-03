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

  const { table, records, keyField, replace = false, source, heartbeat = false } = req.body || {};

  const [baseKey, tableKey] = String(table || '').split('.');
  const base = BASES[baseKey];
  const tableId = base?.tables?.[tableKey];
  if (!tableId) {
    return res.status(400).json({
      error: `Unknown table "${table}"`,
      detail: 'Use BASE.TABLE, e.g. "UK.TASKS". Bases: ' + Object.keys(BASES).join(', '),
    });
  }

  // A scheduled feed may name itself so /status can watch it on its own
  // cadence instead of everything arriving as one anonymous "ingest". The
  // allowlist matters: an unknown caller must not be able to invent a feed
  // name, because the status page treats a named feed as something that is
  // SUPPOSED to arrive and will go red when it stops. Anything unrecognised
  // falls back to 'ingest', which reads as a manual capture and is never red.
  const FEED_SOURCES = new Set(['outlook', 'granola', 'sellerboard']);
  const feedSource = FEED_SOURCES.has(source) ? source : 'ingest';

  // "Ran, found nothing" is a successful run and has to be recorded as one.
  // Without this a quiet day is indistinguishable from a job that died, which
  // is the failure /status exists to catch — and the reason a naive cadence
  // check would cry wolf every time the mail happened to be dull.
  if (heartbeat) {
    if (feedSource === 'ingest') {
      return res.status(400).json({
        error: 'A heartbeat must name its feed',
        detail: 'Send "source" as one of: ' + [...FEED_SOURCES].join(', '),
      });
    }
    await getPrisma().syncRun.create({
      data: {
        baseKey, tableKey, baseId: base.defaultBaseId, tableId,
        status: 'ok', source: feedSource, recordCount: 0, deleted: 0,
        startedAt: new Date(), finishedAt: new Date(),
      },
    });
    return res.status(200).json({ ok: true, table, source: feedSource, heartbeat: true, written: 0 });
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
      // Accept both shapes. External callers reasonably send flat objects,
      // and rejecting them cost a scheduled run its whole batch for a reason
      // the error did not explain. A record carrying `fields` is the wrapped
      // form; anything else is treated as the fields themselves.
      const fields = r && typeof r === 'object' && !Array.isArray(r) && r.fields
        ? r.fields
        : r;
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        return res.status(400).json({
          error: 'Every record must be an object',
          detail: 'Send either { "fields": { ... } } or the field object directly.',
        });
      }
      let recordId = r.recordId ? String(r.recordId) : null;
      if (!recordId && keyField && fields[keyField] !== undefined && fields[keyField] !== '') {
        recordId = String(fields[keyField]);
      }
      if (!recordId) {
        recordId = 'h:' + createHash('sha1').update(JSON.stringify(fields)).digest('hex').slice(0, 20);
      }
      // recordId is varchar(32). A Granola ID is a 36-character UUID, so
      // using one as the key overflows the column and surfaces as an opaque
      // 500 rather than anything a caller could act on. Hash deterministically
      // instead: the same source ID always maps to the same key, so upserts
      // still deduplicate and a re-run never doubles a meeting.
      if (recordId.length > 32) {
        recordId = 'k:' + createHash('sha1').update(recordId).digest('hex').slice(0, 28);
      }
      prepared.push({ recordId, fields });
    }

    const { written, deleted } = await commitTable(getPrisma(), {
      baseKey, tableKey,
      baseId: base.defaultBaseId,
      tableId,
      records: prepared,
      replace: Boolean(replace),
      source: feedSource,
    });

    return res.status(200).json({ ok: true, table, source: feedSource, written, replaced: deleted });
  } catch (err) {
    console.error('[api/ingest]', err.message);
    return res.status(500).json({ error: 'Ingest failed', detail: err.message });
  }
}
