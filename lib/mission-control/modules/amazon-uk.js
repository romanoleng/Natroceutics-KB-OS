/**
 * Amazon UK, from the Sellerboard imports.
 *
 * Zero FBA stock is reported as attention only when it is actionable. It is a
 * different problem while inbound shipments are blocked, because the ordinary
 * fix cannot execute, and that distinction is the difference between a
 * replenishment note and a stockout with no exit.
 */
const { ready, empty, error, attention, health, stateFromScore, insight, action } = require('../contract');
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

  /* ── Page panel ────────────────────────────────────────────
   * What this desk would tell you if you asked. Every figure below is measured
   * against something, because the contract will not accept it otherwise.
   */

  async insights() {
    const pnl = await readTable('UK', 'AMAZON_DAILY_PNL');
    if (!pnl.length) return [];
    const days = pnl
      .filter(r => r.Date)
      .sort((a, b) => String(a.Date).localeCompare(String(b.Date)));

    // Two whole weeks, most recent complete first. Comparing a part-week
    // against a full one is the easiest way to invent a collapse that is not
    // happening, which is the same trap the Shopify month picker had.
    const last7 = days.slice(-7);
    const prev7 = days.slice(-14, -7);
    if (last7.length < 7 || prev7.length < 7) return [];

    const sum = (rows, k) => rows.reduce((s, r) => s + (n(r[k]) || 0), 0);
    const gbp = v => `£${Math.round(v).toLocaleString('en-GB')}`;
    const out = [];

    const rev = sum(last7, 'Revenue £');
    const prevRev = sum(prev7, 'Revenue £');
    if (prevRev > 0) {
      const pct = ((rev - prevRev) / prevRev) * 100;
      const better = pct > 0;
      out.push(insight({
        id: 'az-revenue-week',
        headline: better ? 'Amazon revenue is up week on week' : 'Amazon revenue is down week on week',
        value: gbp(rev),
        comparison: `vs ${gbp(prevRev)} the previous seven days, ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`,
        why: `${sum(last7, 'Orders')} orders against ${sum(prev7, 'Orders')}.`,
        tone: better ? 'up' : 'down',
        // Only worth saying out loud when it is genuinely notable. A 3% wobble
        // told to the team every week is how people learn to ignore you.
        tellTeam: better && pct >= 15
          ? `Amazon UK took ${gbp(rev)} in the last seven days, up ${pct.toFixed(0)}% on the week before. Worth telling whoever has been working the listings.`
          : null,
      }));
    }

    const spend = sum(last7, 'Ad Spend £');
    const ppcRev = sum(last7, 'PPC Revenue £');
    if (spend > 0) {
      const acos = (spend / (ppcRev || 1)) * 100;
      out.push(insight({
        id: 'az-acos',
        headline: acos > 30 ? 'Ad spend is expensive against the revenue it brings' : 'Ad spend is holding its own',
        value: `${acos.toFixed(0)}% ACOS`,
        comparison: `${gbp(spend)} of spend against ${gbp(ppcRev)} of PPC revenue, last seven days`,
        why: acos > 30
          ? 'Above 30% the ads are eating most of the margin on what they sell.'
          : 'Spend is producing more than three times its cost in attributed revenue.',
        tone: acos > 30 ? 'down' : 'up',
      }));
    }

    const margin = sum(last7, 'Net Profit £');
    const prevMargin = sum(prev7, 'Net Profit £');
    if (rev > 0 && prevRev > 0) {
      const rate = (margin / rev) * 100;
      const prevRate = (prevMargin / prevRev) * 100;
      out.push(insight({
        id: 'az-margin',
        headline: 'Net margin after fees, ads and cost of goods',
        value: `${rate.toFixed(1)}%`,
        comparison: `vs ${prevRate.toFixed(1)}% the previous seven days`,
        why: `${gbp(margin)} kept from ${gbp(rev)}. Amazon fees took ${gbp(sum(last7, 'Amazon Fees £'))}.`,
        tone: rate >= prevRate ? 'up' : 'down',
      }));
    }
    return out;
  },

  async actions() {
    const rows = await readTable('UK', 'AMAZON');
    const out = [];
    if (!rows.length) return out;

    const zero = rows.filter(r => n(r['FBA Stock']) === 0);
    if (zero.length) {
      out.push(action({
        id: 'az-restock',
        title: `${zero.length} ASIN${zero.length === 1 ? '' : 's'} at zero FBA stock`,
        next: `Check whether ${zero.map(r => r['Amazon SKU'] || r.ASIN).join(', ')} are inside the inbound block before raising a shipment. If they are, the certificate is the blocker, not the stock.`,
        why: 'Every day at zero is full margin lost, and a shipment raised against a block will simply be refused.',
        severity: 'high',
        href: '/uk?s=amazon',
      }));
    }

    // Low but not empty: the window where acting still prevents the stockout.
    const low = rows.filter(r => {
      const q = n(r['FBA Stock']);
      return q !== null && q > 0 && q <= 20;
    });
    if (low.length) {
      out.push(action({
        id: 'az-low',
        title: `${low.length} ASIN${low.length === 1 ? '' : 's'} under 20 units`,
        next: `Decide now whether to ship ${low.slice(0, 3).map(r => r['Amazon SKU'] || r.ASIN).join(', ')}${low.length > 3 ? ` and ${low.length - 3} more` : ''}, while there is still cover to sell through.`,
        why: 'Acting here is the only version of this that avoids a stockout rather than reporting one.',
        severity: 'medium',
        href: '/uk?s=amazon',
      }));
    }
    return out;
  },

  async health() {
    const rows = await readTable('UK', 'AMAZON');
    if (!rows.length) return health({ label: 'Amazon UK', state: 'unknown', note: 'No stock export imported' });
    const zero = rows.filter(r => n(r['FBA Stock']) === 0).length;
    const score = Math.round(((rows.length - zero) / rows.length) * 100);
    return health({
      label: 'Amazon UK',
      state: stateFromScore(score),
      score,
      note: zero ? `${zero} of ${rows.length} ASINs out of stock` : `${rows.length} ASINs in stock`,
    });
  },
};
