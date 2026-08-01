#!/usr/bin/env node
/**
 * Rebuild the Shopify UK finance tables from live Shopify data.
 *
 * This is the sellerboard equivalent for the own store. Amazon gets a complete
 * P&L handed to it every month; Shopify hands over revenue and nothing else.
 * Everything below the revenue line here is assembled from data Shopify holds
 * but never puts together:
 *
 *   COGS           InventoryItem.unitCost x units sold, per variant
 *   Payment fees   OrderTransaction.fees, SUCCESS transactions only
 *   Discounts      order.totalDiscountsSet
 *   Refunds        order.refunds
 *
 * Two rules are load-bearing and must not be relaxed:
 *
 *   1. A cost we do not have is never zero. Variants with no unitCost are
 *      excluded from COGS and the month reports its coverage, so a partial
 *      figure cannot be mistaken for a complete one.
 *   2. Fees are counted on SUCCESS transactions only. A declined card leaves a
 *      fee entry behind; counting it overstated July by roughly £15 in testing.
 *
 *   node --env-file-if-exists=.env.local scripts/shopify-pull.js --from=2026-06 --to=2026-07
 *
 * AUTH: Shopify retired admin-created custom apps, so there is no long-lived
 * `shpat_` token any more. Dev Dashboard apps mint a 24-hour token from a
 * client-credentials grant, which lib/shopify-auth.js does per run. Set
 * SHOPIFY_SHOP_URL, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.
 *
 * SCOPES: read_orders, read_products, read_inventory at minimum. Add
 * read_all_orders or Shopify silently returns only the last 60 days, which
 * makes a backfill look like an empty store rather than a permissions problem.
 */
const { getPrisma, isConfigured } = require('../lib/prisma');
const { commitTable } = require('../lib/mirror-write');
const { BASES, resolveBaseId } = require('../lib/airtable-tables');
const { shopifyGraphQL, isConfigured: shopifyReady, grantedScopes } = require('../lib/shopify-auth');

const UK = BASES.UK;
const r2 = n => Math.round(n * 100) / 100;
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || null;

// Auth lives in lib/shopify-auth.js: Dev Dashboard apps mint a 24-hour token
// from client credentials, so there is no long-lived token to store.
const gql = (query, variables) => shopifyGraphQL(query, variables);

/* ── unit costs ───────────────────────────────────────────────────────── */
const VARIANTS_Q = `query V($after: String) {
  productVariants(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { sku price product { title } inventoryItem { unitCost { amount } } }
  }
}`;

async function pullVariants() {
  const out = [];
  let after = null, more = true;
  while (more) {
    const d = await gql(VARIANTS_Q, { after });
    for (const v of d.productVariants.nodes) {
      out.push({
        sku: v.sku || '',
        title: v.product?.title || '',
        price: Number(v.price) || null,
        cost: v.inventoryItem?.unitCost ? Number(v.inventoryItem.unitCost.amount) : null,
      });
    }
    ({ hasNextPage: more, endCursor: after } = d.productVariants.pageInfo);
  }
  return out;
}

/* ── orders ───────────────────────────────────────────────────────────── */
const ORDERS_Q = `query O($after: String, $q: String!) {
  orders(first: 50, after: $after, query: $q, sortKey: PROCESSED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      name processedAt
      currentSubtotalPriceSet { shopMoney { amount } }
      totalDiscountsSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      totalTaxSet { shopMoney { amount } }
      totalRefundedSet { shopMoney { amount } }
      customer { id numberOfOrders }
      lineItems(first: 25) {
        nodes { quantity sku title
          discountedTotalSet { shopMoney { amount } }
          variant { sku inventoryItem { unitCost { amount } } } }
      }
      transactions(first: 6) { kind status fees { id amount { amount } } }
    }
  }
}`;

async function pullOrders(from, to) {
  const q = `processed_at:>=${from}-01 processed_at:<=${to}-31`;
  const out = [];
  let after = null, more = true;
  while (more) {
    const d = await gql(ORDERS_Q, { after, q });
    out.push(...d.orders.nodes);
    ({ hasNextPage: more, endCursor: after } = d.orders.pageInfo);
  }
  return out;
}

const money = m => Number(m?.shopMoney?.amount) || 0;

