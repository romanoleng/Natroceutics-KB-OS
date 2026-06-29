/**
 * StatusSelect.js
 * Shared inline-status editing utilities used site-wide.
 *
 * Exports:
 *   useStatusEditor(data, fieldName)  — hook: optimistic state + Airtable PATCH, sessionStorage-backed
 *   StatusSelect        — editable status pill <select>
 *   DateCell            — inline date <input> that patches Airtable on change
 *   DONE_VALS           — Set of canonical "done" status strings
 *   CANONICAL_STATUSES  — single source of truth for all status dropdowns site-wide
 *   normalizeStatus(s)  — strips emoji/symbols + resolves aliases → canonical label
 *   BASE_STATUSES       — alias for CANONICAL_STATUSES (back-compat)
 *   sc(status)          — returns the CSS pill class for a given status string
 */
import { useState, useMemo, useEffect, useRef } from 'react';

// ── Canonical status set ────────────────────────────────────────────────────
// This is the ONLY place statuses are defined. Every dropdown site-wide uses
// this list. Adding a status here propagates to every page automatically.
export const CANONICAL_STATUSES = [
  'Not Started',
  'In Progress',
  'Under Review',
  'Blocked',
  'Cancelled',
  'Done',
];

// Back-compat alias so older imports of BASE_STATUSES still work
export const BASE_STATUSES = CANONICAL_STATUSES;

// Done = completed/resolved — controls strikethrough + sinking rows
export const DONE_VALS = new Set([
  'Done', 'Complete', 'Completed', 'Approved', 'Resolved', 'Closed',
]);

// ── Status normalization ────────────────────────────────────────────────────
// Strips emoji, colored-dot prefixes, and extra whitespace injected by
// Airtable singleSelect options, then resolves known aliases → canonical label.
const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}⌛⏰⚠️✅❌🔴🟡🟢⚪]/gu;

const ALIASES = {
  // → Done
  'complete':      'Done',
  'completed':     'Done',
  'approved':      'Done',
  'resolved':      'Done',
  'closed':        'Done',
  'registered':    'Done',
  'live':          'Done',
  'paid':          'Done',
  'published':     'Done',
  'current':       'Done',
  // → In Progress
  'mitigating':    'In Progress',
  'active':        'In Progress',
  // → Not Started
  'to do':         'Not Started',
  'todo':          'Not Started',
  'pending':       'Not Started',
  'open':          'Not Started',
  'draft':         'Not Started',
  'planned':       'Not Started',
  // → Under Review
  'waiting on':    'Under Review',
  'submitted':     'Under Review',
  // → Blocked
  'at risk':       'Blocked',
  'overdue':       'Blocked',
  // → Cancelled
  'active expired':'Cancelled',
  'rejected':      'Cancelled',
  'archived':      'Cancelled',
  'inactive':      'Cancelled',
  'discontinued':  'Cancelled',
};

export function normalizeStatus(s) {
  if (!s) return '';
  const stripped = s.replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim();
  return ALIASES[stripped.toLowerCase()] || stripped;
}

// ── CSS pill class mapping ──────────────────────────────────────────────────
const STATUS_CLASS = {
  'Done':         'pill-done',
  'In Progress':  'pill-progress',
  'Under Review': 'pill-progress',
  'Not Started':  'pill-todo',
  'Blocked':      'pill-blocked',
  'Cancelled':    'pill-cancelled',
};

export function sc(s) {
  const n = normalizeStatus(s);
  return STATUS_CLASS[n] || STATUS_CLASS[s] || 'pill-default';
}

