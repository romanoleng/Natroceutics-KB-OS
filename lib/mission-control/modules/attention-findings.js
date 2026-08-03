/**
 * Findings as a Mission Control contribution.
 *
 * The findings pass is the OS checking itself: a finding is two records that
 * disagree, never an observation. Those are the highest-quality attention items
 * in the system because each one already names both sides and its consequence,
 * so they need no re-interpretation here.
 */
const { ready, empty, error, attention, health } = require('../contract');
const { getFindings } = require('../../findings');

const SEV = { High: 'high', Medium: 'medium', Low: 'low' };

/** Findings another module reports independently. Same fact, one row. */
const DEDUPE = { 'find:uk-zero-stock': 'uk-amazon-zero-stock', 'find:uk-cost-gaps': 'uk-shopify-cost-gaps' };

module.exports = {
  id: 'findings',
  label: 'Findings',
  region: null,

  widgets: [{
    id: 'findings-open',
    name: 'Open findings',
    category: 'system',
    priority: 10,
    size: 'sm',
    refresh: 900,
    async load() {
      const f = await getFindings();
      if (!f.ok) return error('Could not read the findings table', f.reason);
      if (!f.open.length) {
        return empty(f.other
          ? `Nothing currently disagrees. ${f.other} finding${f.other === 1 ? '' : 's'} closed or stale.`
          : 'The findings pass has not raised anything.');
      }
      const high = f.open.filter(x => x.Severity === 'High').length;
      return ready({
        headline: String(f.open.length),
        sub: f.open.length === 1 ? 'open finding' : 'open findings',
        rows: [
          { label: 'High severity', value: String(high), tone: high ? 'bad' : null },
          ...f.open.slice(0, 2).map(x => ({ label: x.Severity, value: x.Finding.slice(0, 60) })),
        ],
      });
    },
  }],

  async attention() {
    const f = await getFindings();
    if (!f.ok) {
      return [attention({
        id: 'findings-unreadable',
        title: 'Findings cannot be read',
        why: `${f.reason}. The OS is not currently checking itself, so a contradiction would go unreported.`,
        severity: 'high', source: 'findings', href: '/status',
      })];
    }
    return f.open.map(x => attention({
      id: `finding:${x.recordId}`,
      title: x.Finding,
      why: `${x['Why it matters'] || ''} ${x['Money at risk'] ? `Money at risk: ${x['Money at risk']}.` : ''}`.trim(),
      severity: SEV[x.Severity] || 'medium',
      region: x.Area, area: x.Page, source: 'findings', href: '/status',
      // Findings carry their own ids; map the ones another module also sees.
      dedupeKey: DEDUPE[x.recordId] || null,
    }));
  },

  async health() {
    const f = await getFindings();
    if (!f.ok) return health({ label: 'Self-check', state: 'unknown', note: 'Findings unreadable' });
    const high = f.open.filter(x => x.Severity === 'High').length;
    return health({
      label: 'Self-check',
      state: high ? 'bad' : f.open.length ? 'warn' : 'good',
      score: null,
      note: f.open.length ? `${f.open.length} open, ${high} high` : 'Nothing disagrees',
    });
  },
};
