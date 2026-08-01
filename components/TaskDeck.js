import { useState, useMemo, useCallback } from 'react';
import TaskCard from './TaskCard';
import { normaliseTask, PRIORITY_RANK, isDone } from '../lib/tasks';

/**
 * Tasks inside a section — the same cards as Today, in a flatter container.
 *
 * Today is a TRIAGE view: three groups answering "what do I do now?" across
 * every region. A section's Tasks tab is already scoped, so re-triaging it adds
 * noise. This is one urgency-sorted list instead, with a table toggle because
 * scanning forty-odd tasks is genuinely faster in rows than in cards.
 *
 * Same TaskCard, same optimistic write, same undo. One component replaces the
 * four near-identical TaskTable copies that lived in uk/me/sa/pt.
 */

const urgency = (a, b) => {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
};

export default function TaskDeck({ tasks = [], region, regionLabel, flag, baseId, tableId, emptyMsg }) {
  const normalised = useMemo(
    () => tasks.map(t => normaliseTask(
      { ...t, recordId: t.id || t.recordId, _baseId: baseId, _tableId: tableId },
      region, regionLabel, flag, 'TASKS'
    )),
    [tasks, region, regionLabel, flag, baseId, tableId]
  );

  const [rows, setRows] = useState(normalised);
  const [busyId, setBusyId] = useState(null);
  const [undo, setUndo] = useState(null);
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [view, setView] = useState('cards');

  // Region pages re-fetch on tab change; keep local state in step with props.
  const sig = normalised.map(t => t.id).join('|');
  const [lastSig, setLastSig] = useState(sig);
  if (sig !== lastSig) { setLastSig(sig); setRows(normalised); }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter(t => (showDone || !isDone(t)))
      .filter(t => !needle || t.title.toLowerCase().includes(needle) || (t.notes || '').toLowerCase().includes(needle))
      .sort(urgency);
  }, [rows, q, showDone]);

  const open = rows.filter(t => !isDone(t)).length;
  const overdue = rows.filter(t => t.overdue).length;

  const write = useCallback(async (task, fields, optimistic) => {
    setBusyId(task.id);
    const before = rows.find(t => t.id === task.id);
    setRows(ts => ts.map(t => (t.id === task.id ? { ...t, ...optimistic } : t)));
    try {
      const res = await fetch('/api/update-record', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseId: task.baseId, tableId: task.tableId, recordId: task.id, fields }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Update failed');
      setUndo({ task: before, label: optimistic.status ? `Marked ${optimistic.status}` : 'Snoozed' });
      setTimeout(() => setUndo(u => (u && u.task.id === before.id ? null : u)), 12000);
    } catch (e) {
      setRows(ts => ts.map(t => (t.id === task.id ? before : t)));
      alert(`Could not update: ${e.message}`);
    } finally { setBusyId(null); }
  }, [rows]);

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

  if (!tasks.length) return <div className="os-empty">{emptyMsg || 'No tasks yet.'}</div>;

  return (
    <>
      <div className="td-bar">
        <div className="td-counts">
          <span className="td-count">{open} open</span>
          {overdue > 0 && <span className="td-count td-count--od">{overdue} overdue</span>}
        </div>
        <input className="td-search" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
        <label className="td-toggle">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          Done
        </label>
        <div className="td-view">
          {['cards', 'table'].map(v => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)} type="button">{v}</button>
          ))}
        </div>
      </div>

      {visible.length === 0 && <div className="os-empty">Nothing matches.</div>}

      {view === 'cards' ? (
        <div className="tg-body">
          {visible.map(t => (
            <TaskCard key={t.id} task={t} onStatus={onStatus} onSnooze={onSnooze} busy={busyId === t.id} />
          ))}
        </div>
      ) : (
        <div className="sp-scroll">
          <table className="sp-table">
            <thead>
              <tr>
                <th>Task</th><th>Status</th><th>Priority</th><th>Owner</th>
                <th>Due</th><th>Area</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(t => (
                <tr key={t.id} className={t.overdue ? 'td-row--od' : ''}>
                  <td>{t.title}</td>
                  <td><span className="tc-status">{t.status}</span></td>
                  <td>{t.priority || '—'}</td>
                  <td>{t.owner || '—'}{t.waitingOn && <span className="td-wait"> → {t.waitingOn}</span>}</td>
                  <td className="sp-num">{t.due || '—'}</td>
                  <td>{t.area || '—'}</td>
                  <td>
                    {!isDone(t) && (
                      <button className="tc-btn tc-btn--done" disabled={busyId === t.id}
                              onClick={() => onStatus(t, 'Done')}>Done</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {undo && (
        <div className="today-undo">
          <span>{undo.label}</span>
          <button onClick={revert}>Undo</button>
        </div>
      )}
    </>
  );
}
