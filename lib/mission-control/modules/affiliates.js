/**
 * Affiliate programme, from the GoAffPro pull.
 *
 * Commission is the most expensive acquisition channel the business runs at a
 * blended rate well above any other, and it is small only because volume is
 * low. Reported as a cost, not a win.
 */
const { ready, empty, attention, health } = require('../contract');
const { readTable, n } = require('./_read');

module.exports = {
  id: 'affiliates',
  label: 'Affiliates',
  region: 'UK',
  area: 'Affiliates',

  widgets: [{
    id: 'affiliates-summary',
    name: 'Affiliate cost',
    category: 'marketing',
    priority: 50,
    size: 'sm',
    refresh: 3600,
    async load() {
      const monthly = await readTable('UK', 'AFF_MONTHLY');
      if (!monthly.length) return empty('No affiliate months have been pulled yet.');
      const sorted = monthly.slice().sort((a, b) => String(a.Month).localeCompare(String(b.Month)));
      const last = sorted[sorted.length - 1];
      const commission = n(last['Commission (£)']);
      return ready({
        headline: commission === null ? '—' : `£${commission.toLocaleString('en-GB')}`,
        sub: `commission · ${last.Month}`,
        rows: [{ label: 'Latest month recorded', value: last.Month }],
      });
    },
  }],

  async attention() {
    const monthly = await readTable('UK', 'AFF_MONTHLY');
    if (!monthly.length) return [];
    const sorted = monthly.slice().sort((a, b) => String(a.Month).localeCompare(String(b.Month)));
    const last = sorted[sorted.length - 1];
    const thisMonth = new Date().toISOString().slice(0, 7);
    // A programme with no recent sales is STALE, not zero. Those are different
    // facts and only one of them means the channel has stopped.
    const monthsSince = last?.Month
      ? (Number(thisMonth.slice(0, 4)) - Number(last.Month.slice(0, 4))) * 12
        + (Number(thisMonth.slice(5, 7)) - Number(last.Month.slice(5, 7)))
      : null;
    if (monthsSince !== null && monthsSince >= 2) {
      return [attention({
        id: 'affiliates-stale',
        title: `No affiliate sales recorded since ${last.Month}`,
        why: `${monthsSince} months with nothing attributed. Either the programme has stalled or the feed has stopped attributing, and those need different responses.`,
        severity: 'medium', region: 'UK', area: 'Affiliates', source: 'affiliates',
      })];
    }
    return [];
  },

  async health() {
    const monthly = await readTable('UK', 'AFF_MONTHLY');
    if (!monthly.length) return health({ label: 'Affiliates', state: 'unknown', note: 'No affiliate data pulled' });
    const sorted = monthly.slice().sort((a, b) => String(a.Month).localeCompare(String(b.Month)));
    const last = sorted[sorted.length - 1];
    return health({ label: 'Affiliates', state: 'warn', score: null, note: `Last recorded month ${last.Month}` });
  },
};
