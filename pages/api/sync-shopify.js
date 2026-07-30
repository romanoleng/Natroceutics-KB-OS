/**
 * POST /api/sync-shopify — pull orders straight from the Shopify Admin API
 * into the database, on demand. The "Sync Shopify" button on the UK → Shopify
 * → Orders tab calls this.
 *
 * Runs where the Shopify credentials actually live (Vercel injects
 * SHOPIFY_SHOP_URL / SHOPIFY_ADMIN_TOKEN at runtime), so it works regardless
 * of what any local machine has. No Airtable involvement at all.
 *
 * Upserts by Order Number and does NOT delete anything: each sync adds new
 * orders and refreshes existing ones (financial/fulfilment status changes),
 * while orders older than the pull window stay untouched.
 *
 * Auth: middleware.js gates every /api/* route behind the kb-auth cookie.
 */
import { getShopifyOrdersLive } from '../../lib/shopify';
import { commitTable } from '../../lib/mirror-write';
import { getPrisma, isConfigured } from '../../lib/prisma';
import { BASES, UK_TABLES, realEnv } from '../../lib/airtable-tables';

const MAX_ORDERS = 500;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isConfigured()) return res.status(500).json({ error: 'No database configured (DATABASE_URL missing)' });

  // realEnv treats `vercel env pull` placeholders ("[SENSITIVE]") as unset, so
  // a machine without real credentials gets a clean 501 instead of a DNS error.
  if (!realEnv('SHOPIFY_SHOP_URL') || !realEnv('SHOPIFY_ADMIN_TOKEN')) {
    return res.status(501).json({
      error: 'Shopify is not configured',
      detail: 'SHOPIFY_SHOP_URL / SHOPIFY_ADMIN_TOKEN are not set in this environment.',
    });
  }

  try {
    const orders = await getShopifyOrdersLive({ maxOrders: MAX_ORDERS });

    if (orders === null) {
      return res.status(501).json({
        error: 'Shopify is not configured',
        detail: 'SHOPIFY_SHOP_URL / SHOPIFY_ADMIN_TOKEN are not set in this environment.',
      });
    }
    if (!orders.length) {
      return res.status(200).json({ ok: true, written: 0, detail: 'Shopify returned no orders.' });
    }

    const records = orders
      .filter(o => o['Order Number'])
      .map(o => {
        // The GraphQL node id is internal plumbing; everything else is already
        // in the exact field shape the dashboard reads.
        const { id, ...fields } = o;
        return { recordId: String(fields['Order Number']), fields };
      });

    const { written } = await commitTable(getPrisma(), {
      baseKey: 'UK',
      tableKey: 'ORDERS',
      baseId: BASES.UK.defaultBaseId,
      tableId: UK_TABLES.ORDERS,
      records,
      // Additive on purpose — see file comment.
      replace: false,
      source: 'shopify',
    });

    const dates = records.map(r => r.fields['Order Date']).filter(Boolean).sort();
    return res.status(200).json({
      ok: true,
      written,
      dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    });
  } catch (err) {
    console.error('[api/sync-shopify]', err.message);
    return res.status(502).json({ error: 'Shopify sync failed', detail: err.message });
  }
}
