/**
 * StatusSelect.js
 * Shared inline-status editing utilities used site-wide.
 *
 * Exports:
 *   useStatusEditor(data, fieldName)  — hook: optimistic state + Airtable PATCH, sessionStorage-backed
 *   StatusSelect     — editable status pill <select>
 *   DateCell         — inline date <input> that patches Airtable on change
 *   DONE_VALS        — Set of "done" status strings
 *   BASE_STATUSES    — default status option list
 *   sc(status)       — returns the CSS pill class for a given status string
 */
import { useState, useMemo, useEffect, useRef } from 'react';

export const DONE_VALS = new Set([
  'Done', 'Complete', 'Completed', 'Approved', 'Resolved', 'Closed',
]);

export const BASE_STATUSES = [
  'Not Started', 'To Do', 'In Progress', 'Under Review',
  'Done', 'Blocked', 'Cancelled',
];

const STATUS_CLASS = {
  'Done': 'pill-done', 'Complete': 'pill-done', 'Completed': 'pill-done',
  'Approved': 'pill-done', 'Registered': 'pill-done', 'Live': 'pill-done',
  'Active': 'pill-done', 'Resolved': 'pill-done', 'Closed': 'pill-done',
  'Paid': 'pill-done',
  'In Progress': 'pill-progress', 'Under Review': 'pill-progress',
  'Submitted': 'pill-progress', 'Active Expired': 'pill-progress', 'Mitigating': 'pill-progress',
  'To Do': 'pill-todo', 'Not Started': 'pill-todo', 'Pending': 'pill-todo',
  'Draft': 'pill-todo', 'Open': 'pill-todo',
  'Blocked': 'pill-blocked', 'At Risk': 'pill-blocked', 'Rejected': 'pill-blocked',
  'Overdue': 'pill-blocked',
};

export function sc(s) { return STATUS_CLASS[s] || 'pill-default'; }

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
 * Each record must carry _baseId and _tableId (injected by lib/airtable.js).
 *
 * Changes are persisted to sessionStorage keyed by base + table + fieldName so they
 * survive tab switches and section changes within the same browser session.
 *
 * @param {Array}  data      - array of Airtable records
 * @param {string} fieldName - which field to track and patch (default: 'Status')
 */
export function useStatusEditor(data, fieldName = 'Status') {
  const [localStatus, setLocalStatus] = useState({});
  const [saving, setSaving] = useState({});
  const [updateError, setUpdateError] = useState('');
  const hydrated = useRef(false);

  // Stable storage key derived from the first record's table coordinates + field name.
  const storageKey = useMemo(() => {
    const r = data?.[0];
    if (!r?._baseId || !r?._tableId) return null;
    return `natro_status_${r._baseId}_${r._tableId}_${fieldName}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.[0]?._baseId, data?.[0]?._tableId, fieldName]);

  // Hydrate from sessionStorage on mount / when key changes (component remounts on tab switch)
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setLocalStatus(JSON.parse(raw));
    } catch {}
    hydrated.current = true;
  }, [storageKey]);

  // Persist to sessionStorage whenever localStatus changes
  useEffect(() => {
    if (!storageKey || !hydrated.current) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(localStatus));
    } catch {}
  }, [localStatus, storageKey]);

  const dataWithStatus = useMemo(() =>
    (data || []).map(r => ({
      ...r,
      [fieldName]: localStatus[r.id] !== undefined ? localStatus[r.id] : r[fieldName],
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
 *
 * Props:
 *   record             — row record (must have .id, ._baseId, ._tableId)
 *   allStatuses        — option strings for the <select>
 *   handleStatusChange — from useStatusEditor
 *   saving             — from useStatusEditor
 *   fieldName          — which field to read/display (default: 'Status')
 */
export function StatusSelect({ record, allStatuses, handleStatusChange, saving, fieldName = 'Status' }) {
  const status = record[fieldName] || '';
  const rawOptions = allStatuses?.length ? allStatuses : BASE_STATUSES;
  // Case-insensitive dedup — prevents duplicates when Airtable casing differs from defaults
  const seen = new Set();
  const options = rawOptions.filter(s => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <select
      className={`os-pill status-select ${sc(status)}`}
      value={status}
      onChange={e => handleStatusChange(record.id, e.target.value, record)}
      disabled={!!saving[record.id]}
      onClick={e => e.stopPropagation()}
    >
      {!options.some(s => s.toLowerCase() === status.toLowerCase()) && status && (
        <option value={status}>{status}</option>
      )}
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
    const val = e.target.value; // 'YYYY-MM-DD' or ''
    setLocalDate(val);
    if (!record._baseId || !record._tableId) return;
    setSaving(true);
    try {
      await patchRecord(record._baseId, record._tableId, record.id, { [fieldName]: val || null });
    } catch {
      setLocalDate(toInput(record[fieldName] || '')); // revert on error
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
