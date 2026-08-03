import { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import OsLayout from '../../components/OsLayout';
import EditableValue from '../../components/EditableValue';
import { BASES, resolveBaseId } from '../../lib/airtable-tables';
import { getPrisma, isConfigured } from '../../lib/prisma';
import { tableVerdict, rowEditable, fieldEditable } from '../../lib/editability';

/**
 * /admin/data — every table in the OS, editable where that is safe.
 *
 * The point of this page is that changing a row should not require asking me.
 * It works generically because the mirror stores each record as a JSON blob
 * rather than typed columns, so one grid serves all sixty-odd tables and a new
 * field appears the moment something writes it.
 *
 * What it will NOT do is offer an edit that a feed would undo. Tables are
 * labelled with their verdict from lib/editability.js, feed-owned ones render
 * read-only with the reason on the row, and /api/update-record enforces the
 * same rule server-side so a hidden control is never the only thing standing
 * between a typed value and a nightly overwrite.
 *
 * Column order comes from the first row's keys, which is why the mirror stores
 * `json` and not `jsonb`: jsonb reorders keys and every generic table in the OS
 * would render scrambled.
 */

const HIDDEN = new Set(['Activity Log', 'Comments']);

function TablePicker({ tables, current, onPick }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = tables.filter(t => !needle || t.id.toLowerCase().includes(needle));
  const byBase = shown.reduce((acc, t) => {
    (acc[t.baseKey] ||= []).push(t);
    return acc;
  }, {});

  return (
    <aside className="ad-side">
      <input
        className="ad-search" placeholder="Find a table…"
        value={q} onChange={e => setQ(e.target.value)}
      />
      {Object.entries(byBase).map(([baseKey, list]) => (
        <div key={baseKey} className="ad-group">
          <div className="ad-group-label">{baseKey}</div>
          {list.map(t => (
            <button
              key={t.id}
              className={`ad-tbl${current === t.id ? ' on' : ''}`}
              onClick={() => onPick(t.id)}
              type="button"
            >
              <span className="ad-tbl-name">{t.tableKey}</span>
              <span className={`ad-dot ad-dot--${t.verdict}`} title={t.reason} aria-hidden />
            </button>
          ))}
        </div>
      ))}
      <p className="ad-key">
        <span className="ad-dot ad-dot--open" /> editable ·
        <span className="ad-dot ad-dot--partial" /> partly ·
        <span className="ad-dot ad-dot--feed" /> feed
      </p>
    </aside>
  );
}

export default function AdminData({ tables, table, rows: initialRows, columns, verdict, baseId, tableId, error }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows || []);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState(null);
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');

  const [baseKey, tableKey] = (table || '.').split('.');
  const readOnly = verdict?.verdict === 'feed';

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r => JSON.stringify(r.fields).toLowerCase().includes(needle));
  }, [rows, q]);

  async function saveField(row, field, value) {
    const before = rows;
    setRows(rs => rs.map(r => (r.recordId === row.recordId
      ? { ...r, fields: { ...r.fields, [field]: value } } : r)));
    const res = await fetch('/api/update-record', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseId, tableId, recordId: row.recordId, fields: { [field]: value } }),
    });
    if (!res.ok) {
      setRows(before);
      const d = await res.json().catch(() => ({}));
      throw new Error(d.detail || d.error || 'Save failed');
    }
  }

  async function addRow() {
    setBusy(true); setNote('');
    try {
      // Seed the new row with the columns this table already uses, blank, so it
      // lines up with the grid instead of arriving as a one-cell oddity.
      const seed = Object.fromEntries(columns.map(c => [c, '']));
      const res = await fetch('/api/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, fields: seed }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || d.error || 'Create failed');
      setRows(rs => [{ recordId: d.id, fields: seed }, ...rs]);
      setNote('Row added at the top.');
    } catch (e) { setNote(e.message); } finally { setBusy(false); }
  }

  async function duplicate(row) {
    setBusy(true); setNote('');
    try {
      const res = await fetch('/api/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, fields: { ...row.fields } }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || d.error || 'Duplicate failed');
      setRows(rs => [{ recordId: d.id, fields: { ...row.fields } }, ...rs]);
      setNote('Duplicated.');
    } catch (e) { setNote(e.message); } finally { setBusy(false); }
  }

  async function remove(row) {
    const before = rows;
    setRows(rs => rs.filter(r => r.recordId !== row.recordId));
    try {
      const res = await fetch('/api/delete-record', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseId, tableId, recordId: row.recordId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Delete failed');
      // Keep the raw row so Undo restores it exactly rather than rebuilding it.
      setUndo({ row, raw: d.record });
      setTimeout(() => setUndo(u => (u && u.row.recordId === row.recordId ? null : u)), 15000);
    } catch (e) {
      setRows(before);
      setNote(e.message);
    }
  }

  async function revert() {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    await fetch('/api/delete-record', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseId, tableId, recordId: u.row.recordId, restore: u.raw }),
    }).catch(() => {});
    setRows(rs => (rs.some(r => r.recordId === u.row.recordId) ? rs : [u.row, ...rs]));
  }

  function exportCsv() {
    const esc = v => JSON.stringify(v ?? '');
    const csv = [
      ['recordId', ...columns].join(','),
      ...visible.map(r => [esc(r.recordId), ...columns.map(c => esc(r.fields[c]))].join(',')),
    ].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `${table}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  return (
    <OsLayout title="Data">
      <section className="os-hero">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Natroceutics OS · Admin</p>
          <h1 className="os-hero-title">Data</h1>
          <p className="today-sub">
            Every table in the OS. Edit what no feed owns, and see plainly what it does.
          </p>
        </div>
      </section>

      <div className="os-page-wrap ad-wrap">
        <TablePicker
          tables={tables}
          current={table}
          onPick={id => router.push(`/admin/data?table=${encodeURIComponent(id)}`)}
        />

        <div className="ad-main">
          {error && <div className="os-alert-error">{error}</div>}

          {!table && (
            <div className="os-empty">Pick a table on the left.</div>
          )}

          {table && (
            <>
              <div className="ad-head">
                <div>
                  <h2 className="ad-title">{baseKey}.{tableKey}</h2>
                  <p className={`ad-verdict ad-verdict--${verdict.verdict}`}>{verdict.reason}</p>
                </div>
                <div className="ad-actions">
                  <input
                    className="ad-search ad-search--inline" placeholder="Search rows…"
                    value={q} onChange={e => setQ(e.target.value)}
                  />
                  <button className="fd-btn" onClick={exportCsv} type="button">CSV</button>
                  {!readOnly && (
                    <button className="fd-btn fd-btn--confirm" onClick={addRow} disabled={busy} type="button">
                      Add row
                    </button>
                  )}
                </div>
              </div>

              {note && <div className="ad-note">{note}</div>}

              <p className="ad-count">
                {visible.length} of {rows.length} row{rows.length === 1 ? '' : 's'}
                {columns.length > 0 && <> · {columns.length} fields</>}
              </p>

              {!rows.length && <div className="os-empty">This table is empty.</div>}

              {rows.length > 0 && (
                <div className="sp-scroll">
                  <table className="sp-table ad-table">
                    <thead>
                      <tr>
                        <th>Record</th>
                        {columns.map(c => <th key={c}>{c}</th>)}
                        {!readOnly && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(r => {
                        const canEditRow = !readOnly && rowEditable(baseKey, tableKey, r.recordId);
                        return (
                          <tr key={r.recordId}>
                            <td className="sp-mono ad-rid" title={r.recordId}>{r.recordId}</td>
                            {columns.map(c => (
                              <td key={c}>
                                <EditableValue
                                  value={r.fields[c]}
                                  align="left"
                                  locked={!canEditRow || !fieldEditable(baseKey, tableKey, c)}
                                  lockReason={verdict.reason}
                                  onSave={v => saveField(r, c, v)}
                                />
                              </td>
                            ))}
                            {!readOnly && (
                              <td className="ad-rowacts">
                                <button className="fd-btn" onClick={() => duplicate(r)} disabled={busy} type="button">Copy</button>
                                {canEditRow && (
                                  <button className="fd-btn" onClick={() => remove(r)} disabled={busy} type="button">Delete</button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {undo && (
        <div className="today-undo">
          <span>Row deleted</span>
          <button onClick={revert}>Undo</button>
        </div>
      )}
    </OsLayout>
  );
}

export async function getServerSideProps({ query }) {
  const tables = [];
  for (const [baseKey, b] of Object.entries(BASES)) {
    for (const tableKey of Object.keys(b.tables || {})) {
      const v = tableVerdict(baseKey, tableKey);
      tables.push({ id: `${baseKey}.${tableKey}`, baseKey, tableKey, verdict: v.verdict, reason: v.reason });
    }
  }
  tables.sort((a, b) => a.id.localeCompare(b.id));

  const table = typeof query.table === 'string' ? query.table : '';
  if (!table) {
    return { props: { tables, table: '', rows: [], columns: [], verdict: null, baseId: '', tableId: '', error: null } };
  }

  const [baseKey, tableKey] = table.split('.');
  const base = BASES[baseKey];
  const tableId = base?.tables?.[tableKey];
  if (!base || !tableId) {
    return { props: { tables, table: '', rows: [], columns: [], verdict: null, baseId: '', tableId: '', error: `Unknown table "${table}"` } };
  }

  const baseId = resolveBaseId(base.envVar) || base.defaultBaseId;

  // Read Postgres directly rather than through fetchFromMirror. That helper
  // gates on "has this table ever recorded a successful SyncRun", which exists
  // so ordinary pages can fall back to Airtable — but here it makes a table
  // that cannot be read look exactly like a table that is empty. This page is
  // the one place that must never blur those two, so it asks the database and
  // reports what it gets, including the failure.
  if (!isConfigured()) {
    return { props: { tables, table, rows: [], columns: [], verdict: tableVerdict(baseKey, tableKey),
                      baseId, tableId, error: 'No database configured (DATABASE_URL missing).' } };
  }

  let rows = [];
  try {
    const raw = await getPrisma().$queryRaw`
      SELECT "recordId", "fields"::text AS f
      FROM "AirtableRecord"
      WHERE "baseId" = ${baseId} AND "tableId" = ${tableId}
      ORDER BY "position", "recordId"`;
    rows = raw.map(r => {
      let fields = {};
      try { fields = JSON.parse(r.f); } catch { fields = { '(unreadable JSON)': r.f?.slice(0, 200) || '' }; }
      return { recordId: r.recordId, fields };
    });
  } catch (e) {
    return { props: { tables, table, rows: [], columns: [], verdict: tableVerdict(baseKey, tableKey),
                      baseId, tableId, error: `Could not read ${table}: ${e.message}` } };
  }

  // Column order from the first row, which is why the mirror stores `json`.
  // Later rows can carry fields the first does not, so they are appended.
  const columns = [];
  for (const r of rows) {
    for (const k of Object.keys(r.fields)) {
      if (!HIDDEN.has(k) && !columns.includes(k)) columns.push(k);
    }
  }

  return {
    props: {
      tables, table, rows, columns,
      verdict: tableVerdict(baseKey, tableKey),
      baseId, tableId, error: null,
    },
  };
}
