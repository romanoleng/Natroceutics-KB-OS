/**
 * Task normalisation and the Today view.
 *
 * Tasks live in five Airtable-descended tables that were maintained by hand
 * over a year, so the same concept is spelled many ways: 22 distinct Owner
 * strings for about a dozen people, 12 status variants where "In Progress" and
 * "🟡 In Progress" are different strings to a filter, 10 priority variants.
 * Anything that filters or groups has to normalise first or it silently splits
 * one person into five.
 *
 * Normalisation happens on READ and never mutates the stored row: the raw value
 * stays visible on the card, and a future Airtable re-sync cannot undo our work.
 */

/* ── people ──────────────────────────────────────────────────
 * Canonical names, matched case-insensitively against the raw Owner string.
 * Order matters only for display; matching is by inclusion.
 * ─────────────────────────────────────────────────────────── */
/**
 * Owners include agencies, teams and channels, not only individuals: in this
 * business a task is as likely to sit with "Conscious Commerce" or "Amazon UK"
 * as with a named person, and a filter that only knows people cannot answer
 * "what is Gamma Waves holding".
 *
 * Multi-word entries are matched first so "Amazon UK" is not shortened to
 * "Amazon", and so "Conscious Commerce" wins over a stray "Commerce".
 */
const PEOPLE = [
  // agencies, teams, channels
  'Conscious Commerce', 'Gamma Waves', 'Amazon UK', 'Shopify UK', 'Middle East',
  'South Africa', 'Bionature', 'Web Developer', 'Copywriter', 'Finance',
  'Marketing', 'Warehouse',
  // people
  'Romano', 'Kiara', 'Kevin', 'Kunle', 'Morgan', 'Maria',
  'Shajee', 'Saji', 'Jason', 'Grant', 'Farenaaz', 'Kate', 'Helena',
];

/**
 * "Romano (to Morgan)" and "Romano → Morgan" mean Romano owns it and it now
 * sits with Morgan. That second name is the useful one for chasing, so we keep
 * both: `owner` is who is accountable, `waitingOn` is who is holding it up.
 */
function parseOwner(raw) {
  const s = String(raw || '').trim();
  if (!s) return { owner: null, waitingOn: null, raw: s };

  // Order by where each name APPEARS, not by the order of the PEOPLE list —
  // otherwise "Maria → Romano" and "Kiara (lead) / Romano (supporting)" both
  // report Romano as owner simply because he is first in PEOPLE.
  const lower = s.toLowerCase();
  const found = PEOPLE
    .map(p => ({ p, at: lower.indexOf(p.toLowerCase()) }))
    .filter(x => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(x => x.p);
  const owner = found[0] || null;

  // Delegation markers: "→", "->", "(to X)", "to X"
  let waitingOn = null;
  const arrow = s.match(/(?:→|->|\(to\s+|(?<=\s)to\s+)\s*([A-Za-z][A-Za-z\s]*)/i);
  if (arrow) {
    const target = arrow[1].replace(/[)\]]/g, '').trim();
    const hit = PEOPLE.find(p => target.toLowerCase().includes(p.toLowerCase()));
    // Delegating to yourself is not a block, it is a parse artefact.
    waitingOn = hit && hit !== owner ? hit : null;
  }
  // "Kiara / Kevin" style co-owners: second name is a collaborator, not a block.
  if (!waitingOn && found.length > 1) waitingOn = null;

  return { owner, waitingOn, raw: s };
}

/* ── status ──────────────────────────────────────────────── */
const STATUS_MAP = {
  'done': 'Done', 'complete': 'Done', 'completed': 'Done', 'approved': 'Done',
  'open': 'To Do', 'to do': 'To Do', 'todo': 'To Do',
  'in progress': 'In Progress',
  'not started': 'Not Started',
  'under review': 'Under Review',
  'waiting on': 'Waiting', 'waiting': 'Waiting',
  'blocked': 'Blocked',
  'cancelled': 'Cancelled', 'canceled': 'Cancelled',
};
/** Strip emoji and whitespace, then map. Unknown values pass through as-is. */
function normStatus(raw) {
  const clean = String(raw || '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')   // emoji and punctuation out
    .trim()
    .toLowerCase();
  if (!clean) return 'Not Started';
  return STATUS_MAP[clean] || String(raw).replace(/[^\p{L}\p{N}\s]/gu, '').trim() || 'Not Started';
}

