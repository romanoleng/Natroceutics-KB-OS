/**
 * RecordDetailPanel — generic slide-out detail panel for any Airtable record.
 * Includes a timestamped comments section backed by the Airtable Comments API.
 */
import { useState, useEffect } from 'react';

const STATUS_CLASS = {
  'Done': 'pill-done', 'Complete': 'pill-done', 'Completed': 'pill-done',
  'Approved': 'pill-done', 'Registered': 'pill-done', 'Live': 'pill-done', 'Active': 'pill-done',
  'In Progress': 'pill-progress', 'Under Review': 'pill-progress', 'Submitted': 'pill-progress',
  'To Do': 'pill-todo', 'Not Started': 'pill-todo', 'Pending': 'pill-todo',
  'Blocked': 'pill-blocked', 'At Risk': 'pill-blocked', 'Rejected': 'pill-blocked',
};
function sc(s) { return STATUS_CLASS[s] || 'pill-default'; }

const TITLE_CANDIDATES = [
  'Task', 'Name', 'Risk / Blocker', 'Priority Item', 'Product Name',
  'SOP Name', 'Contact Name', 'Company', 'Customer', 'Title',
  'Subject', 'Description', 'Item', 'SKU', 'Order Number',
];

const SKIP = new Set(['id', 'createdTime', '_baseId', '_tableId']);
const LONG_TEXT_KEYS = new Set(['Notes', 'Description', 'Mitigation Plan', 'Details', 'Summary', 'Comments', 'Instructions']);

function isLong(key, value) {
  if (LONG_TEXT_KEYS.has(key)) return true;
  if (typeof value === 'string' && value.length > 100) return true;
  return false;
}

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

export default function RecordDetailPanel({
  record,
  titleField: titleFieldProp,
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

  useEffect(() => {
    if (!record) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [record, onClose]);

  const baseId = record?._baseId;
  const tableId = record?._tableId;
  const recordId = record?.id;
  const canComment = !!(baseId && tableId && recordId);

  // Fetch comments when panel opens
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

        {/* ── Comments section ── */}
        <div className="dp-comments">
          <div className="dp-comments-header">
            <span className="dp-comments-title">Notes &amp; Comments</span>
            {commentsLoaded && !commentsDisabled && comments.length > 0 && (
              <span className="dp-comments-count">{comments.length}</span>
            )}
          </div>

          {commentsDisabled ? (
            <p className="dp-comment-empty" style={{ fontStyle: 'italic', fontSize: 12 }}>
              Comments require additional API token permissions.<br />
              Add <strong>data.recordComments:read</strong> + <strong>data.recordComments:write</strong> scopes to your Airtable PAT.
            </p>
          ) : (
            <>
              <div className="dp-comments-list">
                {!commentsLoaded ? (
                  <p className="dp-comment-meta" style={{ padding: '8px 0', fontStyle: 'italic' }}>Loading…</p>
                ) : comments.length === 0 ? (
                  <p className="dp-comment-empty">No notes yet.</p>
                ) : (
                  [...comments].reverse().map(c => (
                    <div key={c.id} className="dp-comment">
                      <div className="dp-comment-meta">
                        <span className="dp-comment-author">{c.author?.name || 'User'}</span>
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

        <div className="dp-footer">
          <span className="dp-footer-note">We are efficacy first.</span>
        </div>

      </aside>
    </div>
  );
}
