import { useState, useMemo, useCallback } from 'react';
import TaskCard from './TaskCard';
import TaskGroup from './TaskGroup';
import RecordDetailPanel from './RecordDetailPanel';
import { RECORD_TYPES, normaliseRecord, buildRecordLanes, recordSort, isRecordDone } from '../lib/record-decks';

/**
 * Risks, priorities and registrations, rendered as the task card.
 *
 * Each of these used to have its own table, its own status pill and its own row
 * layout, so the OS taught you a different reading pattern on every tab. This
 * renders them through the REAL TaskCard rather than a lookalike, because a
 * lookalike drifts the moment the task card improves, and consistency you have
 * to maintain by hand is consistency you eventually lose.
 *
 * Same lanes, same collapse-by-default, same optimistic write with undo. Only
 * the vocabulary changes per type: a risk that is Open belongs in a lane called
 * Open, not one called "To do".
 */
export default function RecordDeck({
  records = [], type, region, regionLabel, flag, baseId, tableId, emptyMsg,
}) {
  const cfg = RECORD_TYPES[type];
  const normalised = useMemo(
    () => records.map(r => normaliseRecord(
      { recordId: r.id || r.recordId, fields: r },
      type,
      { region, regionLabel, flag, baseId, tableId }
    )),
    [records, type, region, regionLabel, flag, baseId, tableId]
  );

  const [rows, setRows] = useState(normalised);
  const [busyId, setBusyId] = useState(null);
  const [undo, setUndo] = useState(null);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);

  // Region pages re-fetch on tab change; keep local state in step with props.
  const sig = normalised.map(r => r.id).join('|');
  const [lastSig, setLastSig] = useState(sig);
  if (sig !== lastSig) { setLastSig(sig); setRows(normalised); }

  const matched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter(r => showDone || !isRecordDone(r, type))
      .filter(r => !needle
        || r.title.toLowerCase().includes(needle)
        || (r.notes || '').toLowerCase().includes(needle));
  }, [rows, q, showDone, type]);

  const lanes = useMemo(() => buildRecordLanes(matched, type), [matched, type]);
  const open = rows.filter(r => !isRecordDone(r, type)).length;
  const overdue = rows.filter(r => r.overdue).length;

  const write = useCallback(async (record, fields, optimistic) => {
    setBusyId(record.id);
    const before = rows.find(r => r.id === record.id);
    setRows(rs => rs.map(r => (r.id === record.id ? { ...r, ...optimistic } : r)));
    try {
      const res = await fetch('/api/update-record', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseId, tableId, recordId: record.id, fields }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || d.error || 'Update failed');
      }
      const to = cfg.lanes.find(l => l.match(optimistic.laneStatus || optimistic.status || record.laneStatus));
      const from = cfg.lanes.find(l => l.match(record.laneStatus));
      setUndo({
        record: before,
        label: optimistic.status
          ? `Marked ${optimistic.status}${to && from && to.key !== from.key ? ` · moved to ${to.title}` : ''}`
          : 'Updated',
      });
      setTimeout(() => setUndo(u => (u && u.record.id === before.id ? null : u)), 12000);
    } catch (e) {
      setRows(rs => rs.map(r => (r.id === record.id ? before : r)));
      alert(`Could not update: ${e.message}`);
    } finally { setBusyId(null); }
  }, [rows, baseId, tableId, cfg]);

  const onStatus = useCallback((record, status) => {
    // The card's Complete button says "Done"; for a risk the closing word is
    // Resolved. Translate at the boundary so the card stays generic and the
    // record keeps the vocabulary its own table uses.
    const closing = cfg.doneValues.includes('Resolved') && status === 'Done' ? 'Resolved' : status;
    const statusField = (cfg.status && cfg.status[0]) || 'Status';
    return write(record, { [statusField]: closing }, { status: closing, laneStatus: closing, rawStatus: closing, overdue: false });
  }, [write, cfg]);

  const onField = useCallback((record, fields, optimistic) => write(record, fields, optimistic), [write]);

  const revert = useCallback(async () => {
    if (!undo) return;
    const r = undo.record;
    setUndo(null);
    const statusField = (cfg.status && cfg.status[0]) || 'Status';
    await write(r, { [statusField]: r.rawStatus || r.status }, { status: r.status, laneStatus: r.laneStatus, rawStatus: r.rawStatus, overdue: r.overdue });
  }, [undo, write, cfg]);

  if (!records.length) return <div className="os-empty">{emptyMsg || cfg.empty}</div>;

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
          Closed
        </label>
      </div>

      {matched.length === 0 && <div className="os-empty">Nothing matches.</div>}

      {lanes.map(lane => (
        <TaskGroup
          key={lane.key}
          title={lane.title} hint={lane.hint} tone={lane.tone} tasks={lane.tasks}
          open={false}
          onStatus={onStatus} onField={onField} onOpen={setDetail} busyId={busyId}
        />
      ))}

      {detail && (
        <RecordDetailPanel
          record={{ ...(detail.rawFields || {}), id: detail.id, _baseId: baseId, _tableId: tableId }}
          titleField={cfg.title[0]}
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
