/**
 * Render any status-bearing record with the task card.
 *
 * Risks, priorities and the rest each had their own table, their own status
 * pill and their own idea of what a row looks like. Same job, three appearances,
 * so the OS taught you a new layout on every tab.
 *
 * The fix is deliberately NOT a lookalike component. These map onto the shape
 * `TaskCard` already reads and render through the real thing, because a
 * lookalike drifts: the moment someone improves the task card, the copy stops
 * matching, and consistency that has to be maintained by hand is consistency
 * you lose.
 *
 * Everything here is additive. TaskDeck and the task pages are untouched.
 */

const { normStatus, normPriority, isoDate, todayISO, PRIORITY_RANK } = require('./tasks');

/**
 * Lanes per record type.
 *
 * Not reused from tasks on purpose: a risk whose status is "Open" belongs in a
 * lane called Open, not one called "To do". The shape is shared, the vocabulary
 * is not, and borrowing the wrong noun is how a generic component starts
 * feeling generic.
 */
const RISK_LANES = [
  { key: 'open',     title: 'Open',        hint: 'live, needs a decision', tone: 'overdue',
    match: s => ['Open', 'To Do', 'Not Started'].includes(s) },
  { key: 'progress', title: 'In progress', hint: 'being worked',           tone: 'now',
    match: s => s === 'In Progress' },
  { key: 'waiting',  title: 'Waiting',     hint: 'blocked or in review',   tone: 'waiting',
    match: s => ['Blocked', 'Waiting', 'Under Review'].includes(s) },
  { key: 'closed',   title: 'Resolved',    hint: 'closed or mitigated',    tone: 'backlog',
    match: s => ['Resolved', 'Closed', 'Mitigated', 'Done', 'Cancelled'].includes(s) },
];

const WORK_LANES = [
  { key: 'now',     title: 'In progress',       hint: 'started, not finished',           tone: 'now',
    match: s => s === 'In Progress' },
  { key: 'todo',    title: 'To do',             hint: 'not started yet',                 tone: 'overdue',
    match: s => ['To Do', 'Not Started', 'Open'].includes(s) },
  { key: 'waiting', title: 'Waiting on others', hint: 'blocked, delegated or in review',  tone: 'waiting',
    match: s => ['Blocked', 'Waiting', 'Under Review'].includes(s) },
  { key: 'done',    title: 'Done',              hint: 'closed or cancelled',             tone: 'backlog',
    match: s => ['Done', 'Cancelled', 'Complete', 'Completed', 'Approved'].includes(s) },
];

/**
 * How each record type maps onto the card.
 *
 * `title` is tried in order, because the same concept is spelled differently
 * across bases and a card with no title is worse than a table.
 */
const RECORD_TYPES = {
  RISKS: {
    label: 'Risk',
    title: ['Risk / Blocker', 'Risk', 'Title'],
    notes: ['Mitigation Plan', 'Notes'],
    priority: ['Impact', 'Priority'],
    area: ['Business Area', 'Category'],
    lanes: RISK_LANES,
    doneValues: ['Resolved', 'Closed', 'Mitigated', 'Done', 'Cancelled'],
    statuses: ['Open', 'In Progress', 'Under Review', 'Blocked', 'Mitigated', 'Resolved', 'Closed'],
    empty: 'No risks logged.',
  },
  PRIORITIES: {
    label: 'Priority',
    title: ['Priority Item', 'Priority', 'Title'],
    notes: ['Notes', 'Detail'],
    priority: ['Priority'],
    area: ['Business Area', 'Category'],
    lanes: WORK_LANES,
    doneValues: ['Done', 'Complete', 'Completed', 'Approved', 'Cancelled'],
    statuses: ['Not Started', 'To Do', 'In Progress', 'Under Review', 'Blocked', 'Done'],
    empty: 'No priorities this week.',
  },
  REGISTRATIONS: {
    label: 'Registration',
    title: ['Product Name', 'Product', 'Title'],
    notes: ['Notes'],
    status: ['Registration Status', 'Status'],
    area: ['Market', 'Country'],
    lanes: WORK_LANES,
    doneValues: ['Approved', 'Registered', 'Done', 'Complete'],
    statuses: ['Not Started', 'In Progress', 'Under Review', 'Blocked', 'Registered', 'Approved'],
    empty: 'No product registrations logged.',
  },
};

const pick = (row, names) => {
  for (const n of names || []) {
    if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') return row[n];
  }
  return '';
};

/**
 * Map one record onto the shape TaskCard reads.
 *
 * `rawFields` is kept so the detail panel can still show everything, exactly as
 * it does for tasks: normalisation is for grouping and sorting, the panel shows
 * the truth.
 */
function normaliseRecord(row, typeKey, { region, regionLabel, flag, baseId, tableId } = {}) {
  const cfg = RECORD_TYPES[typeKey];
  if (!cfg) throw new Error(`Unknown record type ${typeKey}`);
  const f = row.fields || row;
  const rawStatus = pick(f, cfg.status || ['Status']);
  // Two statuses on purpose. The card DISPLAYS the word the business uses —
  // a risk is "Open", not "To Do" — while lanes match on the normalised value
  // so emoji-prefixed and plain spellings still group together. Normalising for
  // display would have the header read Open and the chip read To Do on the same
  // card, which is worse than either alone.
  const laneStatus = normStatus(rawStatus);
  const status = String(rawStatus || '').replace(/[^\p{L}\p{N}\s/&-]/gu, '').trim() || laneStatus;
  const due = isoDate(f['Due Date'] || f.Due || f.Deadline || f['Target Date']);

  return {
    id: row.recordId || row.id,
    baseId, tableId,
    region, regionLabel, flag, tableKey: typeKey,
    title: pick(f, cfg.title) || '(untitled)',
    status,
    laneStatus,
    rawStatus,
    area: pick(f, cfg.area),
    owner: pick(f, ['Owner', 'Assigned To']),
    waitingOn: null,
    priority: normPriority(pick(f, cfg.priority)) || '',
    notes: pick(f, cfg.notes),
    due,
    overdue: !!due && due < todayISO() && !cfg.doneValues.includes(rawStatus),
    dueToday: !!due && due === todayISO(),
    comments: Array.isArray(f.Comments) ? f.Comments.length : 0,
    rawFields: f,
  };
}

/** Sort inside a lane, matching the task rule so the OS behaves the same way. */
function recordSort(a, b) {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  const pr = (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
  if (pr !== 0) return pr;
  return String(a.title).localeCompare(String(b.title));
}

function buildRecordLanes(records, typeKey) {
  const cfg = RECORD_TYPES[typeKey];
  return cfg.lanes.map(lane => ({
    ...lane,
    tasks: records.filter(r => lane.match(r.laneStatus)).sort(recordSort),
  }));
}

const isRecordDone = (record, typeKey) =>
  RECORD_TYPES[typeKey].doneValues.includes(record.rawStatus) ||
  RECORD_TYPES[typeKey].doneValues.includes(record.status) ||
  RECORD_TYPES[typeKey].doneValues.includes(record.laneStatus);

module.exports = { RECORD_TYPES, normaliseRecord, buildRecordLanes, recordSort, isRecordDone };
