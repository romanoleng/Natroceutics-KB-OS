import { useState, useMemo, useCallback } from 'react';
import OsLayout from '../components/OsLayout';
import TaskCard from '../components/TaskCard';
import { fetchFromMirror } from '../lib/mirror';
import { BASES, resolveBaseId } from '../lib/airtable-tables';
import { normaliseTask, buildToday, waitingBy } from '../lib/tasks';

/**
 * /all-tasks — "Today", the OS's starting point.
 *
 * Not a task manager. A day view: what is on fire, what is today, and who is
 * holding things up. Backlog exists but stays collapsed, because sorting your
 * backlog should be a deliberate act rather than the first thing you see.
 *
 * Only 84 of 265 tasks carry a due date, so "Today" cannot mean due-today. See
 * buildToday() in lib/tasks.js for what it does mean.
 *
 * Reads the Postgres mirror directly and writes through /api/update-record,
 * which points at Postgres since the 1 Aug migration — so a status change costs
 * nothing and lands instantly.
 */

const REGIONS = [
  ['UK', 'United Kingdom', '🇬🇧'],
  ['ME', 'Middle East', '🇦🇪'],
  ['SA', 'South Africa', '🇿🇦'],
  ['PT', 'Portugal', '🇵🇹'],
  ['AFF', 'Affiliate Ops', '🤝'],
];

