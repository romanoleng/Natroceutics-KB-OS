/**
 * Amazon UK, from the Sellerboard imports.
 *
 * Zero FBA stock is reported as attention only when it is actionable. It is a
 * different problem while inbound shipments are blocked, because the ordinary
 * fix cannot execute, and that distinction is the difference between a
 * replenishment note and a stockout with no exit.
 */
const { ready, empty, error, attention, health } = require('../contract');
const { readTable, n } = require('./_read');

module.exports = {
  id: 'amazon-uk',
  label: 'Amazon UK',
  region: 'UK',
  area: 'Amazon',

  widgets: [{
    id: 'amazon-uk-stock',
    name: 'FBA stock',
    category: 'inventory',
    priority: 35,
    size: 'sm',
    refresh: 3600,
    async load() {
      const rows = await readTable('UK', 'AMAZON');
      if (!rows.length) return empty('No Sellerboard stock export has been imported.');
      const zero = rows.filter(r => n(r['FBA Stock']) === 0);
      const units = rows.reduce((s, r) => s + (n(r['FBA Stock']) || 0), 0);
      return ready({
        headline: units.toLocaleString('en-GB'),
        sub: `units across ${rows.length} ASINs`,
        rows: [
          { label: 'Out of stock', value: String(zero.length), tone: zero.length ? 'bad' : null },
          ...zero.slice(0, 3).map(r => ({ label: r['Amazon SKU'] || r.ASIN, value: '0', tone: 'bad' })),
        ],
      });
    },
  }],

  async attention() {
    const rows = await readTable('UK', 'AMAZON');
    if (!rows.length) return [];
    const zero = rows.filter(r => n(r['FBA Stock']) === 0);
    if (!zero.length) return [];
    return [attention({
      id: 'amazon-uk-zero-stock',
      title: `${zero.length} Amazon UK ASIN${zero.length === 1 ? '' : 's'} at zero FBA stock`,
      why: `${zero.map(r => r['Amazon SKU'] || r.ASIN).join(', ')}. Every day at zero is full margin lost, and if inbound shipments are blocked the usual fix cannot run.`,
      severity: 'high', region: 'UK', area: 'Amazon', source: 'amazon-uk', href: '/uk',
      dedupeKey: 'uk-amazon-zero-stock',
    })];
  },

  async health() {
    const rows = await readTable('UK', 'AMAZON');
    if (!rows.length) return health({ label: 'Amazon UK', state: 'unknown', note: 'No stock export imported' });
    const zero = rows.filter(r => n(r['FBA Stock']) === 0).length;
    const score = Math.round(((rows.length - zero) / rows.length) * 100);
    return health({
      label: 'Amazon UK',
      state: zero === 0 ? 'good' : zero <= 2 ? 'warn' : 'bad',
      score,
      note: zero ? `${zero} of ${rows.length} ASINs out of stock` : `${rows.length} ASINs in stock`,
    });
  },
};
