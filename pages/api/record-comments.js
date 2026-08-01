/**
 * /api/record-comments
 * GET  ?baseId=&tableId=&recordId=          — list comments on a record
 * POST { baseId, tableId, recordId, text }  — add a comment
 *
 * Comments live in Postgres now, in the record's own JSON under `Comments`.
 * Previously they used Airtable's comments endpoint, which cost two API calls
 * per note (post + a PATCH to touch "Last Note At") against a 1,000-call
 * monthly workspace budget, and required the PAT to carry the
 * data.recordComments scope — which it often did not, hence the
 * `permissionsError` soft-fail the UI still understands.
 *
 * Comments written before the 1 Aug 2026 migration lived only in Airtable and
 * are not carried over; new notes start here.
 */
import { randomUUID } from 'crypto';
import { getPrisma, isConfigured } from '../../lib/prisma';
import { invalidateMirrorCache } from '../../lib/mirror';
import { BASES, resolveBaseId } from '../../lib/airtable-tables';

const ALLOWED_BASES = new Set(
  Object.values(BASES)
    .flatMap(b => [b.defaultBaseId, resolveBaseId(b.envVar)])
    .filter(Boolean)
);

/** Read one record's JSON blob, or null when it does not exist. */
async function readRecord(prisma, baseId, tableId, recordId) {
  const rows = await prisma.$queryRaw`
    SELECT "fields"::text AS raw
    FROM "AirtableRecord"
    WHERE "baseId" = ${baseId} AND "tableId" = ${tableId} AND "recordId" = ${recordId}
    LIMIT 1`;
  if (!rows.length) return null;
  try { return JSON.parse(rows[0].raw); } catch { return null; }
}

export default async function handler(req, res) {
  const { baseId, tableId, recordId } = req.method === 'GET' ? req.query : (req.body || {});

  if (!baseId || !tableId || !recordId) {
    return res.status(400).json({ error: 'Missing baseId, tableId, or recordId' });
  }
  if (!ALLOWED_BASES.has(baseId)) {
    return res.status(403).json({ error: 'Base not permitted' });
  }
  if (!isConfigured()) {
    return res.status(500).json({ error: 'No database configured (DATABASE_URL missing)' });
  }

  const prisma = getPrisma();

  try {
    /* ── GET: list comments ─── */
    if (req.method === 'GET') {
      const record = await readRecord(prisma, baseId, tableId, recordId);
      if (!record) return res.json({ comments: [] });
      return res.json({ comments: Array.isArray(record.Comments) ? record.Comments : [] });
    }

    /* ── POST: add comment ─── */
    if (req.method === 'POST') {
      const { text } = req.body || {};
      if (!text?.trim()) return res.status(400).json({ error: 'No text provided' });

      const record = await readRecord(prisma, baseId, tableId, recordId);
      if (!record) return res.status(404).json({ error: 'Record not found' });

      const now = new Date().toISOString();
      const comment = {
        id: `os:${randomUUID().slice(0, 8)}`,
        text: text.trim(),
        createdTime: now,
        author: { name: 'Romano' },   // single-user OS; shape kept for the panel
      };

      const merged = {
        ...record,
        Comments: [...(Array.isArray(record.Comments) ? record.Comments : []), comment],
        'Last Note At': now,
      };

      await prisma.$executeRaw`
        UPDATE "AirtableRecord"
        SET "fields" = ${JSON.stringify(merged)}::json,
            "syncedAt" = (now() at time zone 'utc')
        WHERE "baseId" = ${baseId} AND "tableId" = ${tableId} AND "recordId" = ${recordId}`;

      invalidateMirrorCache();
      return res.json({ comment });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[record-comments]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
