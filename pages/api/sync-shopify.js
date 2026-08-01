/**
 * POST /api/sync-shopify — refresh Shopify from inside the OS, no terminal.
 * The "Sync Shopify" button on UK → Shopify → Orders calls this.
 *
 * Rewritten 1 Aug 2026. The old version authenticated with a long-lived
 * SHOPIFY_ADMIN_TOKEN, which Shopify no longer issues, so the button could only
 * ever report failure. Auth now goes through lib/shopify-auth.js, which mints a
 * 24-hour token from client credentials on each call.
 *
 * Upserts by Order Number and deletes nothing: each run adds new orders and
 * refreshes existing ones, while orders outside the window stay untouched.
 *
 * Auth: middleware.js gates every /api/* route behind the kb-auth cookie.
 */
import { commitTable } from '../../lib/mirror-write';
import { getPrisma, isConfigured } from '../../lib/prisma';
import { BASES, UK_TABLES } from '../../lib/airtable-tables';
import { shopifyGraphQL, isConfigured as shopifyReady } from '../../lib/shopify-auth';

const MAX_ORDERS = 500;

const ORDERS_Q = `query O($after: String) {
  orders(first: 50, after: $after, sortKey: PROCESSED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      name processedAt cancelledAt test
      currentTotalPriceSet { shopMoney { amount } }
      totalDiscountsSet { shopMoney { amount } }
      totalRefundedSet { shopMoney { amount } }
      displayFinancialStatus displayFulfillmentStatus
      customer { displayName }
      lineItems(first: 10) { nodes { title quantity sku } }
    }
  }
}`;

/**
 * Newest orders first, capped. Cancelled and test orders are excluded: they are
 * not revenue, and counting them made the July order count disagree with
 * Shopify's own admin.
 */
async function fetchRecentOrders() {
  const out = [];
  let after = null, more = true;
  while (more && out.length < MAX_ORDERS) {
    const d = await shopifyGraphQL(ORDERS_Q, { after });
    for (const o of d.orders.nodes) {
      if (o.cancelledAt || o.test) continue;
      const date = String(o.processedAt).slice(0, 10);
      out.push({
        'Order Number': o.name,
        'Customer Name': o.customer?.displayName || '',
        'Order Date': date,
        Month: date.slice(0, 7),
        'Gross Total (£)': Number(o.currentTotalPriceSet?.shopMoney?.amount) || 0,
        'Discount Amount (£)': Number(o.totalDiscountsSet?.shopMoney?.amount) || 0,
        'Refund Amount (£)': Number(o.totalRefundedSet?.shopMoney?.amount) || 0,
        'Financial Status': o.displayFinancialStatus || '',
        'Fulfilment Status': o.displayFulfillmentStatus || '',
        'Line Items': (o.lineItems?.nodes || [])
          .map(li => `${li.title} × ${li.quantity}${li.sku ? ` (${li.sku})` : ''}`).join(', '),
      });
    }
    ({ hasNextPage: more, endCursor: after } = d.orders.pageInfo);
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isConfigured()) return res.status(500).json({ error: 'No database configured (DATABASE_URL missing)' });

  // Shopify retired long-lived custom-app tokens: credentials are a client ID
  // and secret now, exchanged for a short-lived token per call.
  if (!shopifyReady()) {
    return res.status(501).json({
      error: 'Shopify is not connected',
      detail: 'Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET from the Shopify Dev Dashboard.',
    });
  }

  try {
    const orders = await fetchRecentOrders();
    if (!orders.length) {
      return res.status(200).json({ ok: true, written: 0, detail: 'Shopify returned no orders.' });
    }

    const records = orders
      .filter(o => o['Order Number'])
      .map(o => ({ recordId: String(o['Order Number']), fields: o }));

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