// ── Airtable PATCH helper ───────────────────────────────────────────────────
async function patchRecord(baseId, tableId, recordId, fields) {
  const res = await fetch('/api/update-record', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseId, tableId, recordId, fields }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Update failed (${res.status})`);
  }
}

/**
 * useStatusEditor(data, fieldName)
 *
 * Manages optimistic field updates for a list of Airtable records.
 * Each record must carry _baseId and _tableId.
 *
 * Raw Airtable values (e.g. "🟢 Complete", "Waiting On") are normalized
 * to canonical labels in dataWithStatus so all downstream logic is clean.
 *
 * Changes persist to sessionStorage for the browser session.
 */
export function useStatusEditor(data, fieldName = 'Status') {
  const [localStatus, setLocalStatus] = useState({});
  const [saving, setSaving] = useState({});
  const [updateError, setUpdateError] = useState('');
  const hydrated = useRef(false);

  const storageKey = useMemo(() => {
    const r = data?.[0];
    if (!r?._baseId || !r?._tableId) return null;
    return `natro_status_${r._baseId}_${r._tableId}_${fieldName}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.[0]?._baseId, data?.[0]?._tableId, fieldName]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setLocalStatus(JSON.parse(raw));
    } catch {}
    hydrated.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydrated.current) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify(localStatus)); } catch {}
  }, [localStatus, storageKey]);

  const dataWithStatus = useMemo(() =>
    (data || []).map(r => ({
      ...r,
      // User-changed values are already canonical; raw Airtable values are normalized here
      [fieldName]: localStatus[r.id] !== undefined
        ? localStatus[r.id]
        : normalizeStatus(r[fieldName]),
    })),
    [data, localStatus, fieldName]
  );

  async function handleStatusChange(recordId, newStatus, record) {
    const baseId = record._baseId;
    const tableId = record._tableId;
    if (!baseId || !tableId) {
      setUpdateError('Cannot update: missing record source info');
      setTimeout(() => setUpdateError(''), 4000);
      return;
    }
    setLocalStatus(prev => ({ ...prev, [recordId]: newStatus }));
    setSaving(prev => ({ ...prev, [recordId]: true }));
    try {
      await patchRecord(baseId, tableId, recordId, { [fieldName]: newStatus });
    } catch (err) {
      setLocalStatus(prev => { const n = { ...prev }; delete n[recordId]; return n; });
      setUpdateError(`Save failed: ${err.message}`);
      setTimeout(() => setUpdateError(''), 6000);
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[recordId]; return n; });
    }
  }

  return { dataWithStatus, handleStatusChange, saving, updateError };
}

/**
 * StatusSelect
 *
 * Drop-in replacement for a static status pill. Renders an editable <select>.
 * Always shows CANONICAL_STATUSES regardless of what allStatuses is passed — this
 * eliminates emoji duplicates from Airtable singleSelect options site-wide.
 *
 * Props:
 *   record             — row record (must have .id, ._baseId, ._tableId)
 *   allStatuses        — ignored (kept for API back-compat); canonical list is always used
 *   handleStatusChange — from useStatusEditor
 *   saving             — from useStatusEditor
 *   fieldName          — which field to read/display (default: 'Status')
 */
export function StatusSelect({ record, allStatuses, handleStatusChange, saving, fieldName = 'Status' }) {
  // dataWithStatus already normalizes, but guard here for records used outside useStatusEditor
  const status = normalizeStatus(record[fieldName] || '');
  // If the record somehow has a value outside the canonical set, append it
  const options = CANONICAL_STATUSES.includes(status) || !status
    ? CANONICAL_STATUSES
    : [...CANONICAL_STATUSES, status];

  return (
    <select
      className={`os-pill status-select ${sc(status)}`}
      value={status}
      onChange={e => handleStatusChange(record.id, e.target.value, record)}
      disabled={!!saving[record.id]}
      onClick={e => e.stopPropagation()}
    >
      {options.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

/**
 * DateCell
 *
 * Inline date input that patches a single Airtable date field on change.
 * Normalises the stored value to YYYY-MM-DD for the <input type="date">.
 *
 * Props:
 *   record    — row record (must have .id, ._baseId, ._tableId)
 *   fieldName — which Airtable field to patch (e.g. 'Due Date', 'Start Date')
 */
export function DateCell({ record, fieldName }) {
  const toInput = v => {
    if (!v) return '';
    try {
      const d = new Date(v);
      return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    } catch { return ''; }
  };
  const [localDate, setLocalDate] = useState(() => toInput(record[fieldName] || ''));
  const [saving, setSaving] = useState(false);

  async function handleChange(e) {
    const val = e.target.value;
    setLocalDate(val);
    if (!record._baseId || !record._tableId) return;
    setSaving(true);
    try {
      await patchRecord(record._baseId, record._tableId, record.id, { [fieldName]: val || null });
    } catch {
      setLocalDate(toInput(record[fieldName] || ''));
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      type="date"
      className={`os-date-cell${saving ? ' os-date-cell--saving' : ''}`}
      value={localDate}
      onChange={handleChange}
      disabled={saving}
      onClick={e => e.stopPropagation()}
      title={fieldName}
    />
  );
}
