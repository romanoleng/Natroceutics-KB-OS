#!/usr/bin/env node
/**
 * Seed the Shopify UK finance tables from the 31 July 2026 live pull.
 *
 * WHY THIS EXISTS: Amazon has sellerboard, which produces a complete P&L
 * automatically. Shopify produces revenue only — no COGS applied, no fee
 * reconciliation, no margin. This script builds the sellerboard equivalent
 * from data Shopify does hold but never assembles:
 *
 *   · unit costs        InventoryItem.unitCost, per variant
 *   · payment fees      OrderTransaction.fees, per order, ACTUAL not modelled
 *   · sales & funnel    ShopifyQL
 *
 * Everything below is measured. Nothing here is estimated. Where Shopify has
 * no unit cost the row carries an empty cost and the P&L reports its COGS
 * coverage, so a partial figure can never be mistaken for a complete one.
 *
 * The data is a snapshot taken via the authenticated Shopify connector on
 * 2026-07-31. Once SHOPIFY_ADMIN_TOKEN is rotated, scripts/shopify-pull.js
 * replaces this with a live pull on the same schema.
 *
 *   node --env-file-if-exists=.env.local scripts/seed-shopify-finance.js
 */
const { getPrisma, isConfigured } = require('../lib/prisma');
const { commitTable } = require('../lib/mirror-write');
const { BASES, resolveBaseId } = require('../lib/airtable-tables');

const PULLED_AT = '2026-07-31';
const UK = BASES.UK;
const UK_BASE_ID = resolveBaseId(UK.envVar);

/* ── 1 · unit costs, read from Shopify variants ───────────────────────── */
// null = no cost set in Shopify. Never substitute a guess.
const VARIANTS = [
  ['UK-ASHWA',    'Ashwagandha Bioactive',            26.00,  5.42],
  ['UK-MAGGLY',   'Magnesium Trace Mineral Complex',  26.00,  5.29],
  ['UK-BERCOM',   'Berberine Complex',                38.50,  8.04],
  ['UK-QUERCBIO', 'Quercetin Bioactive',              28.50,  6.97],
  ['UK-SAFFRON',  'Saffron Bioactive',                23.50,  4.93],
  ['UK-SULFO',    'Sulforaphane NRF2 Complex',        45.00,  9.53],
  ['UK-MTHIS',    'Milk Thistle Bioactive',           24.50,  5.29],
  ['UK-BERGA',    'Bergamot-HT Complex',              42.50, 10.50],
  ['UK-LIPACID',  'Alpha Lipoic Acid Bioactive',      29.50,  9.08],
  ['UK-COQ10+PQQ','CoQ10 + PQQ Advanced',             39.00,  6.35],
  ['UK-CREAT',    'Creatine Bioactive',               28.50,  7.30],
  ['UK-GLUTSOD',  'Glutathione SOD Advanced',         59.00, 12.62],
  ['UK-OMEGAK2',  'Omega 3 Fortified',                39.95,  9.49],
  ['UK-OMEGA',    'Omega 3 Pure & Wild',              32.00,  3.60],
  ['UK-LIPOC-2',  'Vitamin C Complete',               40.00,  9.52],
  ['UK-CURFOR',   'Curcumin Fortified',               43.50,  null],
  ['UK-OPTIV',    'OPTI-VITA Complex',                39.95,  null],
  ['UK-MAGCO',    'Magnesium Glycinate Complex',      25.00,  null],
  ['UK-BCOM',     'Activated B-Complex Advanced',     26.00,  null],
  ['UK-COQ10',    'Coenzyme Q10 Advanced',            26.00,  null],
  ['UK-LIPOC-1',  'Vitamin C Complete',               22.50,  null],
  ['30s: UK-CURCOM', 'Curcumin Complete',             23.50,  null],
  ['60s: UK-CURCOM', 'Curcumin Complete',             41.50,  null],
  ['UK-METABRESET',  'Metabolic Reset',               67.00,  null],
  ['UK-APMILE',   'APIMILE™ Bioactive',               20.95,  null],
  ['UK-GREEN',    'Green Tea Bioactive',              29.50,  null],
];

