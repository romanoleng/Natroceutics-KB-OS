/**
 * Feed health as a Mission Control contribution.
 *
 * /status already answers this properly; this module carries the same answer
 * onto Mission Control rather than recomputing it, so the two can never
 * disagree. Its three rules travel with it: silence is never success, a feed
 * with no cadence is never red, and it reports when data ARRIVED, not whether
 * it is correct.
 */
const { ready, empty, error, attention, health, stateFromScore } = require('../contract');
const { getSyncHealth } = require('../../sync-health');

const BAD = new Set(['failed', 'stale', 'never']);

module.exports = {
  id: 'feeds',
  label: 'Data feeds',
  region: null,

  widgets: [{
    id: 'feeds-summary',
    name: 'Feed health',
    category: 'system',
    priority: 20,
    size: 'sm',
    refresh: 300,
    async load() {
      const h = await getSyncHealth();
      if (!h?.ok) return error('Could not read the sync log', h?.reason);
      const feeds = h.feeds || [];
      if (!feeds.length) return empty('No feeds are registered yet.');
      const bad = feeds.filter(f => BAD.has(f.state));
      const due = feeds.filter(f => f.state === 'due');
      const current = feeds.filter(f => f.state === 'fresh').length;
      return ready({
        headline: `${current}/${feeds.length}`,
        sub: 'feeds current',
        rows: [
          { label: 'Overdue', value: String(due.length), tone: due.length ? 'warn' : null },
          { label: 'Stale or failed', value: String(bad.length), tone: bad.length ? 'bad' : null },
          ...[...bad, ...due].slice(0, 3).map(f => ({ label: f.label, value: f.state, tone: 'bad' })),
        ],
      });
    },
  }],

  async attention() {
    const h = await getSyncHealth();
    if (!h?.ok) {
      return [attention({
        id: 'feeds-unreadable',
        title: 'The sync log cannot be read',
        why: `${h?.reason || 'unknown error'}. Until it clears, every figure in the OS is unverified, because nothing can confirm when it last arrived.`,
        severity: 'critical', source: 'feeds', href: '/status',
      })];
    }
    return (h.feeds || [])
      .filter(f => BAD.has(f.state) || f.state === 'due')
      .map(f => attention({
        id: `feed:${f.key}`,
        title: `${f.label} is ${f.state === 'due' ? 'overdue' : f.state}`,
        why: f.error
          ? `Last run reported: ${f.error}`
          : f.ageHours == null
            ? 'It has never run, so nothing downstream of it has ever been populated.'
            : `Last arrived ${Math.round(f.ageHours)}h ago against a ${f.everyHours}h cadence. Anything reading it is that stale.`,
        severity: f.state === 'due' ? 'medium' : 'high',
        region: f.region, area: 'Data', source: 'feeds', href: '/status',
      }));
  },

  async health() {
    const h = await getSyncHealth();
    if (!h?.ok) return health({ label: 'Data feeds', state: 'unknown', note: 'Sync log unreadable' });
    const feeds = (h.feeds || []).filter(f => f.everyHours);
    if (!feeds.length) return health({ label: 'Data feeds', state: 'unknown', note: 'No scheduled feeds' });
    const good = feeds.filter(f => f.state === 'fresh').length;
    const score = Math.round((good / feeds.length) * 100);
    return health({
      label: 'Data feeds',
      state: stateFromScore(score),
      score,
      note: `${good} of ${feeds.length} scheduled feeds current`,
    });
  },
};