/** Fees on SUCCESS transactions only — a declined card still carries a fee row. */
function orderFees(o) {
  const seen = new Set();
  let total = 0;
  for (const t of o.transactions || []) {
    if (t.status !== 'SUCCESS') continue;
    if (t.kind === 'REFUND' || t.kind === 'VOID') continue;
    for (const f of t.fees || []) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      total += Number(f.amount?.amount) || 0;
    }
  }
  return total;
}

/**
 * title -> cost, only where unambiguous. ShopifyQL and this aggregation group
 * by product title; a title whose variants disagree (or where only some are
 * costed) cannot be costed without guessing which variant sold.
 */
function costByTitle(variants) {
  const byTitle = new Map();
  for (const v of variants) {
    if (!byTitle.has(v.title)) byTitle.set(v.title, []);
    byTitle.get(v.title).push(v.cost);
  }
  const out = new Map();
  for (const [title, costs] of byTitle) {
    const unique = new Set(costs);
    if (unique.size === 1 && costs[0] != null) out.set(title, costs[0]);
  }
  return out;
}

function aggregate(orders, variants) {
  const titleCost = costByTitle(variants);
  const months = new Map(), products = new Map();

  for (const o of orders) {
    const month = String(o.processedAt).slice(0, 7);
    const m = months.get(month) || {
      orders: 0, gross: 0, discounts: 0, refunds: 0, shipping: 0, tax: 0,
      fees: 0, cogs: 0, costedRev: 0, uncostedRev: 0,
    };
    m.orders++;
    m.gross += money(o.currentSubtotalPriceSet) + money(o.totalDiscountsSet);
    m.discounts += money(o.totalDiscountsSet);
    m.refunds += money(o.totalRefundedSet);
    m.shipping += money(o.totalShippingPriceSet);
    m.tax += money(o.totalTaxSet);
    m.fees += orderFees(o);

    for (const li of o.lineItems?.nodes || []) {
      const title = li.title || '';
      const rev = money(li.discountedTotalSet);
      // Prefer the variant's own cost (exact); fall back to the title map.
      const vc = li.variant?.inventoryItem?.unitCost
        ? Number(li.variant.inventoryItem.unitCost.amount)
        : (titleCost.has(title) ? titleCost.get(title) : null);

      const key = `${month}::${title}`;
      const p = products.get(key) || { month, title, units: 0, net: 0, cogs: 0, costed: true };
      p.units += li.quantity || 0;
      p.net += rev;
      if (vc == null) { p.costed = false; m.uncostedRev += rev; }
      else { p.cogs += (li.quantity || 0) * vc; m.cogs += (li.quantity || 0) * vc; m.costedRev += rev; }
      products.set(key, p);
    }
    months.set(month, m);
  }
  return { months, products };
}

function buildRecords({ months, products }, variants) {
  const crypto = require('crypto');
  const shortId = (month, title) =>
    `${month}:${crypto.createHash('sha1').update(title).digest('hex').slice(0, 12)}`;

  const pnl = [...months].map(([month, m]) => {
    const net = r2(m.gross - m.discounts - m.refunds);
    const coverage = m.costedRev + m.uncostedRev > 0
      ? r2((m.costedRev / (m.costedRev + m.uncostedRev)) * 100) : 0;
    const contribution = r2(net - m.cogs - m.fees);
    return {
      recordId: month,
      fields: {
        Month: month, Orders: m.orders,
        'Gross Sales (£)': r2(m.gross), 'Discounts (£)': r2(-m.discounts),
        'Returns (£)': r2(-m.refunds), 'Net Sales (£)': net,
        'Shipping Charged (£)': r2(m.shipping), 'Tax (£)': r2(m.tax),
        'Total Sales (£)': r2(net + m.shipping),
        'COGS (£)': r2(m.cogs), 'COGS Coverage %': coverage,
        'Payment Fees (£)': r2(m.fees),
        'Contribution (£)': contribution,
        'Contribution Margin %': net ? r2((contribution / net) * 100) : '',
        'AOV (£)': m.orders ? r2(net / m.orders) : '',
        Basis: `COGS applied to ${coverage}% of revenue. Excludes shipping cost, platform fee, apps and any agency share.`,
      },
    };
  });

  const prod = [...products.values()].map(p => ({
    recordId: shortId(p.month, p.title),
    fields: {
      Month: p.month, Product: p.title, Units: p.units,
      'Gross Sales (£)': r2(p.net), 'Net Sales (£)': r2(p.net),
      'Unit Cost (£)': p.costed && p.units ? r2(p.cogs / p.units) : '',
      'COGS (£)': p.costed ? r2(p.cogs) : '',
      'Gross Profit (£)': p.costed ? r2(p.net - p.cogs) : '',
      'Margin %': p.costed && p.net ? r2(((p.net - p.cogs) / p.net) * 100) : '',
      'Cost Status': p.costed ? 'ACTUAL' : 'NO UNIT COST',
    },
  }));

  const costs = variants.map(v => ({
    recordId: (v.sku || v.title).slice(0, 32),
    fields: {
      SKU: v.sku, Product: v.title,
      'Retail Price (£)': v.price ?? '',
      'Unit Cost (£)': v.cost ?? '',
      'Gross Margin %': v.cost != null && v.price ? r2(((v.price - v.cost) / v.price) * 100) : '',
      Status: v.cost == null ? 'NOT SET IN SHOPIFY' : 'ACTUAL',
      Source: 'Shopify InventoryItem.unitCost',
      'Last Updated': new Date().toISOString().slice(0, 10),
    },
  }));

  return { pnl, prod, costs };
}