/* ── 2 · per-product monthly sales, from ShopifyQL ────────────────────── */
// title, month, units, gross, net
const SALES = [
  ['Omega 3 Pure & Wild','2026-07',23,707.20,692.81], ['Berberine Complex','2026-07',19,708.40,679.54],
  ['Creatine Bioactive','2026-06',15,418.95,401.85],  ['Berberine Complex','2026-06',14,519.75,504.35],
  ['Omega 3 Fortified','2026-06',14,531.37,531.37],   ['Saffron Bioactive','2026-06',12,274.95,274.95],
  ['Curcumin Complete','2026-07',10,358.25,348.49],   ['Quercetin Bioactive','2026-07',10,273.60,269.32],
  ['Curcumin Fortified','2026-07',9,387.15,380.63],   ['Activated B-Complex Advanced','2026-07',9,218.40,218.40],
  ['Activated B-Complex Advanced','2026-06',8,192.40,192.40],
  ['Magnesium Glycinate Complex','2026-07',7,170.00,162.51],
  ['Magnesium Trace Mineral Complex','2026-06',6,156.00,152.10],
  ['CoQ10 + PQQ Advanced','2026-07',6,261.30,214.51], ['Bergamot-HT Complex','2026-07',5,208.25,159.38],
  ['Creatine Bioactive','2026-07',5,136.80,132.52],   ['Milk Thistle Bioactive','2026-06',5,115.15,115.15],
  ['OPTI-VITA Complex','2026-07',5,199.75,199.75],    ['Vitamin C Complete','2026-07',5,154.75,154.75],
  ['Omega 3 Pure & Wild','2026-06',5,147.20,147.20],  ['Coenzyme Q10 Advanced','2026-06',5,119.60,119.60],
  ['Milk Thistle Bioactive','2026-07',5,117.60,93.10],['Magnesium Glycinate Complex','2026-06',4,95.00,95.00],
  ['Vitamin C Complete','2026-06',4,118.75,118.75],   ['Curcumin Complete','2026-06',4,149.40,149.40],
  ['Coenzyme Q10 Advanced','2026-07',4,98.80,98.80],  ['Glutathione SOD Advanced','2026-06',4,218.30,218.30],
  ['Curcumin Fortified','2026-06',4,165.30,165.30],   ['Sulforaphane NRF2 Complex','2026-06',4,162.00,162.00],
  ['CoQ10 + PQQ Advanced','2026-06',3,105.30,105.30], ['Quercetin Bioactive','2026-06',3,82.65,78.38],
  ['Sulforaphane NRF2 Complex','2026-07',3,126.00,119.25], ['OPTI-VITA Complex','2026-06',3,115.86,115.86],
  ['Bergamot-HT Complex','2026-06',3,123.25,123.25],  ['Alpha Lipoic Acid Bioactive','2026-07',2,59.00,59.00],
  ['Ashwagandha Bioactive','2026-07',2,49.40,49.40],  ['APIMILE™ Bioactive','2026-07',2,39.81,36.66],
  ['Alpha Lipoic Acid Bioactive','2026-06',2,59.00,59.00], ['Ashwagandha Bioactive','2026-06',2,49.40,49.40],
  ['Metabolic Reset','2026-07',1,60.30,60.30],        ['APIMILE™ Bioactive','2026-06',1,20.95,20.95],
  ['Glutathione SOD Advanced','2026-07',1,53.10,53.10],
];

/* ── 3 · month totals and traffic, from ShopifyQL ─────────────────────── */
const MONTHS = {
  '2026-06': {
    orders: 76, gross: 3940.53, discounts: -40.67, returns: 0, net: 3899.86,
    shipping: 215.40, tax: 0, total: 4115.26,
    // Sum of OrderTransaction fees on SUCCESS transactions only. Failed card
    // attempts carry a phantom fee that would overstate this by ~£3 (Jun) /
    // ~£15 (Jul) if counted.
    paymentFees: 98.57,
    sessions: 1231, cartAdds: 79, reachedCheckout: 56, completedCheckout: 31,
    conversionRate: 2.52, customers: 71, returningCustomers: 30,
    returningRate: 42.25, aov: 51.313,
  },
  '2026-07': {
    orders: 66, gross: 4387.86, discounts: -170.54, returns: -35.10, net: 4182.22,
    shipping: 185.75, tax: 0, total: 4367.97,
    paymentFees: 103.30,
    sessions: 1533, cartAdds: 68, reachedCheckout: 51, completedCheckout: 31,
    conversionRate: 2.02, customers: 59, returningCustomers: 26,
    returningRate: 44.07, aov: 63.898,
  },
};

