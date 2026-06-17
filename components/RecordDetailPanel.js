/**
 * RecordDetailPanel — generic slide-out detail panel for any Airtable record.
 * Used by SortableTable for auto-expand on any table without status editing,
 * and can be used directly with allStatuses/onStatusChange for editable status.
 */
import { useEffect } from 'react';

const STATUS_CLASS = {
  'Done': 'pill-done', 'Complete': 'pill-done', 'Completed': 'pill-done',
  'Approved': 'pill-done', 'Registered': 'pill-done', 'Live': 'pill-done', 'Active': 'pill-done',
  'In Progress': 'pill-progress', 'Under Review': 'pill-progress', 'Submitted': 'pill-progress',
  'To Do': 'pill-todo', 'Not Started': 'pill-todo', 'Pending': 'pill-todo',
  'Blocked': 'pill-blocked', 'At Risk': 'pill-blocked', 'Rejected': 'pill-blocked',
};
function sc(s) { return STATUS_CLASS[s] || 'pill-default'; }

// Try these as the record title in priority order
const TITLE_CANDIDATES = [
  'Task', 'Name', 'Risk / Blocker', 'Priority Item', 'Product Name',
  'SOP Name', 'Contact Name', 'Company', 'Customer', 'Title',
  'Subject', 'Description', 'Item', 'SKU', 'Order Number',
];

// Never show in body — internal/system fields or already shown in header
const SKIP = new Set(['id', 'createdTime']);

// Fields whose value is long text (render multiline)
const LONG_TEXT_KEYS = new Set(['Notes', 'Description', 'Mitigation Plan', 'Details', 'Summary', 'Comments', 'Instructions']);

function isLong(key, value) {
  if (LONG_TEXT_KEYS.has(key)) return true;
  if (typeof value === 'string' && value.length > 100) return true;
  return false;
}

export default function RecordDetailPanel({
  record,
  titleField: titleFieldProp,
  onClose,
  // Optional: enable status editing
  allStatuses,
  onStatusChange,
  saving,
}) {
  useEffect(() => {
    if (!record) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [record, onClose]);

  if (!record) return null;

  const titleField = titleFieldProp
    || TITLE_CANDIDATES.find(f => record[f])
    || Object.keys(record).find(k => !SKIP.has(k) && record[k])
    || '';

  const title = titleField ? (record[titleField] || 'Record') : 'Record';

  const fields = Object.entries(record).filter(([k, v]) => {
    if (SKIP.has(k)) return false;
    if (k === titleField) return false;
    if (v === null || v === undefined || v === '') return false;
    return true;
  });

  function renderValue(key, value) {
    if (value === null || value === undefined || value === '') {
      return <span className="dp-empty">—</span>;
    }
    if (key === 'Status') {
      if (onStatusChange && allStatuses) {
        return (
          <select
            className={`os-pill status-select ${sc(value)}`}
            value={value}
            onChange={e => onStatusChange(record.id, e.target.value)}
            disabled={!!saving}
          >
            {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      }
      return <span className={`os-pill ${sc(value)}`}>{value}</span>;
    }
    if (Array.isArray(value)) return <span>{value.join(', ')}</span>;
    if (isLong(key, value)) return <p className="dp-notes">{value}</p>;
    return <span>{String(value)}</span>;
  }

  return (
    <div className="dp-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <aside className="dp-panel" onClick={e => e.stopPropagation()}>

        <div className="dp-header">
          <div className="dp-header-inner">
            <p className="dp-eyebrow">Detail</p>
            <h2 className="dp-title">{title}</h2>
          </div>
          <button className="dp-close" onClick={onClose} aria-label="Close panel">✕</button>
        </div>

        <div className="dp-body">
          {fields.length === 0 && (
            <p className="dp-empty">No additional fields.</p>
          )}
          {fields.map(([key, value]) => (
            <div key={key} className={`dp-field${isLong(key, value) ? ' dp-field-notes' : ''}`}>
              <span className="dp-label">{key.toUpperCase()}</span>
              <div className="dp-value">{renderValue(key, value)}</div>
            </div>
          ))}
        </div>

        <div className="dp-footer">
          <span className="dp-footer-note">We are efficacy first.</span>
        </div>

      </aside>
    </div>
  );
}
