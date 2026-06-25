import { useState, useEffect } from 'react';

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
  'id', 'createdTime', '_baseId', '_tableId', 'Task', 'Status', 'Owner', 'Due Date',
  'Date of Entry', 'Business Area', 'Phase', 'Priority', 'Notes',
]);

function fmtCommentDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function fmtShortDate(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch { return null; }
}

/* Parse any date string to YYYY-MM-DD for <input type="date"> */
function toDateInputVal(v) {
  if (!v) return '';
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch { return ''; }
}

export default function TaskDetailPanel({
  task,
  onClose,
  allStatuses,
  onStatusChange,
  saving,
}) {
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [dateEntry, setDateEntry] = useState('');
  const [dateSaving, setDateSaving] = useState(false);

  const baseId = task?._baseId;
  const tableId = task?._tableId;
  const recordId = task?.id;
  const canComment = !!(baseId && tableId && recordId);

  /* Reset date input when task changes */
  useEffect(() => {
    setDateEntry(toDateInputVal(task?.['Date of Entry']));
  }, [task?.id]);

  /* Close on Escape */
  useEffect(() => {
    if (!task) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [task, onClose]);

  /* Fetch comments when panel opens */
  useEffect(() => {
    if (!canComment) { setCommentsLoaded(true); return; }
    setCommentsLoaded(false);
    setCommentsDisabled(false);
    setComments([]);
    fetch(`/api/record-comments?baseId=${encodeURIComponent(baseId)}&tableId=${encodeURIComponent(tableId)}&recordId=${encodeURIComponent(recordId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.permissionsError) { setCommentsDisabled(true); }
        else { setComments(data.comments || []); }
        setCommentsLoaded(true);
      })
      .catch(() => setCommentsLoaded(true));
  }, [baseId, tableId, recordId]);

  async function handleDateBlur() {
    if (!dateEntry || !baseId || !tableId || !recordId) return;
    if (dateEntry === toDateInputVal(task?.['Date of Entry'])) return; // unchanged
    setDateSaving(true);
    try {
      await fetch('/api/update-record', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseId, tableId, recordId, fields: { 'Date of Entry': dateEntry } }),
      });
    } catch { /* silent — show field still has new value */ }
    setDateSaving(false);
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!commentText.trim() || posting || commentsDisabled) return;
    setPosting(true);
    setCommentError('');
    try {
      const res = await fetch('/api/record-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseId, tableId, recordId, text: commentText.trim() }),
      });
      const data = await res.json();
      if (data.permissionsError) {
        setCommentsDisabled(true);
      } else if (data.comment) {
        setComments(prev => [...prev, data.comment]);
        setCommentText('');
      } else {
        setCommentError(data.error || 'Failed to post comment');
      }
    } catch {
      setCommentError('Network error — please try again');
    }
    setPosting(false);
  }

  if (!task) return null;

  /* Extra fields — anything populated that isn't already shown */
  const extra = Object.entries(task).filter(([k, v]) => {
    if (SKIP.has(k)) return false;
    if (v === null || v === undefined || v === '') return false;
    return true;
  });

  function renderValue(key, value) {
    if (key === 'Date of Entry') {
      if (dateEntry) {
        // Manually set date → show editable input
        return (
          <input
            type="date"
            className="dp-date-input"
            value={dateEntry}
            onChange={e => setDateEntry(e.target.value)}
            onBlur={handleDateBlur}
            disabled={dateSaving}
            title={dateSaving ? 'Saving…' : 'Click to change date'}
          />
        );
      }
      // No manual date — fall back to record createdTime
      const loggedDate = fmtShortDate(task?.createdTime);
      if (loggedDate) {
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="os-mono" style={{ fontSize: 12 }}>{loggedDate}</span>
            <span style={{ fontSize: 10, color: 'var(--charcoal-45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>logged</span>
          </span>
        );
      }
      return <span className="dp-empty">—</span>;
    }
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
              <span className="dp-label">{label}{key === 'Date of Entry' && dateSaving ? ' ·saving' : ''}</span>
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

        {/* ── Activity & Comments ── */}
        <div className="dp-comments">
          <div className="dp-comments-header">
            <span className="dp-comments-title">Activity &amp; Notes</span>
            {commentsLoaded && !commentsDisabled && comments.length > 0 && (
              <span className="dp-comments-count">{comments.length}</span>
            )}
          </div>

          {commentsDisabled ? (
            <p className="dp-comment-empty" style={{ fontStyle: 'italic', fontSize: 12 }}>
              Comments require additional API token permissions.<br />
              Add <strong>data.recordComments:read</strong> + <strong>data.recordComments:write</strong> to your Airtable PAT.
            </p>
          ) : (
            <>
              <div className="dp-comments-list">
                {!commentsLoaded ? (
                  <p className="dp-comment-meta" style={{ padding: '8px 0', fontStyle: 'italic' }}>Loading…</p>
                ) : comments.length === 0 ? (
                  <p className="dp-comment-empty">No activity yet.</p>
                ) : (
                  [...comments].reverse().map(c => (
                    <div key={c.id} className="dp-comment">
                      <div className="dp-comment-meta">
                        <span className="dp-comment-author">{c.author?.name || 'System'}</span>
                        <span className="dp-comment-time">{fmtCommentDate(c.createdTime)}</span>
                      </div>
                      <p className="dp-comment-text">{c.text}</p>
                    </div>
                  ))
                )}
              </div>

              <form className="dp-comment-form" onSubmit={submitComment}>
                <textarea
                  className="dp-comment-input"
                  placeholder="Add a note or comment…"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  rows={2}
                  disabled={posting}
                />
                {commentError && <p className="dp-comment-error">{commentError}</p>}
                <button
                  className="dp-comment-submit"
                  type="submit"
                  disabled={posting || !commentText.trim()}
                >
                  {posting ? 'Saving…' : 'Add Note'}
                </button>
              </form>
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
