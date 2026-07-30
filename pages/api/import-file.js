/**
 * POST /api/import-file — the engine behind the /upload page.
 *
 * Body: { filename, content } (file text, JSON-encoded).
 * Detects the file type by HEADER SIGNATURE (sellerboard dashboard-by-day,
 * dashboard-by-product, orders, stock history, or an RSP competitor sheet),
 * builds mirror records with the same field names the Airtable sync produces,
 * and upserts them into Postgres. The dashboards serve the new data on the
 * next page load — no deploy, no AI, no terminal.
 *
 * Auth: middleware.js already gates every /api/* route behind the kb-auth
 * cookie (only /api/login is exempt), so a valid session is required.
 */
import { getPrisma, isConfigured } from '../../lib/prisma';
import { parseSellerboardFile } from '../../lib/sellerboard';
import { commitTable } from '../../lib/mirror-write';
import { BASES } from '../../lib/airtable-tables';

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};

/** ASIN → product name map from whatever ASIN-daily data is already mirrored. */
async function loadAsinNames(prisma) {
  const map = new Map();
  try {
    const rows = await prisma.$queryRaw`
      SELECT DISTINCT ON ("fields"->>'ASIN')
             "fields"->>'ASIN' AS asin, "fields"->>'Product Name' AS name
      FROM "AirtableRecord"
      WHERE "tableId" = ${'tblJNHtfGobCw3a4S'} AND "fields"->>'ASIN' IS NOT NULL
    `;
    for (const r of rows) if (r.asin && r.name) map.set(r.asin, r.name);
  } catch { /* cosmetic only — orders fall back to showing the ASIN */ }
  return map;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isConfigured()) return res.status(500).json({ error: 'No database configured (DATABASE_URL missing)' });

  const { filename, content } = req.body || {};
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Missing file content' });
  }

  const prisma = getPrisma();

  try {
    const asinNames = await loadAsinNames(prisma);
    const parsed = parseSellerboardFile(content, { asinNames });

    if (!parsed) {
      return res.status(422).json({
        error: 'File not recognised',
        detail:
          'The header row does not match any known export. Supported: sellerboard ' +
          'Dashboard by day, Dashboard by product, Orders, Stock history, and the ' +
          'RSP competitor sheet (tab-separated).',
        filename: filename || null,
      });
    }
    if (!parsed.records.length) {
      return res.status(422).json({ error: 'Recognised the file but found no usable rows', filename: filename || null });
    }

    const { type, records } = parsed;
    const { written, deleted } = await commitTable(prisma, {
      baseKey: 'UK',
      tableKey: type.tableKey,
      baseId: BASES.UK.defaultBaseId,
      tableId: type.tableId,
      records,
      replace: true,
      source: 'upload',
    });

    const dates = records.map(r => r.fields.Date).filter(Boolean).sort();
    return res.status(200).json({
      ok: true,
      filename: filename || null,
      detected: type.label,
      table: `UK.${type.tableKey}`,
      written,
      replaced: deleted,
      dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    });
  } catch (err) {
    console.error('[api/import-file]', err.message);
    return res.status(500).json({ error: 'Import failed', detail: err.message });
  }
}