async function main() {
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }
  if (!shopifyReady()) {
    console.error(
      'Shopify credentials missing.\n\n' +
      '  Shopify retired admin-created custom apps, so there is no long-lived token to paste.\n' +
      '  Dev Dashboard > your app > Settings gives a Client ID and Secret; the OS exchanges\n' +
      '  them for a fresh 24-hour token on every run.\n\n' +
      '    npx vercel env add SHOPIFY_CLIENT_ID development\n' +
      '    npx vercel env add SHOPIFY_CLIENT_SECRET development\n'
    );
    return 1;
  }
  const from = arg('from') || '2026-06', to = arg('to') || '2026-07';
  console.log(`Pulling Shopify UK, ${from} to ${to}…\n`);

  const variants = await pullVariants();
  const scopes = grantedScopes();
  if (scopes) console.log(`scopes:   ${scopes}`);
  if (scopes && !/read_all_orders/.test(scopes)) {
    console.warn('WARNING: read_all_orders is not granted. Shopify returns only the last 60 days\n' +
                 '         of orders, silently, so any backfill before that will come back empty.');
  }
  const withCost = variants.filter(v => v.cost != null).length;
  console.log(`variants: ${variants.length} (${withCost} with a unit cost, ${variants.length - withCost} without)`);

  const orders = await pullOrders(from, to);
  console.log(`orders:   ${orders.length}`);

  const agg = aggregate(orders, variants);
  const { pnl, prod, costs } = buildRecords(agg, variants);

  for (const [, m] of agg.months) void m;
  for (const p of pnl) {
    const f = p.fields;
    console.log(`  ${f.Month}  ${String(f.Orders).padStart(4)} orders  net £${f['Net Sales (£)']}  ` +
                `COGS £${f['COGS (£)']} (${f['COGS Coverage %']}%)  fees £${f['Payment Fees (£)']}  ` +
                `contribution £${f['Contribution (£)']}`);
  }

  const prisma = getPrisma();
  const baseId = resolveBaseId(UK.envVar);
  const jobs = [['SHOPIFY_PNL', pnl], ['SHOPIFY_PRODUCTS', prod], ['SHOPIFY_COSTS', costs]];
  for (const [tableKey, records] of jobs) {
    // replace:false — a two-month pull must not delete months outside its window.
    const { written } = await commitTable(prisma, {
      baseKey: 'UK', tableKey, baseId, tableId: UK.tables[tableKey],
      records, replace: false, source: 'shopify-pull',
    });
    console.log(`\nUK.${tableKey.padEnd(17)} ${written} rows`);
  }

  console.log('\nTraffic (sessions, referrers, repeat rate) is not pulled here — it needs\n' +
              'ShopifyQL and the read_reports scope. Run the connector pull for those.');
  await prisma.$disconnect();
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.error('\n' + e.message); process.exit(1); });
