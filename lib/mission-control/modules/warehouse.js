/**
 * Warehouse stock, from the SOH workbook.
 *
 * The only source of expiry anywhere in the OS. Best-before dates are the
 * reason this module exists: stock that will expire before it sells is money
 * already spent that nothing else in the platform can see.
 */
const { ready, empty, attention, health, stateFromScore } = require('../contract');
const { readTable, n } = require('./_read');

/** Months from today to a "YYYY-MM" best-before, or null. */
function monthsAway(bbd) {
  if (!/^\d{4}-\d{2}$/.test(String(bbd || ''))) return null;
  const [y, m] = bbd.split('-').map(Number);
  const now = new Date();
  return (y - now.getUTCFullYear()) * 12 + (m - (now.getUTCMonth() + 1));
}

const HORIZON = 9;   // months. Closer than this and it needs a decision now.

module.exports = {
  id: 'warehouse',
  label: 'Warehouse',
  region: 'UK',
  area: 'Warehouse',

  widgets: [{
    id: 'warehouse-soh',
    name: 'Stock on hand',
    category: 'inventory',
    priority: 40,
    size: 'sm',
    refresh: 86400,
    async load() {
      const rows = await readTable('UK', 'STOCK');
      if (!rows.length) return empty('No SOH workbook has been imported yet.');
      const dated = rows.filter(r => r['Earliest BBD']);
      const soon = dated.filter(r => {
        const m = monthsAway(r['Earliest BBD']);
        return m !== null && m <= HORIZON;
      });
      const units = rows.reduce((s, r) => s + (n(r['Total QTY']) || 0), 0);
      const soonest = dated.map(r => r['Earliest BBD']).sort()[0] || null;
      return ready({
        headline: units.toLocaleString('en-GB'),
        sub: `units across ${rows.length} SKUs`,
        rows: [
          { label: `Expiring within ${HORIZON} months`, value: String(soon.length), tone: soon.length ? 'warn' : null },
          { label: 'Soonest best-before', value: soonest || '—' },
          { label: 'With a batch recorded', value: `${dated.length} of ${rows.length}` },
        ],
      });
    },
  }],

  async attention() {
    const rows = await readTable('UK', 'STOCK');
    if (!rows.length) return [];
    const items = [];

    const soon = rows
      .map(r => ({ r, m: monthsAway(r['Earliest BBD']) }))
      .filter(x => x.m !== null && x.m <= HORIZON)
      .sort((a, b) => a.m - b.m);
    if (soon.length) {
      const units = soon.reduce((s, x) => s + (n(x.r['Total QTY']) || 0), 0);
      items.push(attention({
        id: 'warehouse-expiring',
        title: `${soon.length} SKU${soon.length === 1 ? '' : 's'} expiring within ${HORIZON} months`,
        why: `${units.toLocaleString('en-GB')} units, soonest ${soon[0].r['Earliest BBD']} on ${soon[0].r.SKU}. Stock that expires before it sells is money already spent.`,
        severity: soon[0].m <= 3 ? 'high' : 'medium',
        region: 'UK', area: 'Warehouse', source: 'warehouse', href: '/uk',
      }));
    }

    // Units with no batch cannot be traced or expiry-checked at all.
    const unbatched = rows.filter(r => n(r['Unbatched QTY']) > 0);
    if (unbatched.length) {
      const u = unbatched.reduce((s, r) => s + (n(r['Unbatched QTY']) || 0), 0);
      items.push(attention({
        id: 'warehouse-unbatched',
        title: `${u} unit${u === 1 ? '' : 's'} have no batch attributed`,
        why: `On ${unbatched.map(r => r.SKU).join(', ')}. Those units carry no best-before date, so they are invisible to every expiry check.`,
        severity: 'low', region: 'UK', area: 'Warehouse', source: 'warehouse',
      }));
    }
    return items;
  },

  async health() {
    const rows = await readTable('UK', 'STOCK');
    if (!rows.length) return health({ label: 'Warehouse', state: 'unknown', note: 'No SOH imported' });
    const dated = rows.filter(r => r['Earliest BBD']).length;
    if (!dated) return health({ label: 'Warehouse', state: 'unknown', note: 'No best-before dates recorded' });
    const soon = rows.filter(r => {
      const m = monthsAway(r['Earliest BBD']);
      return m !== null && m <= HORIZON;
    }).length;
    return health({
      label: 'Warehouse',
      state: stateFromScore(Math.round(((rows.length - soon) / rows.length) * 100)),
      score: Math.round(((rows.length - soon) / rows.length) * 100),
      note: soon ? `${soon} SKUs expiring within ${HORIZON} months` : `${rows.length} SKUs, none expiring soon`,
    });
  },
};
