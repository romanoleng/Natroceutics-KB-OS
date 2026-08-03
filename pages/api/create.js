/**
 * POST /api/create — add a Knowledge Base entry.
 *
 * Writes to Postgres, not Airtable, for the same reason as update-record: the
 * workspace has 1,000 API calls a month and none of them should go on routine
 * writes. Used by the /admin add form.
 *
 * recordId is generated locally with an `os:` prefix so a locally-created row
 * is always distinguishable from an Airtable-sourced one (`rec…`), and a later
 * sync of this table will not collide with it.
 */
import { randomUUID } from 'crypto';
import { getPrisma, isConfigured } from '../../lib/prisma';
import { invalidateMirrorCache } from '../../lib/mirror';
import { BASES, resolveBaseId } from '../../lib/airtable-tables';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fields } = req.body || {};
  if (!fields?.title) return res.status(400).json({ error: 'title is required' });
  if (!isConfigured()) {
    return res.status(500).json({ error: 'No database configured (DATABASE_URL missing)' });
  }

  const baseId = resolveBaseId(BASES.GLOBAL.envVar);
  const tableId = BASES.GLOBAL.tables.KNOWLEDGE;
  if (!baseId || !tableId) {
    return res.status(500).json({ error: 'Global knowledge table not configured' });
  }

  // recordId is varchar(32): "os:" + 26 hex chars stays inside it.
  const recordId = `os:${randomUUID().replace(/-/g, '').slice(0, 26)}`;
  const now = new Date().toISOString();
  // `Added` is what the task lists sort "newest first" on; `Date Added` predates
  // it and other record types still read that name, so both are written.
  const stored = {
    ...fields,
    'Date Added': fields['Date Added'] || now.slice(0, 10),
    Added: fields.Added || now.slice(0, 10),
  };

  try {
    const prisma = getPrisma();
    await prisma.$executeRaw`
      INSERT INTO "AirtableRecord"
        ("baseId","tableId","recordId","fields","createdTime","position","syncToken","syncedAt")
      VALUES (
        ${baseId}, ${tableId}, ${recordId},
        ${JSON.stringify(stored)}::json,
        ${now}::text, 0, ${'os-create-' + Date.now()},
        (now() at time zone 'utc')
      )`;

    invalidateMirrorCache();
    return res.status(200).json({ success: true, id: recordId });
  } catch (e) {
    console.error('[create]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
