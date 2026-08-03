/**
 * Shopify UK — the own store.
 *
 * The reporting rule from /report/shopify-uk applies here: a cost we do not
 * have is NEVER drawn as zero. Contribution is reported with the number of cost
 * lines still missing attached to it, because 82% margin read without that
 * caveat is the single most misleading figure in the OS.
 */
const { ready, empty, error, attention, health, stateFromScore } = require('../contract');
const { readTable, n, money } = require('./_read');

module.exports = {
  id: 'shopify-uk',
  label: 'Shopify UK',
  region: 'UK',
  area: 'Shopify',

  widgets: [
    {
      id: 'shopify-uk-revenue',
      name: 'Revenue',
      category: 'sales',
      priority: 30,
      size: 'md',
      refresh: 3600,
      async load() {
        const pnl = await readTable('UK', 'SHOPIFY_PNL');
        if (!pnl.length) return empty('No Shopify P&L months are stored yet.');
        const months = pnl.slice().sort((a, b) => String(a.Month).localeCompare(String(b.Month)));
        const thisMonth = new Date().toISOString().slice(0, 7);
        // Default to the last COMPLETE month: a partial current month makes the
        // channel look as though it has collapsed.
        const complete = months.filter(m => m.Month < thisMonth);
        const cur = complete[complete.length - 1] || months[months.length - 1];
        const prev = complete[complete.length - 2] || null;
        if (!cur) return empty('No complete month of Shopify data yet.');
        const prevNet = prev ? n(prev['Net Sales (£)']) : null;
        const net = n(cur['Net Sales (£)']);
        const change = prevNet ? ((net - prevNet) / Math.abs(prevNet)) * 100 : null;
        return ready({
          headline: money(cur['Net Sales (£)']),
          sub: `net sales · ${cur.Month}`,
          rows: [
            { label: 'Orders', value: String(n(cur.Orders) ?? '—') },
            { label: 'Contribution', value: money(cur['Contribution (£)']) },
            ...(change === null ? [] : [{
              label: 'vs previous month',
              value: `${change > 0 ? '+' : ''}${change.toFixed(1)}%`,
              tone: change < 0 ? 'warn' : null,
            }]),
          ],
        });
      },
    },
    {
      id: 'shopify-uk-cost-gaps',
      name: 'Unpriced costs',
      category: 'finance',
      priority: 25,
      size: 'sm',
      refresh: 3600,
      async load() {
        const model = await readTable('UK', 'COST_MODEL');
        if (!model.length) return empty('No cost model has been set up.');
        const pending = model.filter(r => r.Status === 'PENDING' && !n(r.Value));
        if (!pending.length) return empty('Every cost line has a value.');
        return ready({
          headline: String(pending.length),
          sub: pending.length === 1 ? 'cost line unpriced' : 'cost lines unpriced',
          rows: pending.map(r => ({ label: r.Label || r.Key, value: 'PENDING', tone: 'warn' })),
        });
      },
    },
  ],

  async attention() {
    const items = [];
    const model = await readTable('UK', 'COST_MODEL');
    const pending = model.filter(r => r.Status === 'PENDING' && !n(r.Value));
    if (pending.length) {
      items.push(attention({
        id: 'shopify-uk-cost-gaps',
        title: `${pending.length} Shopify UK cost lines have no value`,
        why: `Contribution is reported after cost of goods and payment fees only. ${pending.map(r => r.Label || r.Key).join(', ')} all sit inside the margin figure, so it will be read as profit by anyone who has not opened the cost model.`,
        severity: 'high', region: 'UK', area: 'Shopify', source: 'shopify-uk', href: '/uk',
        dedupeKey: 'uk-shopify-cost-gaps',
      }));
    }
    return items;
  },

  async health() {
    const pnl = await readTable('UK', 'SHOPIFY_PNL');
    if (!pnl.length) return health({ label: 'Shopify UK', state: 'unknown', note: 'No P&L stored' });
    const model = await readTable('UK', 'COST_MODEL');
    const pending = model.filter(r => r.Status === 'PENDING' && !n(r.Value)).length;
    const total = model.length || 1;
    const score = Math.round(((total - pending) / total) * 100);
    return health({
      label: 'Shopify UK',
      // Health here means "can this channel's profit be trusted", not "is it
      // selling". A channel with unpriced costs looks profitable precisely
      // because the costs are invisible.
      state: stateFromScore(score),
      score,
      note: pending ? `${pending} of ${total} cost lines unpriced` : 'Cost model complete',
    });
  },
};