const DONE = new Set(['Done', 'Cancelled']);
const isDone = t => DONE.has(t.status);

/* ── priority ────────────────────────────────────────────── */
const PRIORITY_MAP = {
  'critical': 'Critical', 'urgent': 'Critical',
  'high': 'High',
  'normal': 'Medium', 'medium': 'Medium',
  'low': 'Low',
};
const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3, '': 4 };
function normPriority(raw) {
  const clean = String(raw || '').replace(/[^\p{L}\p{N}\s]/gu, '').trim().toLowerCase();
  return PRIORITY_MAP[clean] || '';
}

/* ── dates ───────────────────────────────────────────────── */
/** ISO date only, or null. Never `new Date(str)` on ambiguous formats. */
function isoDate(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}
const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * One task row from any region table, normalised into a shape the UI can trust.
 */
function normaliseTask(row, regionKey, regionLabel, flag, tableKey) {
  const f = row.fields || row;
  const { owner, waitingOn, raw } = parseOwner(f.Owner || f['Assigned To']);
  const due = isoDate(f['Due Date'] || f.Due || f.Deadline);
  const status = normStatus(f.Status);

  return {
    id: row.recordId || row.id || `${regionKey}:${f.Task}`,
    baseId: row._baseId, tableId: row._tableId,
    region: regionKey, regionLabel, flag, tableKey,
    title: f.Task || f['Priority Item'] || f.Title || '(untitled)',
    area: f['Business Area'] || f.Category || '',
    status,
    rawStatus: f.Status || '',
    priority: normPriority(f.Priority),
    owner, waitingOn, ownerRaw: raw,
    due,
    overdue: !!due && due < todayISO() && !DONE.has(status),
    dueToday: !!due && due === todayISO(),
    notes: f.Notes || f.Details || '',
    phase: f.Phase || '',
    dependencies: f.Dependencies || '',
    entered: isoDate(f['Date of Entry'] || f.Created),
    // When this task ARRIVED, as opposed to when it is due. Backfilled by
    // scripts/normalise-tasks.js and stamped at write time thereafter. Without
    // it, anything the routine adds sorts to the bottom of a list keyed on due
    // dates that 85% of tasks do not have, so new work lands out of sight.
    added: isoDate(f.Added) || isoDate(f['Date of Entry'] || f.Created),
    lastNote: f['Last Note At'] || '',
    snoozedUntil: isoDate(f['Snoozed Until']),
    // Comments moved into the record itself at the migration, so the count is
    // already here. No extra request needed to badge the card.
    comments: Array.isArray(f.Comments) ? f.Comments.length : 0,
    // Kept so the detail panel can show every field, not just the ones the
    // card renders. Normalisation is for filtering; the panel shows truth.
    rawFields: f,
  };
}

/**
 * Split every task into the three groups the day view leads with, plus backlog.
 *
 * Only 84 of 265 tasks carry a due date, so a Today built on due dates alone
 * would be near-empty. Today therefore means "needs a decision now": overdue,
 * due today, blocked, in progress, or Critical/High priority. Everything else
 * is backlog and stays out of the way until asked for.
 */
