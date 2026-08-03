/**
 * Middle East.
 *
 * The store is not live, so the revenue widget is EMPTY with that reason rather
 * than absent or zero. That is the contract working as intended: the widget
 * will start rendering by itself the day orders exist, and nobody edits Mission
 * Control to make it happen.
 */
const { ready, empty, attention, health, stateFromScore, insight, action } = require('../contract');
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

  async insights() {
    const regs = await readTable('ME', 'REGISTRATIONS');
    const out = [];
    if (regs.length) {
      const approved = regs.filter(r => ['Approved', 'Registered', 'Done', 'Complete'].includes(r['Registration Status']));
      out.push(insight({
        id: 'me-regs',
        headline: 'Products cleared for the Middle East',
        value: `${approved.length} of ${regs.length}`,
        comparison: `registered, out of the ${regs.length} products in the ME catalogue`,
        why: approved.length === regs.length
          ? 'Registration is no longer a launch blocker.'
          : `${regs.length - approved.length} still to clear before they can be sold.`,
        tone: approved.length === regs.length ? 'up' : 'flat',
      }));
    }

    const model = await readTable('ME', 'COST_MODEL');
    const total = model.find(r => String(r['Cost Component'] || '').startsWith('Estimated monthly'));
    if (total && total['Middle East (UAE + Kuwait)']) {
      out.push(insight({
        id: 'me-runcost',
        headline: 'Estimated cost to run the ME store',
        value: String(total['Middle East (UAE + Kuwait)']).split('(')[0].trim(),
        comparison: `against ${String(total['United Kingdom'] || '').split('(')[0].trim() || 'the UK figure'} for the UK store`,
        why: 'Draft estimate from the Gamma Waves quote, not a measured cost. ME runs higher because of the Tap Payments gateway.',
        tone: 'flat',
      }));
    }
    return out;
  },

  async actions() {
    const out = [];
    const risks = await readTable('ME', 'RISKS');
    const open = risks.filter(r => !/resolved|closed|done|mitigated/i.test(r.Status || ''));
    const high = open.filter(r => /high|critical/i.test(r.Impact || ''));
    if (high.length) {
      out.push(action({
        id: 'me-risks',
        title: `${high.length} high-impact risks open on the launch path`,
        next: `Work ${high.slice(0, 2).map(r => `"${r['Risk / Blocker']}"`).join(' and ')} to a decision. Each one gates the store going live.`,
        why: 'These are not background risks; they sit between here and launch.',
        severity: 'high', href: '/me?t=risks',
      }));
    }

    const regs = await readTable('ME', 'REGISTRATIONS');
    const pending = regs.filter(r => !['Approved', 'Registered', 'Done', 'Complete'].includes(r['Registration Status']));
    if (pending.length) {
      out.push(action({
        id: 'me-regs-pending',
        title: `${pending.length} products not yet registered`,
        next: `Chase registration for ${pending.slice(0, 3).map(r => r['Product Name'] || r.Product).filter(Boolean).join(', ') || 'the outstanding products'}. Nothing unregistered can be listed at launch.`,
        why: 'Registration lead time is the long pole on a ME launch date.',
        severity: 'medium', href: '/me?t=registrations',
      }));
    }
    return out;
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