function Group({ title, hint, tasks, tone, onStatus, onSnooze, busyId, open = true }) {
  const [show, setShow] = useState(open);
  if (!tasks.length) return null;
  return (
    <section className={`tg tg--${tone}`}>
      <button className="tg-head" onClick={() => setShow(s => !s)}>
        <span className="tg-title">{title}</span>
        <span className="tg-count">{tasks.length}</span>
        {hint && <span className="tg-hint">{hint}</span>}
        <span className={`tg-chev${show ? ' open' : ''}`}>▾</span>
      </button>
      {show && (
        <div className="tg-body">
          {tasks.map(t => (
            <TaskCard key={t.id} task={t} onStatus={onStatus} onSnooze={onSnooze} busy={busyId === t.id} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function TodayPage({ initialTasks, error, serverTime }) {
  const [tasks, setTasks] = useState(initialTasks || []);
  const [busyId, setBusyId] = useState(null);
  const [undo, setUndo] = useState(null);
  const [region, setRegion] = useState('');
  const [who, setWho] = useState('');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks.filter(t =>
      (!region || t.region === region) &&
      (!who || t.owner === who || t.waitingOn === who) &&
      (!needle || t.title.toLowerCase().includes(needle) || (t.notes || '').toLowerCase().includes(needle))
    );
  }, [tasks, region, who, q]);

  const view = useMemo(() => buildToday(filtered), [filtered]);
  const blockers = useMemo(() => waitingBy(filtered), [filtered]);
  const people = useMemo(
    () => [...new Set(tasks.flatMap(t => [t.owner, t.waitingOn]).filter(Boolean))].sort(),
    [tasks]
  );

  /** Optimistic write: the card moves now, and rolls back if the API refuses. */
  const write = useCallback(async (task, fields, optimistic) => {
    setBusyId(task.id);
    const before = tasks.find(t => t.id === task.id);
    setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, ...optimistic } : t)));
    try {
      const res = await fetch('/api/update-record', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseId: task.baseId, tableId: task.tableId, recordId: task.id, fields }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Update failed');
      setUndo({ task: before, label: optimistic.status ? `Marked ${optimistic.status}` : 'Snoozed' });
      // 12s, not 6: on a phone the toast has to survive a glance away, and an
      // undo you cannot reach is the same as no undo.
      setTimeout(() => setUndo(u => (u && u.task.id === before.id ? null : u)), 12000);
    } catch (e) {
      setTasks(ts => ts.map(t => (t.id === task.id ? before : t)));
      alert(`Could not update: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  }, [tasks]);

  const onStatus = useCallback(
    (task, status) => write(task, { Status: status }, { status, overdue: status === 'Done' ? false : task.overdue }),
    [write]
  );

  const onSnooze = useCallback((task, days) => {
    const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    return write(task, { 'Snoozed Until': until }, { snoozedUntil: until });
  }, [write]);

  const revert = useCallback(async () => {
    if (!undo) return;
    const t = undo.task;
    setUndo(null);
    await write(t, { Status: t.rawStatus || t.status }, { status: t.status, overdue: t.overdue });
  }, [undo, write]);

  return (
    <OsLayout title="Today" serverTime={serverTime}>
      <section className="os-hero">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Natroceutics OS</p>
          <h1 className="os-hero-title">Today</h1>
          <p className="today-sub">
            {view.counts.overdue > 0 && <><strong>{view.counts.overdue} overdue</strong> · </>}
            {view.counts.today} to work on · {view.counts.waiting} waiting on others
            {view.counts.backlog > 0 && <> · {view.counts.backlog} in backlog</>}
          </p>
        </div>
      </section>

      <div className="os-page-wrap">
        {error && <div className="os-alert-error">{error}</div>}

        {blockers.length > 0 && (
          <div className="today-blockers">
            {blockers.slice(0, 6).map(b => (
              <button
                key={b.who}
                className={`today-blocker${who === b.who ? ' active' : ''}`}
                onClick={() => setWho(w => (w === b.who ? '' : b.who))}
              >
                {b.who}<span>{b.n}</span>
              </button>
            ))}
          </div>
        )}

        <div className="today-filters">
          <input
            className="today-search"
            placeholder="Search tasks…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select value={region} onChange={e => setRegion(e.target.value)}>
            <option value="">All regions</option>
            {REGIONS.map(([k, label, flag]) => <option key={k} value={k}>{flag} {label}</option>)}
          </select>
          <select value={who} onChange={e => setWho(e.target.value)}>
            <option value="">Anyone</option>
            {people.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <Group title="Overdue" hint="past their due date" tone="overdue" tasks={view.overdue}
               onStatus={onStatus} onSnooze={onSnooze} busyId={busyId} />
        <Group title="Today" hint="in progress, due, or high priority" tone="now" tasks={view.today}
               onStatus={onStatus} onSnooze={onSnooze} busyId={busyId} />
        <Group title="Waiting on others" hint="blocked or delegated" tone="waiting" tasks={view.waiting}
               onStatus={onStatus} onSnooze={onSnooze} busyId={busyId} />
        <Group title="Backlog" hint="nothing due, nothing blocking" tone="backlog" tasks={view.backlog}
               onStatus={onStatus} onSnooze={onSnooze} busyId={busyId} open={false} />
        <Group title="Snoozed" hint="hidden until their date" tone="backlog" tasks={view.snoozed}
               onStatus={onStatus} onSnooze={onSnooze} busyId={busyId} open={false} />

        {view.counts.live === 0 && (
          <div className="os-empty">Nothing open. Either a very good day, or a filter is on.</div>
        )}

        <p className="today-foot">
          {view.counts.total} tasks across {REGIONS.length} modules · {view.done.length} done ·
          {' '}status changes save straight to the database
        </p>
      </div>

      {undo && (
        <div className="today-undo">
          <span>{undo.label}</span>
          <button onClick={revert}>Undo</button>
        </div>
      )}
    </OsLayout>
  );
}

export async function getServerSideProps() {
  try {
    const all = [];
    for (const [key, label, flag] of REGIONS) {
      const base = BASES[key];
      if (!base?.tables?.TASKS) continue;
      const baseId = resolveBaseId(base.envVar);
      const rows = (await fetchFromMirror(baseId, base.tables.TASKS)) || [];
      for (const r of rows) {
        all.push(normaliseTask(
          { ...r, _baseId: baseId, _tableId: base.tables.TASKS },
          key, label, flag, 'TASKS'
        ));
      }
    }
    return { props: { initialTasks: all, error: null, serverTime: new Date().toISOString() } };
  } catch (e) {
    console.error('[today]', e.message);
    return { props: { initialTasks: [], error: e.message, serverTime: new Date().toISOString() } };
  }
}
