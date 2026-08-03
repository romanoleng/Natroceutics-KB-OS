/**
 * Tasks across every region.
 *
 * Answers "what should I do next" from the one axis that is complete: status.
 * Due dates exist on roughly 15% of tasks, so anything keyed on them alone
 * would under-report — which is why overdue is reported as a count of what has
 * a date, never as a share of everything.
 */
const { ready, empty, error, attention, health, stateFromScore } = require('../contract');
const { readTable } = require('./_read');
const { normaliseTask, isDone } = require('../../tasks');
const { BASES } = require('../../airtable-tables');

const REGIONS = [
  ['UK', 'United Kingdom', '🇬🇧'],
  ['ME', 'Middle East', '🇦🇪'],
  ['SA', 'South Africa', '🇿🇦'],
  ['PT', 'Portugal', '🇵🇹'],
  ['AFF', 'Affiliates', '🤝'],
];

async function allOpen() {
  const out = [];
  for (const [key, label, flag] of REGIONS) {
    if (!BASES[key]?.tables?.TASKS) continue;
    const rows = await readTable(key, 'TASKS');
    for (const r of rows) {
      const t = normaliseTask(
        { recordId: r.recordId, fields: r, _baseId: BASES[key].defaultBaseId, _tableId: BASES[key].tables.TASKS },
        key, label, flag, 'TASKS'
      );
      if (!isDone(t)) out.push(t);
    }
  }
  return out;
}

module.exports = {
  id: 'tasks',
  label: 'Tasks',
  region: null,

  widgets: [{
    id: 'tasks-open',
    name: 'Open work',
    category: 'projects',
    priority: 15,
    size: 'sm',
    refresh: 300,
    async load() {
      const open = await allOpen();
      if (!open.length) return empty('Nothing is open across any region.');
      const overdue = open.filter(t => t.overdue);
      const waiting = open.filter(t => ['Blocked', 'Waiting', 'Under Review'].includes(t.status));
      const dated = open.filter(t => t.due);
      return ready({
        headline: String(open.length),
        sub: 'open across all regions',
        rows: [
          { label: 'Overdue', value: `${overdue.length} of ${dated.length} dated`, tone: overdue.length ? 'bad' : null },
          { label: 'Waiting on others', value: String(waiting.length), tone: waiting.length ? 'warn' : null },
          ...REGIONS.map(([k, label]) => ({ label, value: String(open.filter(t => t.region === k).length) }))
            .filter(r => r.value !== '0'),
        ],
      });
    },
  }],

  async attention() {
    const open = await allOpen();
    const items = [];

    // Overdue is reported per region rather than per task: forty individual
    // rows would drown every other module in the Attention Centre.
    for (const [key, label] of REGIONS) {
      const od = open.filter(t => t.region === key && t.overdue);
      if (!od.length) continue;
      const worst = od.slice().sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
      items.push(attention({
        id: `tasks-overdue:${key}`,
        title: `${od.length} overdue task${od.length === 1 ? '' : 's'} in ${label}`,
        why: `Oldest is "${worst.title}", due ${worst.due}. Overdue counts only tasks that carry a due date, so the real backlog may be larger.`,
        severity: od.length >= 10 ? 'high' : 'medium',
        region: key, area: 'Tasks', source: 'tasks', href: '/all-tasks',
      }));
    }

    const blocked = open.filter(t => t.status === 'Blocked');
    if (blocked.length) {
      items.push(attention({
        id: 'tasks-blocked',
        title: `${blocked.length} task${blocked.length === 1 ? '' : 's'} blocked`,
        why: `Blocked work cannot move without someone else. ${blocked.slice(0, 2).map(t => `"${t.title}"`).join(', ')}${blocked.length > 2 ? ` and ${blocked.length - 2} more` : ''}.`,
        severity: 'medium', area: 'Tasks', source: 'tasks', href: '/all-tasks',
      }));
    }
    return items;
  },

  async health() {
    const open = await allOpen();
    if (!open.length) return health({ label: 'Tasks', state: 'good', score: 100, note: 'Nothing open' });
    const dated = open.filter(t => t.due);
    if (!dated.length) {
      // No due dates means overdue cannot be measured. Saying "healthy" here
      // would be an assertion built on nothing.
      return health({ label: 'Tasks', state: 'unknown', note: `${open.length} open, none with a due date` });
    }
    const overdue = open.filter(t => t.overdue).length;
    const score = Math.round(((dated.length - overdue) / dated.length) * 100);
    return health({
      label: 'Tasks',
      state: stateFromScore(score),
      score,
      note: `${overdue} overdue of ${dated.length} dated · ${open.length} open`,
    });
  },
};
