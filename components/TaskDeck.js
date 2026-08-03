import { useState, useMemo, useCallback } from 'react';
import TaskCard from './TaskCard';
import TaskGroup from './TaskGroup';
import RecordDetailPanel from './RecordDetailPanel';
import { normaliseTask, buildLanes, laneOf, laneSort, isDone } from '../lib/tasks';

/**
 * Tasks inside a section, grouped by status.
 *
 * This was one flat urgency-sorted list until 3 Aug 2026, and it had a
 * particular fault: status was not part of the sort, so moving a task to
 * Blocked repainted its chip and left the card exactly where it was. Nothing
 * moved out of the way, which made every status change feel like it had not
 * taken. Status is now a LANE, so changing it visibly relocates the card.
 *
 * Lanes rather than Today's three groups: Today triages across every region and
 * asks "what now?", while a section tab is already scoped, so the useful
 * question here is "where is everything up to?".
 *
 * The table view stays a flat list on purpose. Rows are for scanning forty
 * tasks at once, and headings interrupt exactly the reading a table is for.
 */

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
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [view, setView] = useState('cards');

  // Region pages re-fetch on tab change; keep local state in step with props.
  const sig = normalised.map(t => t.id).join('|');
  const [lastSig, setLastSig] = useState(sig);
  if (sig !== lastSig) { setLastSig(sig); setRows(normalised); }

  const matched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter(t => (showDone || !isDone(t)))
      .filter(t => !needle || t.title.toLowerCase().includes(needle) || (t.notes || '').toLowerCase().includes(needle));
  }, [rows, q, showDone]);

  const lanes = useMemo(() => buildLanes(matched), [matched]);
  const visible = useMemo(() => [...matched].sort(laneSort), [matched]);

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
      // Name the destination lane. A card that jumps somewhere else is only
      // reassuring if you are told where it went, and now that lanes are real
      // the toast can read the answer off the same rules the list uses.
      const from = laneOf(before);
      const to = laneOf({ ...before, ...optimistic });
      const movedLane = to && from && to.key !== from.key ? to.title : null;
      setUndo({
        task: before,
        label: optimistic.status
          ? `Marked ${optimistic.status}${movedLane ? ` · moved to ${movedLane}` : ''}`
          : 'Snoozed',
      });
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
  /** Edit a field straight from a chip: due date, owner. Same optimistic path. */
  const onField = useCallback((task, fields, optimistic) => write(task, fields, optimistic), [write]);

  const onSnooze = useCallback((task, days) => {
    const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    return write(task, { 'Snoozed Until': until }, { snoozedUntil: until });
  }, [write]);

  const onDelete = useCallback(async (task) => {
    const before = rows.find(t => t.id === task.id);
    setRows(ts => ts.filter(t => t.id !== task.id));
    try {
      const res = await fetch('/api/delete-record', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseId: task.baseId, tableId: task.tableId, recordId: task.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Delete failed');
      // Keep the raw row so Undo restores it exactly, not a reconstruction.
      setUndo({ task: before, deleted: d.record, label: 'Deleted' });
      setTimeout(() => setUndo(u => (u && u.task.id === before.id ? null : u)), 12000);
    } catch (e) {
      setRows(ts => [...ts, before]);
      alert(`Could not delete: ${e.message}`);
    }
  }, [rows]);

  const revert = useCallback(async () => {
    if (!undo) return;
    const t = undo.task;
    const wasDeleted = undo.deleted;
    setUndo(null);
    if (wasDeleted) {
      await fetch('/api/delete-record', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseId: t.baseId, tableId: t.tableId, recordId: t.id, restore: wasDeleted }),
      }).catch(() => {});
      setRows(ts => (ts.some(x => x.id === t.id) ? ts : [...ts, t]));
      return;
    }
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
        <>
          {lanes.map(lane => (
            <TaskGroup
              key={lane.key}
              title={lane.title} hint={lane.hint} tone={lane.tone} tasks={lane.tasks}
              // Done arrives collapsed. It is here to be checked, not read.
              open={lane.key !== 'done'}
              onStatus={onStatus} onSnooze={onSnooze} onDelete={onDelete}
              onField={onField} onOpen={setDetail} busyId={busyId}
            />
          ))}
        </>
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
                  <td>
                    {t.title}
                    {t.comments > 0 && <span className="td-comments" title={`${t.comments} comments`}>{t.comments}</span>}
                  </td>
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

      {detail && (
        <RecordDetailPanel
          record={{ ...(detail.rawFields || {}), id: detail.id, _baseId: detail.baseId, _tableId: detail.tableId }}
          titleField="Task"
          onClose={() => setDetail(null)}
        />
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
