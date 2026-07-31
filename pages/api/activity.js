/**
 * GET /api/activity — the evidence trail behind Capture.
 *
 * Returns recent capture/sync runs (the receipts), per-base freshness, and
 * per-UK-section freshness — so badges and the Recent Captures list can show
 * WHERE data landed, WHEN, HOW it arrived, and how it compares to the run
 * before. Built entirely on SyncRun; no Airtable involvement.
 */
import { getPrisma, isConfigured } from '../../lib/prisma';
import { UK_TABLES } from '../../lib/airtable-tables';

/* Which tables make up each UK section — drives the section-pill dots. */
const UK_SECTION_TABLES = {
  amazon: ['AMAZON', 'AMAZON_CAT', 'AMAZON_DAILY_PNL', 'AMAZON_ASIN_DAILY', 'AMAZON_ORDERS', 'RSP_TRACKER', 'PPC', 'REVIEWS', 'VINE', 'AMAZON_DISBURSEMENTS'],
  shopify: ['ORDERS', 'SHOPIFY', 'SHOPIFY_DAILY_PNL', 'DISCOUNTS', 'REFUNDS', 'PAYOUTS', 'SUBSCRIPTIONS', 'SUBSCRIBERS', 'CUSTOMERS'],
  warehouse: ['STOCK', 'BIONATURE', 'INBOUND', 'PRODUCT_COSTS'],
};

/* Where a table's data is viewable — receipts link straight to the evidence. */
function viewLink(baseKey, tableKey) {
  if (baseKey === 'UK') {
    for (const [section, keys] of Object.entries(UK_SECTION_TABLES)) {
      if (keys.includes(tableKey)) return `/uk?s=${section}`;
    }
    return '/uk';
  }
  const map = { SA: '/sa', ME: '/me', PT: '/pt', GLOBAL: '/kb', AFF: '/uk?s=shopify', PB: '/partner-brands' };
  return map[baseKey] || '/';
}

const LABELS = {
  AMAZON_DAILY_PNL: 'Amazon Daily P&L', AMAZON_ASIN_DAILY: 'Amazon ASIN Daily',
  AMAZON_ORDERS: 'Amazon Orders', AMAZON_CAT: 'Amazon Catalogue', AMAZON: 'Amazon FBA',
  RSP_TRACKER: 'RSP Tracker', ORDERS: 'Shopify Orders', STOCK: 'Stock on Hand',
  BIONATURE: 'Bio-nature Batches', PRODUCT_COSTS: 'Product Costs', TASKS: 'Tasks',
  RISKS: 'Risks', PRIORITIES: 'Priorities', MEETINGS: 'Meetings',
};

const SOURCE_LABELS = {
  upload: 'file capture', xlsx: 'Excel capture', pdf: 'PDF capture', paste: 'paste capture',
  sb: 'sellerboard capture', shopify: 'Shopify sync', ingest: 'scheduler', airtable: 'Airtable sync',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isConfigured()) return res.status(200).json({ recent: [], bases: {}, ukSections: {} });

  const prisma = getPrisma();
  try {
    const runs = await prisma.syncRun.findMany({
      where: { status: 'ok' },
      orderBy: { startedAt: 'desc' },
      take: 400,
      select: { baseKey: true, tableKey: true, source: true, recordCount: true, deleted: true, finishedAt: true, startedAt: true },
    });

    // Freshness maps: newest ok run per base, and per UK section.
    const bases = {};
    const ukSections = {};
    for (const r of runs) {
      const t = (r.finishedAt || r.startedAt).toISOString();
      if (!bases[r.baseKey]) bases[r.baseKey] = t;
      if (r.baseKey === 'UK') {
        for (const [section, keys] of Object.entries(UK_SECTION_TABLES)) {
          if (keys.includes(r.tableKey) && !ukSections[section]) ukSections[section] = t;
        }
      }
    }

    // Receipts: latest 25 runs, each compared to the previous run of the same table.
    const recent = runs.slice(0, 25).map(r => {
      const prev = runs.find(p =>
        p !== r && p.baseKey === r.baseKey && p.tableKey === r.tableKey &&
        (p.finishedAt || p.startedAt) < (r.finishedAt || r.startedAt));
      return {
        table: `${r.baseKey}.${r.tableKey}`,
        label: LABELS[r.tableKey] || r.tableKey.replaceAll('_', ' '),
        baseKey: r.baseKey,
        source: SOURCE_LABELS[r.source] || r.source || 'sync',
        records: r.recordCount,
        replaced: r.deleted,
        prevRecords: prev ? prev.recordCount : null,
        at: (r.finishedAt || r.startedAt).toISOString(),
        href: viewLink(r.baseKey, r.tableKey),
      };
    });

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ recent, bases, ukSections });
  } catch (err) {
    console.error('[api/activity]', err.message);
    return res.status(200).json({ recent: [], bases: {}, ukSections: {} });
  }
}