const REFERRERS = [
  ['2026-06','direct',664], ['2026-06','search',505], ['2026-06','unknown',55],
  ['2026-06','social',4],   ['2026-06','email',3],
  ['2026-07','direct',904], ['2026-07','search',576], ['2026-07','unknown',49],
  ['2026-07','social',4],   ['2026-07','email',0],
];

/* ── 4 · cost model: what Shopify cannot tell us ──────────────────────── */
// Every one of these is a real cost of running the channel that sits outside
// Shopify's reporting. PENDING until sourced. Never defaulted to zero.
const COST_MODEL = [
  ['shopify_plan_monthly',   'Shopify platform fee',        null, '£/month',
   'Shopify billing page', 'PENDING', 'Plan is "Shopify". Monthly fee not exposed by the Admin API.'],
  ['app_subscriptions_monthly','App subscriptions',         null, '£/month',
   'Shopify billing page', 'PENDING', 'Klaviyo plan and any other installed apps.'],
  ['shipping_cost_per_order','Pick, pack and shipping cost', null, '£/order',
   'Jason at Bionature', 'PENDING',
   'A margin line, not an overhead. Customers were charged £215.40 (Jun) and £185.75 (Jul) for shipping; the cost to serve it is unknown.'],
  ['tpl_handling_monthly',   '3PL handling',                null, '£/month',
   'Jason at Bionature', 'PENDING', 'Same outstanding item as the Amazon channel report.'],
  ['paid_media_monthly',     'Paid media',                  null, '£/month',
   'Romano', 'CONFIRM',
   'Shopify session data shows 4 social and 0 email sessions in July: no evidence of any paid acquisition. Confirm this is genuinely nil.'],
  ['agency_share_pct',       'Agency retainer share',       null, '% to Shopify',
   'Morgan / Kunle', 'PENDING',
   'The Conscious Commerce retainer (£4,270 to £5,270/mo) is charged wholly to Amazon in the Amazon report. If any part covers the own store, both reports change.'],
  ['vat_rate_pct',           'VAT charged on own store',    0, '%',
   'Shopify tax report', 'QUERY',
   'Shopify recorded £0 tax for June and July. Amazon recorded £3,013.62 of VAT in July on the same brand. If own-store sales are standard-rated, roughly £728 of the July figure is VAT, not revenue. Confirm before this margin is relied on.'],
];

const r2 = n => Math.round(n * 100) / 100;

/**
 * title -> unit cost, but ONLY where the answer is unambiguous.
 *
 * ShopifyQL groups sales by product_title, not by variant. Where a title has
 * several variants we can only cost it if every variant is costed and they
 * agree — otherwise we would be guessing which variant sold. Vitamin C
 * Complete is exactly this case: UK-LIPOC-1 has no cost, UK-LIPOC-2 is £9.52.
 * Costing it at £9.52 would silently overstate margin, so it reads NO COST.
 */
const costOf = (() => {
  const byTitle = new Map();
  for (const [, title, , cost] of VARIANTS) {
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push(cost);
  }
  const out = new Map();
  for (const [title, costs] of byTitle) {
    const unique = new Set(costs);
    if (unique.size === 1 && costs[0] != null) out.set(title, costs[0]);
  }
  return out;
})();

// recordId is varchar(32), and "2026-07:Magnesium Trace Mineral Complex" is not.
// Hash the product so the id stays stable across re-runs (upsert, not duplicate).
const crypto = require('crypto');
const shortId = (month, title) =>
  `${month}:${crypto.createHash('sha1').update(title).digest('hex').slice(0, 12)}`;

function buildProducts() {
  return SALES.map(([title, month, units, gross, net]) => {
    const unitCost = costOf.get(title) ?? null;
    const cogs = unitCost == null ? null : r2(units * unitCost);
    return {
      recordId: shortId(month, title),
      fields: {
        Month: month,
        Product: title,
        Units: units,
        'Gross Sales (£)': gross,
        'Net Sales (£)': net,
        'Unit Cost (£)': unitCost ?? '',
        'COGS (£)': cogs ?? '',
        'Gross Profit (£)': cogs == null ? '' : r2(net - cogs),
        'Margin %': cogs == null ? '' : r2(((net - cogs) / net) * 100),
        'Cost Status': unitCost == null ? 'NO UNIT COST' : 'ACTUAL',
      },
    };
  });
}

