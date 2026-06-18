/**
 * StatusSelect.js
 * Shared inline-status editing utilities used site-wide.
 *
 * Exports:
 *   useStatusEditor(data)  — hook: optimistic local status state + Airtable PATCH
 *   StatusSelect           — component: renders an editable status pill select
 *   DONE_VALS              — Set of "done" status strings
 *   BASE_STATUSES          — default status options
 *   sc(status)             — returns the CSS pill class for a given status string
 */
import { useState, useMemo } from 'react';

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
  'Submitted': 'pill-progress', 'Active Expired': 'pill-progress',
  'To Do': 'pill-todo', 'Not Started': 'pill-todo', 'Pending': 'pill-todo',
  'Draft': 'pill-todo',
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
 * useStatusEditor(data)
 *
 * Manages optimistic status updates for a list of Airtable records.
 * Each record must carry _baseId and _tableId (injected by lib/airtable.js).
 *
 * Returns:
 *   dataWithStatus   — data with localStatus overlaid
 *   handleStatusChange(recordId, newStatus, record) — call on <select onChange>
 *   saving           — { [recordId]: true } while saving
 *   updateError      — string error shown to user; auto-clears after 6s
 */
export function useStatusEditor(data) {
  const [localStatus, setLocalStatus] = useState({});
  const [saving, setSaving] = useState({});
  const [updateError, setUpdateError] = useState('');

  const dataWithStatus = useMemo(() =>
    (data || []).map(r => ({
      ...r,
      Status: localStatus[r.id] !== undefined ? localStatus[r.id] : r.Status,
    })),
    [data, localStatus]
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
      await patchRecord(baseId, tableId, recordId, { Status: newStatus });
    } catch (err) {
      // Revert optimistic update
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
 * Automatically derives available status options from allStatuses or BASE_STATUSES.
 *
 * Props:
 *   record           — the row record (must have .Status, .id, ._baseId, ._tableId)
 *   allStatuses      — array of status strings for the <select> options
 *   handleStatusChange — from useStatusEditor
 *   saving           — from useStatusEditor
 */
export function StatusSelect({ record, allStatuses, handleStatusChange, saving }) {
  const status = record.Status || '';
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