function buildToday(tasks) {
  const today = todayISO();
  const live = tasks.filter(t => !isDone(t));
  const snoozed = live.filter(t => t.snoozedUntil && t.snoozedUntil > today);
  const awake = live.filter(t => !snoozed.includes(t));

  const overdue = awake.filter(t => t.overdue);
  const rest = awake.filter(t => !overdue.includes(t));

  // HIERARCHY: state beats priority. Blocked, Waiting and Under Review mean the
  // task is not yours to act on right now, so they leave the Today group even
  // when they are High priority. Without this, marking something Blocked left
  // it sitting in front of you and there was no sense of having dealt with it.
  const parked = rest.filter(t =>
    t.status === 'Blocked' || t.status === 'Waiting' || t.status === 'Under Review' || t.waitingOn
  );
  const rest2 = rest.filter(t => !parked.includes(t));

  const now = rest2.filter(t =>
    t.dueToday ||
    t.status === 'In Progress' ||
    t.priority === 'Critical' ||
    t.priority === 'High'
  );
  const waiting = parked;
  const backlog = rest2.filter(t => !now.includes(t));

  const bySeverity = (a, b) => {
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    if (a.due && !b.due) return -1;
    if (!a.due && b.due) return 1;
    return (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
  };

  return {
    overdue: overdue.sort(bySeverity),
    today: now.sort(bySeverity),
    waiting: waiting.sort(bySeverity),
    backlog: backlog.sort(bySeverity),
    snoozed,
    done: tasks.filter(isDone),
    counts: {
      overdue: overdue.length, today: now.length, waiting: waiting.length,
      backlog: backlog.length, live: live.length, total: tasks.length,
    },
  };
}

/** Who is holding things up, most-blocking first. Powers "waiting on Kunle". */
function waitingBy(tasks) {
  const map = new Map();
  for (const t of tasks) {
    if (isDone(t)) continue;
    const who = t.waitingOn || (t.status === 'Waiting' || t.status === 'Blocked' ? t.owner : null);
    if (!who) continue;
    map.set(who, (map.get(who) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([who, n]) => ({ who, n }));
}

/**
 * Open tasks grouped by owner, most-loaded first. Answers "where are the other
 * 60?" — the waiting-on chips only ever showed delegated work, which is a small
 * slice, so the counts never added up to the overdue total.
 */
function ownerLoad(tasks) {
  const map = new Map();
  for (const t of tasks) {
    if (isDone(t)) continue;
    const who = t.owner || 'Unassigned';
    const v = map.get(who) || { who, open: 0, overdue: 0 };
    v.open++;
    if (t.overdue) v.overdue++;
    map.set(who, v);
  }
  return [...map.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open);
}

/* ── status as a place, not just a label ─────────────────────
 * A section list sorted on urgency alone never moves a card when its status
 * changes, because status is not part of that sort. These lanes make status
 * somewhere a card can GO, which is what makes "Blocked" feel like an action
 * rather than a relabelling.
 *
 * Waiting and Blocked share a lane on purpose: from Romano's side of the desk
 * they are the same fact, that the next move belongs to somebody else.
 */
const LANES = [
  { key: 'now',     title: 'In progress',       hint: 'started, not finished',      tone: 'now',
    match: t => t.status === 'In Progress' },
  { key: 'todo',    title: 'To do',             hint: 'not started yet',            tone: 'overdue',
    match: t => t.status === 'To Do' || t.status === 'Not Started' },
  { key: 'waiting', title: 'Waiting on others', hint: 'blocked, delegated or in review', tone: 'waiting',
    match: t => t.status === 'Blocked' || t.status === 'Waiting' || t.status === 'Under Review' },
  { key: 'done',    title: 'Done',              hint: 'closed or cancelled',        tone: 'backlog',
    match: t => DONE.has(t.status) },
];

/**
 * Order inside a lane: overdue, then soonest due, then priority, then newest
 * arrival.
 *
 * Priority sits ABOVE arrival date deliberately. Priority is set on every open
 * task while due dates are set on about 15%, so it is the one signal that is
 * always there — sorting new-first ahead of it would bury a Critical task from
 * June under a Medium one filed this morning.
 *
 * Arrival date then breaks the tie, and that is what stops work the scheduler
 * files from sinking: within a priority band the newest is on top rather than
 * wherever the database happened to return it.
 */
function laneSort(a, b) {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  const pr = (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
  if (pr !== 0) return pr;
  if (a.added && b.added && a.added !== b.added) return a.added > b.added ? -1 : 1;
  if (a.added && !b.added) return -1;
  if (!a.added && b.added) return 1;
  return 0;
}

/** Tasks split into lanes, each already sorted. Empty lanes are kept so the
 *  caller can decide whether to render them; TaskGroup drops them itself. */
function buildLanes(tasks) {
  return LANES.map(lane => ({
    ...lane,
    tasks: tasks.filter(lane.match).sort(laneSort),
  }));
}

/** Which lane a task lands in, so a card can say where it just went. */
const laneOf = task => LANES.find(l => l.match(task)) || null;

/* ── other ways to slice the same list ───────────────────────
 * Status is the default because it is the one axis that is complete and that
 * you change from the card. The rest are lenses on the same cards, not new
 * views to maintain: each returns a bucket name per task, and anything without
 * one falls into a single trailing group rather than vanishing.
 */
const GROUPINGS = {
  status:   { label: 'Status',   of: null },  // handled by LANES
  project:  { label: 'Project',  of: t => t.phase || '', empty: 'No project' },
  area:     { label: 'Area',     of: t => t.area || '',  empty: 'No area' },
  owner:    { label: 'Owner',    of: t => t.owner || '', empty: 'Unassigned' },
  due:      { label: 'Due',      of: null, empty: 'No date' },
};

/** Monday-based week boundaries, so "this week" means what a diary means. */
function dueBucket(task, today = todayISO()) {
  if (!task.due) return null;
  if (task.due < today) return 'Overdue';
  const d = new Date(today + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;               // Monday = 0
  const endOfWeek = new Date(d); endOfWeek.setUTCDate(d.getUTCDate() + (6 - dow));
  const endOfNext = new Date(endOfWeek); endOfNext.setUTCDate(endOfWeek.getUTCDate() + 7);
  const iso = x => x.toISOString().slice(0, 10);
  if (task.due <= iso(endOfWeek)) return 'This week';
  if (task.due <= iso(endOfNext)) return 'Next week';
  return 'Later';
}

const DUE_ORDER = ['Overdue', 'This week', 'Next week', 'Later'];

/**
 * Group by something other than status. Buckets are ordered by size so the
 * biggest pile leads, except Due which has a natural chronological order.
 */
function buildGroups(tasks, key) {
  if (key === 'status' || !GROUPINGS[key]) return buildLanes(tasks);
  const cfg = GROUPINGS[key];
  const pick = key === 'due' ? dueBucket : cfg.of;

  const buckets = new Map();
  for (const t of tasks) {
    const name = pick(t) || cfg.empty;
    if (!buckets.has(name)) buckets.set(name, []);
    buckets.get(name).push(t);
  }

  const entries = [...buckets.entries()].sort((a, b) => {
    if (key === 'due') {
      const ai = DUE_ORDER.indexOf(a[0]), bi = DUE_ORDER.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }
    // The catch-all group sinks, however large it is: it is the absence of an
    // answer, not the most common one.
    if (a[0] === cfg.empty) return 1;
    if (b[0] === cfg.empty) return -1;
    return b[1].length - a[1].length;
  });

  return entries.map(([title, list]) => ({
    key: `${key}:${title}`,
    title,
    hint: '',
    tone: title === 'Overdue' ? 'overdue' : title === cfg.empty ? 'backlog' : 'now',
    tasks: list.sort(laneSort),
  }));
}

module.exports = {
  PEOPLE, parseOwner, normStatus, normPriority, isoDate, todayISO,
  normaliseTask, buildToday, waitingBy, ownerLoad, isDone, PRIORITY_RANK,
  LANES, buildLanes, laneSort, laneOf,
  GROUPINGS, buildGroups, dueBucket,
};