function buildPnl() {
  return Object.entries(MONTHS).map(([month, m]) => {
    const rows = SALES.filter(s => s[1] === month);
    let cogs = 0, costedRev = 0, uncostedRev = 0;
    for (const [title, , units, gross] of rows) {
      const c = costOf.get(title);
      if (c == null) uncostedRev += gross;
      else { cogs += units * c; costedRev += gross; }
    }
    const coverage = r2((costedRev / (costedRev + uncostedRev)) * 100);
    const contribution = r2(m.net - cogs - m.paymentFees);
    return {
      recordId: month,
      fields: {
        Month: month,
        Orders: m.orders,
        'Gross Sales (£)': m.gross,
        'Discounts (£)': m.discounts,
        'Returns (£)': m.returns,
        'Net Sales (£)': m.net,
        'Shipping Charged (£)': m.shipping,
        'Tax (£)': m.tax,
        'Total Sales (£)': m.total,
        'COGS (£)': r2(cogs),
        'COGS Coverage %': coverage,
        'Payment Fees (£)': m.paymentFees,
        'Contribution (£)': contribution,
        'Contribution Margin %': r2((contribution / m.net) * 100),
        'AOV (£)': r2(m.aov),
        Basis: `COGS applied to ${coverage}% of revenue. Excludes shipping cost, platform fee, apps and any agency share, all PENDING.`,
      },
    };
  });
}

function buildTraffic() {
  return Object.entries(MONTHS).map(([month, m]) => {
    const ref = Object.fromEntries(
      REFERRERS.filter(r => r[0] === month).map(r => [`Sessions: ${r[1]}`, r[2]])
    );
    return {
      recordId: month,
      fields: {
        Month: month,
        Sessions: m.sessions,
        'Cart Additions': m.cartAdds,
        'Reached Checkout': m.reachedCheckout,
        'Completed Checkout': m.completedCheckout,
        'Conversion %': m.conversionRate,
        Orders: m.orders,
        Customers: m.customers,
        'Returning Customers': m.returningCustomers,
        'Returning %': m.returningRate,
        ...ref,
        Note: `Only ${m.completedCheckout} of ${m.orders} orders attribute to a tracked session, so conversion % understates.`,
      },
    };
  });
}

const buildCosts = () => VARIANTS.map(([sku, product, price, cost]) => ({
  recordId: sku,
  fields: {
    SKU: sku,
    Product: product,
    'Retail Price (£)': price,
    'Unit Cost (£)': cost ?? '',
    'Gross Margin %': cost == null ? '' : r2(((price - cost) / price) * 100),
    Status: cost == null ? 'NOT SET IN SHOPIFY' : 'ACTUAL',
    Source: 'Shopify InventoryItem.unitCost',
    'Last Updated': PULLED_AT,
  },
}));

const buildCostModel = () => COST_MODEL.map(([key, label, value, unit, source, status, note]) => ({
  recordId: key,
  fields: {
    Key: key, Label: label,
    Value: value ?? '', Unit: unit,
    Source: source, Status: status, Note: note,
    'Last Updated': PULLED_AT,
  },
}));

async function main() {
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }
  const prisma = getPrisma();

  const jobs = [
    ['SHOPIFY_PNL',      buildPnl()],
    ['SHOPIFY_PRODUCTS', buildProducts()],
    ['SHOPIFY_TRAFFIC',  buildTraffic()],
    ['SHOPIFY_COSTS',    buildCosts()],
    ['COST_MODEL',       buildCostModel()],
  ];

  for (const [tableKey, records] of jobs) {
    const { written } = await commitTable(prisma, {
      baseKey: 'UK', tableKey,
      baseId: UK_BASE_ID, tableId: UK.tables[tableKey],
      records, replace: true, source: 'shopify-pull',
    });
    console.log(`UK.${tableKey.padEnd(17)} ${String(written).padStart(4)} rows`);
  }

  console.log('\nDone. These are OS-native tables — the Airtable sync skips them.');
  await prisma.$disconnect();
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.error(e); process.exit(1); });
