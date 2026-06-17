/**
 * Shopify Admin API — Live Order Feed
 *
 * Requires two environment variables:
 *   SHOPIFY_SHOP_URL   = your-store.myshopify.com
 *   SHOPIFY_ADMIN_TOKEN = shpat_xxxxxxxxxxxxxxxxxxxxxxx
 *
 * How to get the token:
 *   Shopify Admin → Settings → Apps and sales channels
 *   → Develop apps → Create an app → Configure Admin API scopes
 *   → Enable: read_orders, read_customers, read_products
 *   → Install app → copy the Admin API access token
 *
 * Returns null if env vars are missing (falls back to Airtable).
 */

const GQL_ORDERS = `
  query GetOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet        { shopMoney { amount } }
          subtotalPriceSet     { shopMoney { amount } }
          totalDiscountsSet    { shopMoney { amount } }
          totalRefundedSet     { shopMoney { amount } }
          discountCodes
          paymentGatewayNames
          customer { firstName lastName email }
          channelInformation   { channelDefinition { channelName } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function normaliseOrder(node) {
  const o = node;
  const cName = o.customer
    ? `${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim()
    : '';
  return {
    id: o.id,
    'Order Number':        o.name,
    'Order Date':          o.createdAt.slice(0, 10),
    'Customer Name':       cName || '—',
    'Financial Status':    o.displayFinancialStatus,
    'Fulfilment Status':   o.displayFulfillmentStatus,
    'Gross Total (£)':     Number(o.totalPriceSet?.shopMoney?.amount    || 0),
    'Net Total (£)':       Number(o.subtotalPriceSet?.shopMoney?.amount || 0),
    'Discount Amount (£)': Number(o.totalDiscountsSet?.shopMoney?.amount || 0),
    'Refund Amount (£)':   Number(o.totalRefundedSet?.shopMoney?.amount  || 0),
    'Discount Code':       (o.discountCodes || []).join(', '),
    Channel:               o.channelInformation?.channelDefinition?.channelName || 'Online Store',
    'Payment Method':      (o.paymentGatewayNames || []).join(', '),
  };
}

export async function getShopifyOrdersLive({ maxOrders = 500 } = {}) {
  const shop  = process.env.SHOPIFY_SHOP_URL;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;

  if (!shop || !token) return null; // signal to caller: use Airtable fallback

  const endpoint = `https://${shop}/admin/api/2024-01/graphql.json`;
  const headers  = {
    'Content-Type':           'application/json',
    'X-Shopify-Access-Token': token,
  };

  const orders = [];
  let cursor  = null;
  let hasMore = true;

  while (hasMore && orders.length < maxOrders) {
    const remaining = maxOrders - orders.length;
    const pageSize  = Math.min(remaining, 250);

    const res = await fetch(endpoint, {
      method:  'POST',
      headers,
      body: JSON.stringify({
        query:     GQL_ORDERS,
        variables: { first: pageSize, after: cursor },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));

    const { edges, pageInfo } = json.data.orders;
    for (const { node } of edges) orders.push(normaliseOrder(node));

    hasMore = pageInfo.hasNextPage;
    cursor  = pageInfo.endCursor;
  }

  return orders;
}
