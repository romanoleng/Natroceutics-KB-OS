import { useEffect } from 'react';

/* ── Status colours (mirrors page-level STATUS_CLASS maps) ─── */
const STATUS_CLASS = {
  'Done': 'pill-done', 'Complete': 'pill-done', 'Completed': 'pill-done',
  'Approved': 'pill-done', 'Registered': 'pill-done', 'Live': 'pill-done', 'Active': 'pill-done',
  'In Progress': 'pill-progress', 'Under Review': 'pill-progress', 'Submitted': 'pill-progress',
  'To Do': 'pill-todo', 'Not Started': 'pill-todo', 'Pending': 'pill-todo',
  'Blocked': 'pill-blocked', 'At Risk': 'pill-blocked', 'Rejected': 'pill-blocked',
};
function sc(s) { return STATUS_CLASS[s] || 'pill-default'; }

/* Fields shown in fixed order at the top of the panel */
const PRIMARY_FIELDS = [
  { key: 'Date of Entry', label: 'DATE OF ENTRY' },
  { key: 'Status',        label: 'STATUS' },
  { key: 'Owner',         label: 'OWNER' },
  { key: 'Due Date',      label: 'DUE DATE' },
];

/* Secondary fields shown below a divider */
const SECONDARY_FIELDS = [
  { key: 'Business Area', label: 'BUSINESS AREA' },
  { key: 'Phase',         label: 'PHASE' },
  { key: 'Priority',      label: 'PRIORITY' },
  { key: 'Notes',         label: 'NOTES' },
];

/* Keys never shown as "extra" fields */
const SKIP = new Set([
  'id', 'createdTime', 'Task', 'Status', 'Owner', 'Due Date',
  'Date of Entry', 'Business Area', 'Phase', 'Priority', 'Notes',
]);

export default function TaskDetailPanel({
  task,
  onClose,
  allStatuses,
  onStatusChange,
  saving,
}) {
  /* Close on Escape */
  useEffect(() => {
    if (!task) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [task, onClose]);

  if (!task) return null;

  /* Extra fields — anything populated that isn't already shown */
  const extra = Object.entries(task).filter(([k, v]) => {
    if (SKIP.has(k)) return false;
    if (v === null || v === undefined || v === '') return false;
    return true;
  });

  function renderValue(key, value) {
    if (value === null || value === undefined || value === '') {
      return <span className="dp-empty">—</span>;
    }
    if (key === 'Status') {
      /* Editable if callbacks provided */
      if (onStatusChange && allStatuses) {
        return (
          <select
            className={`os-pill status-select ${sc(value)}`}
            value={value}
            onChange={e => onStatusChange(task.id, e.target.value)}
            disabled={!!saving}
          >
            {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      }
      return <span className={`os-pill ${sc(value)}`}>{value}</span>;
    }
    if (key === 'Notes') return <p className="dp-notes">{value}</p>;
    if (Array.isArray(value)) return <span>{value.join(', ')}</span>;
    return <span>{String(value)}</span>;
  }

  const secondaryVisible = SECONDARY_FIELDS.filter(f => task[f.key]);
  const hasExtra = extra.length > 0;

  return (
    <div className="dp-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <aside className="dp-panel" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="dp-header">
          <div className="dp-header-inner">
            <p className="dp-eyebrow">Task Detail</p>
            <h2 className="dp-title">{task.Task || 'Untitled Task'}</h2>
          </div>
          <button className="dp-close" onClick={onClose} aria-label="Close panel">✕</button>
        </div>

        {/* ── Body ── */}
        <div className="dp-body">

          {/* Primary fields */}
          {PRIMARY_FIELDS.map(({ key, label }) => (
            <div key={key} className="dp-field">
              <span className="dp-label">{label}</span>
              <div className="dp-value">{renderValue(key, task[key])}</div>
            </div>
          ))}

          {/* Secondary fields */}
          {secondaryVisible.length > 0 && (
            <>
              <div className="dp-divider" />
              {secondaryVisible.map(({ key, label }) => (
                <div key={key} className={`dp-field${key === 'Notes' ? ' dp-field-notes' : ''}`}>
                  <span className="dp-label">{label}</span>
                  <div className="dp-value">{renderValue(key, task[key])}</div>
                </div>
              ))}
            </>
          )}

          {/* Extra populated fields */}
          {hasExtra && (
            <>
              <div className="dp-divider" />
              {extra.map(([key, value]) => (
                <div key={key} className="dp-field">
                  <span className="dp-label">{key.toUpperCase()}</span>
                  <div className="dp-value">{renderValue(key, value)}</div>
                </div>
              ))}
            </>
          )}

        </div>

        {/* ── Footer ── */}
        <div className="dp-footer">
          <span className="dp-footer-note">We are efficacy first.</span>
        </div>

      </aside>
    </div>
  );
}
