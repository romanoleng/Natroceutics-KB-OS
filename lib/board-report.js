/**
 * Data assembly for the Shopify UK board report.
 *
 * Kept out of the page so the page is layout and this is arithmetic. Every
 * figure here is measured or explicitly absent — the four principles Romano
 * wrote for the Amazon deck apply unchanged:
 *
 *   1. Report the number nobody else reports (the full cost stack).
 *   2. Separate bought growth from earned growth.
 *   3. Never estimate. An unsourced figure reads PENDING.
 *   4. Close on measurable tests.
 */
const { fetchFromMirror } = require('./mirror');
const { BASES, resolveBaseId } = require('./airtable-tables');

const UK = BASES.UK;
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const num = v => (v === '' || v == null ? null : Number(v));

async function read(tableKey) {
  const baseId = resolveBaseId(UK.envVar);
  const rows = (await fetchFromMirror(baseId, UK.tables[tableKey])) || [];
  return rows.map(r => r.fields || r);
}

/** Amazon rolled up by month from the sellerboard mirror. */
function amazonByMonth(daily) {
  const acc = new Map();
  for (const d of daily) {
    const m = String(d.Date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    const v = acc.get(m) || { revenue: 0, net: 0, ads: 0, orders: 0, cogs: 0, fees: 0 };
    v.revenue += Number(d['Revenue £']) || 0;
    v.net += Number(d['Net Profit £']) || 0;
    v.ads += Number(d['Ad Spend £']) || 0;
    v.orders += Number(d.Orders) || 0;
    v.cogs += Number(d['COGS £']) || 0;
    v.fees += Number(d['Amazon Fees £']) || 0;
    acc.set(m, v);
  }
  return acc;
}

async function buildBoardReport(month) {
  const [pnl, ytdRows, payouts, products, traffic, costs, costModel,
         subsMonthly, subsCustomers, affiliates, affMonthly,
         klaviyoFlows, klaviyoCampaigns, amazonDaily] = await Promise.all([
    read('SHOPIFY_PNL'), read('SHOPIFY_YTD'), read('SHOPIFY_PAYOUTS'),
    read('SHOPIFY_PRODUCTS'), read('SHOPIFY_TRAFFIC'), read('SHOPIFY_COSTS'),
    read('COST_MODEL'), read('SUBS_MONTHLY'), read('SUBS_CUSTOMERS'),
    read('AFFILIATES_LIVE'), read('AFF_MONTHLY'),
    read('KLAVIYO_FLOWS'), read('KLAVIYO_CAMPAIGNS'), read('AMAZON_DAILY_PNL'),
  ]);

  const months = [...pnl].sort((a, b) => String(a.Month).localeCompare(String(b.Month)));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const complete = months.filter(m => m.Month < thisMonth);
  const target = month || (complete[complete.length - 1] || months[months.length - 1] || {}).Month;

  const i = months.findIndex(m => m.Month === target);
  const cur = months[i] || {};
  const prev = months[i - 1] || {};

  const amz = amazonByMonth(amazonDaily);
  const amzCur = amz.get(target) || null;
  const amzPrev = amz.get(prev.Month) || null;

  /* ── channel mix ─────────────────────────────────────────── */
  const shopTotal = num(cur['Total Sales (£)']) || 0;
  const amzTotal = amzCur?.revenue || 0;
  const combined = shopTotal + amzTotal;

  /* ── the cost stack ──────────────────────────────────────── */
  const sourced = costModel.filter(c => c.Status === 'ACTUAL' || c.Status === 'STALE');
  const pending = costModel.filter(c => c.Status === 'PENDING');
  const queries = costModel.filter(c => c.Status === 'QUERY');
  const sourcedTotal = sourced.reduce((s, c) => s + (num(c.Value) || 0), 0);
  const contribution = num(cur['Contribution (£)']) || 0;
  const afterSourced = r2(contribution - sourcedTotal);

  /* ── traffic: earned vs bought ───────────────────────────── */
  const tCur = traffic.find(t => t.Month === target) || {};
  const tPrev = traffic.find(t => t.Month === prev.Month) || {};

  /* ── the annuity ─────────────────────────────────────────── */
  const subsCur = subsMonthly.find(s => s.Month === target) || {};
  const recurringTotal = subsMonthly.reduce((s, m) => s + (num(m['Recurring Revenue (£)']) || 0), 0);
  const billing = subsCustomers.filter(c => c.Status === 'Active').length;
  const declined = subsCustomers.filter(c => c['Card Declined'] === 'Yes').length;

  /* ── owned channel ───────────────────────────────────────── */
  const flowRevenue = klaviyoFlows.reduce((s, f) => s + (num(f['Revenue (£)']) || 0), 0);
  const campaignRevenue = klaviyoCampaigns.reduce((s, c) => s + (num(c['Revenue (£)']) || 0), 0);
  const liveFlows = klaviyoFlows.filter(f => String(f.Status).toLowerCase() === 'live').length;
  const sentCampaigns = klaviyoCampaigns.filter(c => c.Sent).length;
  const lastCampaign = klaviyoCampaigns.filter(c => c.Sent).map(c => c.Sent).sort().pop() || null;

  /* ── affiliates ──────────────────────────────────────────── */
  const affEarning = affiliates.filter(a => Number(a.Orders) > 0);
  const affRevenue = affiliates.reduce((s, a) => s + (num(a['Revenue (£)']) || 0), 0);
  const affCommission = affiliates.reduce((s, a) => s + (num(a['Commission (£)']) || 0), 0);
  const affCur = affMonthly.find(a => a.Month === target) || {};

  /* ── product ─────────────────────────────────────────────── */
  const curProducts = products
    .filter(p => p.Month === target)
    .sort((a, b) => (num(b['Net Sales (£)']) || 0) - (num(a['Net Sales (£)']) || 0));
  const noCost = curProducts.filter(p => p['COGS (£)'] === '' || p['COGS (£)'] == null);

  /* ── margin recovery: SKUs whose margin is thin ──────────── */
  const thin = curProducts
    .filter(p => p['Margin %'] !== '' && num(p['Margin %']) != null && num(p['Margin %']) < 60)
    .sort((a, b) => (num(a['Margin %']) || 0) - (num(b['Margin %']) || 0));

  /* ── reconciliation ──────────────────────────────────────── */
  const payoutCur = payouts.find(p => p.Month === target) || {};
  const variances = payouts
    .map(p => num(p['Fee Variance (£)']))
    .filter(v => v != null);
  const worstVariance = variances.length
    ? variances.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0) : null;

  return {
    month: target,
    months,
    cur, prev,
    ytd: ytdRows[0] || null,
    amazon: { cur: amzCur, prev: amzPrev },
    mix: {
      shopify: shopTotal, amazon: amzTotal, combined,
      shopifyShare: combined ? (shopTotal / combined) * 100 : null,
    },
    costStack: { sourced, pending, queries, sourcedTotal: r2(sourcedTotal), contribution, afterSourced },
    traffic: { cur: tCur, prev: tPrev },
    subs: { cur: subsCur, monthly: subsMonthly, recurringTotal: r2(recurringTotal), billing, declined },
    owned: { flowRevenue: r2(flowRevenue), campaignRevenue: r2(campaignRevenue),
             liveFlows, sentCampaigns, lastCampaign,
             flows: [...klaviyoFlows].sort((a, b) => (num(b['Revenue (£)']) || 0) - (num(a['Revenue (£)']) || 0)) },
    affiliates: { total: affiliates.length, earning: affEarning.length,
                  revenue: r2(affRevenue), commission: r2(affCommission),
                  rate: affRevenue ? r2((affCommission / affRevenue) * 100) : null,
                  cur: affCur },
    products: { all: curProducts, noCost, thin },
    costs,
    reconciliation: { cur: payoutCur, all: payouts, worstVariance },
    generatedAt: new Date().toISOString().slice(0, 10),
  };
}

module.exports = { buildBoardReport };
