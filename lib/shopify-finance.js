/**
 * Read side for the Shopify UK finance tables.
 *
 * These are OS-native (`os:` prefixed) so they never touch Airtable — no
 * fallback, no quota, no sync clobbering them. If the mirror has nothing yet
 * the getters return [] and the report renders its PENDING state rather than
 * inventing figures.
 */
const { fetchFromMirror } = require('./mirror');
const { BASES, resolveBaseId } = require('./airtable-tables');

const UK = BASES.UK;
const baseId = () => resolveBaseId(UK.envVar);

const read = async (tableKey, opts) =>
  (await fetchFromMirror(baseId(), UK.tables[tableKey], opts)) || [];

const f = r => r.fields || r;
const n = v => (typeof v === 'number' ? v : v === '' || v == null ? null : Number(v));

/**
 * Everything the monthly report needs, in one call.
 * `months` are ISO YYYY-MM, oldest first.
 */
async function getShopifyFinance(months) {
  const [pnl, products, traffic, costs, model] = await Promise.all([
    read('SHOPIFY_PNL'), read('SHOPIFY_PRODUCTS'), read('SHOPIFY_TRAFFIC'),
    read('SHOPIFY_COSTS'), read('COST_MODEL'),
  ]);

  const byMonth = rows => {
    const m = new Map();
    for (const r of rows) m.set(f(r).Month, f(r));
    return m;
  };

  return {
    months,
    pnl: byMonth(pnl),
    traffic: byMonth(traffic),
    products: products.map(f),
    costs: costs.map(f),
    // Cost-model rows that are still unsourced. The report leads with these:
    // a cost we cannot see is the whole reason the channel looks profitable.
    model: model.map(f),
    gaps: model.map(f).filter(r => r.Status === 'PENDING'),
    queries: model.map(f).filter(r => r.Status === 'QUERY'),
  };
}

/** Per-SKU rows for one month, richest first, with margin where cost is known. */
function productsFor(all, month) {
  return all
    .filter(p => p.Month === month)
    .sort((a, b) => n(b['Gross Sales (£)']) - n(a['Gross Sales (£)']));
}

/** June -> July deltas for the headline tiles. */
function delta(a, b) {
  const x = n(a), y = n(b);
  if (x == null || y == null || x === 0) return null;
  return Math.round(((y - x) / Math.abs(x)) * 1000) / 10;
}

module.exports = { getShopifyFinance, productsFor, delta, num: n };

/**
 * Subscriptions, derived from Recharge's footprint on Shopify orders and
 * customers. Same native-table treatment as the finance set.
 */
async function getSubscriptions() {
  const [customers, monthly, products] = await Promise.all([
    read('SUBS_CUSTOMERS'), read('SUBS_MONTHLY'), read('SUBS_PRODUCTS'),
  ]);
  return { customers: customers.map(f), monthly: monthly.map(f), products: products.map(f) };
}

module.exports.getSubscriptions = getSubscriptions;
