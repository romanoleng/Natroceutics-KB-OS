/**
 * Shopify UK — the own store.
 *
 * The reporting rule from /report/shopify-uk applies here: a cost we do not
 * have is NEVER drawn as zero. Contribution is reported with the number of cost
 * lines still missing attached to it, because 82% margin read without that
 * caveat is the single most misleading figure in the OS.
 */
const { ready, empty, error, attention, health, stateFromScore, insight, action } = require('../contract');
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

  async insights() {
    const pnl = await readTable('UK', 'SHOPIFY_PNL');
    if (!pnl.length) return [];
    const months = pnl.slice().sort((a, b) => String(a.Month).localeCompare(String(b.Month)));
    const thisMonth = new Date().toISOString().slice(0, 7);
    // Complete months only. A part-month against a whole one invents a collapse.
    const complete = months.filter(m => m.Month < thisMonth);
    const cur = complete[complete.length - 1];
    const prev = complete[complete.length - 2];
    if (!cur || !prev) return [];

    const out = [];
    const curNet = n(cur['Net Sales (£)']), prevNet = n(prev['Net Sales (£)']);
    if (curNet !== null && prevNet) {
      const pct = ((curNet - prevNet) / Math.abs(prevNet)) * 100;
      out.push(insight({
        id: 'shop-net',
        headline: pct >= 0 ? 'Own-store sales grew last month' : 'Own-store sales fell last month',
        value: money(cur['Net Sales (£)']),
        comparison: `vs ${money(prev['Net Sales (£)'])} in ${prev.Month}, ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`,
        why: `${n(cur.Orders)} orders against ${n(prev.Orders)}, AOV ${money(cur['AOV (£)'])}.`,
        tone: pct >= 0 ? 'up' : 'down',
        tellTeam: pct >= 15
          ? `The Natroceutics UK store took ${money(cur['Net Sales (£)'])} in ${cur.Month}, up ${pct.toFixed(0)}% on the month before, across ${n(cur.Orders)} orders.`
          : null,
      }));
    }

    const cov = n(cur['COGS Coverage %']);
    if (cov !== null && cov < 100) {
      out.push(insight({
        id: 'shop-cogs',
        headline: 'Margin is computed on partial cost of goods',
        value: `${cov.toFixed(1)}% covered`,
        comparison: `of ${money(cur['Net Sales (£)'])} in net sales for ${cur.Month}`,
        why: `Contribution reads ${n(cur['Contribution Margin %'])?.toFixed(1)}%, but the products with no unit cost carry none, so the real figure is lower.`,
        tone: 'down',
      }));
    }

    const subs = await readTable('UK', 'SUBS_MONTHLY');
    const sm = subs.slice().sort((a, b) => String(a.Month).localeCompare(String(b.Month)))
      .filter(m => m.Month < thisMonth).pop();
    if (sm && n(sm['Recurring Share %']) !== null) {
      out.push(insight({
        id: 'shop-subs',
        headline: 'Share of revenue that recurs',
        value: `${n(sm['Recurring Share %']).toFixed(1)}%`,
        comparison: `${money(sm['Recurring Revenue (£)'])} recurring of ${money(sm['Total Subscription Revenue (£)'])} subscription revenue in ${sm.Month}`,
        why: `${n(sm['Recurring Orders'])} recurring orders, ${n(sm['New Subscribers'])} new subscribers.`,
        tone: 'flat',
      }));
    }
    return out;
  },

  async actions() {
    const out = [];
    const model = await readTable('UK', 'COST_MODEL');
    const pending = model.filter(r => r.Status === 'PENDING' && !n(r.Value));
    if (pending.length) {
      out.push(action({
        id: 'shop-fill-costs',
        title: `${pending.length} cost lines have no value`,
        next: `Open Cost model and type in ${pending.slice(0, 3).map(r => r.Label || r.Key).join(', ')}${pending.length > 3 ? ' and the rest' : ''}. They are editable now, and saving marks each one ACTUAL.`,
        why: 'Until they are filled, contribution is reported after cost of goods and payment fees only, and reads as profit.',
        severity: 'high', href: '/uk?s=shopify',
      }));
    }

    const costs = await readTable('UK', 'SHOPIFY_COSTS');
    const missing = costs.filter(c => n(c['Unit Cost (£)']) === null);
    if (missing.length) {
      out.push(action({
        id: 'shop-unit-costs',
        title: `${missing.length} products have no unit cost`,
        next: `Set "Cost per item" in Shopify for ${missing.slice(0, 3).map(c => c.Product || c.SKU).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}. This one cannot be done in the OS: the values live in Shopify and are pulled from there.`,
        why: 'Every sale of these products currently books full revenue and no cost, which flatters the margin.',
        severity: 'high',
      }));
    }
    return out;
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
