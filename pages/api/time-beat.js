/**
 * POST /api/time-beat — a 60-second "I am still here" from an open OS tab.
 *
 * Beats coalesce into SESSIONS rather than being stored one by one: a beat
 * within six minutes of the last one extends the open session, anything longer
 * starts a new one. So a day of use is a handful of rows, not 480.
 *
 * Six minutes, not five: the client beats every 60s, and a phone that sleeps
 * briefly or a slow request should not shatter one session into three.
 */
import { getPrisma, isConfigured } from '../../lib/prisma';
import { BASES, resolveBaseId } from '../../lib/airtable-tables';

const GAP_MS = 6 * 60 * 1000;
const UK = BASES.UK;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isConfigured()) return res.status(200).json({ ok: false });   // never break a page

  const { path = '', at } = req.body || {};
  const now = at ? new Date(at) : new Date();
  if (Number.isNaN(now.getTime())) return res.status(400).json({ error: 'Bad timestamp' });

  const baseId = resolveBaseId(UK.envVar);
  const tableId = UK.tables.TIME_SESSIONS;

  try {
    const prisma = getPrisma();
    const day = now.toISOString().slice(0, 10);

    const rows = await prisma.$queryRaw`
      SELECT "recordId", "fields"::text AS f FROM "AirtableRecord"
      WHERE "baseId" = ${baseId} AND "tableId" = ${tableId}
      ORDER BY "recordId" DESC LIMIT 1`;

    const last = rows.length ? { recordId: rows[0].recordId, fields: JSON.parse(rows[0].f) } : null;
    const lastEnd = last ? new Date(last.fields['Ended At']) : null;
    const extend = last && lastEnd && (now - lastEnd) < GAP_MS && last.fields.Day === day;

    if (extend) {
      const started = new Date(last.fields['Started At']);
      const minutes = Math.round((now - started) / 60000);
      const paths = new Set(String(last.fields.Pages || '').split(' · ').filter(Boolean));
      if (path) paths.add(path.split('?')[0]);
      const merged = {
        ...last.fields,
        'Ended At': now.toISOString(),
        Minutes: minutes,
        Pages: [...paths].slice(0, 12).join(' · '),
        Beats: (Number(last.fields.Beats) || 0) + 1,
      };
      await prisma.$executeRaw`
        UPDATE "AirtableRecord" SET "fields" = ${JSON.stringify(merged)}::json,
          "syncedAt" = (now() at time zone 'utc')
        WHERE "baseId" = ${baseId} AND "tableId" = ${tableId} AND "recordId" = ${last.recordId}`;
      return res.status(200).json({ ok: true, session: last.recordId, minutes });
    }

    // recordId sorts chronologically so "latest session" is a cheap ORDER BY.
    const recordId = `t:${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
    const fields = {
      Day: day,
      'Started At': now.toISOString(),
      'Ended At': now.toISOString(),
      Minutes: 0,
      Pages: path ? path.split('?')[0] : '',
      Beats: 1,
      Source: 'auto',
    };
    await prisma.$executeRaw`
      INSERT INTO "AirtableRecord"
        ("baseId","tableId","recordId","fields","createdTime","position","syncToken","syncedAt")
      VALUES (${baseId}, ${tableId}, ${recordId}, ${JSON.stringify(fields)}::json,
              ${now.toISOString()}::text, 0, ${'time-' + Date.now()}, (now() at time zone 'utc'))
      ON CONFLICT ("baseId","tableId","recordId") DO NOTHING`;

    return res.status(200).json({ ok: true, session: recordId, minutes: 0 });
  } catch (e) {
    console.warn('[time-beat]', e.message);
    return res.status(200).json({ ok: false });   // tracking must never break the OS
  }
}
