/**
 * Middle East.
 *
 * The store is not live, so the revenue widget is EMPTY with that reason rather
 * than absent or zero. That is the contract working as intended: the widget
 * will start rendering by itself the day orders exist, and nobody edits Mission
 * Control to make it happen.
 */
const { ready, empty, attention, health, stateFromScore } = require('../contract');
const { readTable, n } = require('./_read');

module.exports = {
  id: 'middle-east',
  label: 'Middle East',
  region: 'ME',

  widgets: [
    {
      id: 'me-revenue',
      name: 'ME revenue',
      category: 'sales',
      priority: 45,
      size: 'sm',
      refresh: 3600,
      async load() {
        const fin = await readTable('ME', 'FINANCE');
        const withRevenue = fin.filter(r => n(r['Gross Revenue (AED)']) !== null);
        if (!withRevenue.length) {
          return empty('The ME store is not live yet, so there is no revenue to report.');
        }
        const last = withRevenue.slice().sort((a, b) => String(a.Period).localeCompare(String(b.Period))).pop();
        return ready({
          headline: `AED ${(n(last['Gross Revenue (AED)']) || 0).toLocaleString('en-GB')}`,
          sub: `gross · ${last.Period}`,
          rows: [{ label: 'Net', value: `AED ${(n(last['Net Revenue (AED)']) || 0).toLocaleString('en-GB')}` }],
        });
      },
    },
    {
      id: 'me-launch',
      name: 'ME launch readiness',
      category: 'projects',
      priority: 42,
      size: 'sm',
      refresh: 3600,
      async load() {
        const regs = await readTable('ME', 'REGISTRATIONS');
        if (!regs.length) return empty('No ME product registrations are recorded.');
        const approved = regs.filter(r => ['Approved', 'Registered', 'Done', 'Complete'].includes(r['Registration Status']));
        return ready({
          headline: `${approved.length}/${regs.length}`,
          sub: 'products registered',
          rows: [{ label: 'Awaiting registration', value: String(regs.length - approved.length),
                   tone: regs.length - approved.length ? 'warn' : null }],
        });
      },
    },
  ],

  async attention() {
    const risks = await readTable('ME', 'RISKS');
    const open = risks.filter(r => !/resolved|closed|done|mitigated/i.test(r.Status || ''));
    if (!open.length) return [];
    const high = open.filter(r => /high|critical/i.test(r.Impact || ''));
    if (!high.length) return [];
    return [attention({
      id: 'me-risks',
      title: `${high.length} high-impact ME risk${high.length === 1 ? '' : 's'} open`,
      why: `${high.slice(0, 2).map(r => `"${r['Risk / Blocker']}"`).join(', ')}. These sit on the launch path, so they gate the store going live.`,
      severity: 'medium', region: 'ME', area: 'Risks', source: 'middle-east', href: '/me',
    })];
  },

  async health() {
    const regs = await readTable('ME', 'REGISTRATIONS');
    if (!regs.length) return health({ label: 'Middle East', state: 'unknown', note: 'No registrations recorded' });
    const approved = regs.filter(r => ['Approved', 'Registered', 'Done', 'Complete'].includes(r['Registration Status'])).length;
    const score = Math.round((approved / regs.length) * 100);
    return health({
      label: 'Middle East',
      state: stateFromScore(score),
      score,
      note: `${approved} of ${regs.length} products registered`,
    });
  },
};
