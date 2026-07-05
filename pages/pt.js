import { useState, useMemo } from 'react';
import Link from 'next/link';
import OsLayout from '../components/OsLayout';
import ProductsSection from '../components/ProductsSection';
import SortableTable from '../components/SortableTable';
import TaskDetailPanel from '../components/TaskDetailPanel';
import { useStatusEditor, StatusSelect, sc, DONE_VALS as DONE_VALS_SHARED, BASE_STATUSES as BASE_STATUSES_SHARED } from '../components/StatusSelect';
import {
  getPTTasks, getPTPriorities, getPTRisks,
  getPTInventory, getPTFinance, getPTB2B,
  getPTCustomers, getPTMarketing, getPTCS, getPTReporting,
  getPTAffiliates, getPTPartners, getPTSubscriptions, getPTKlaviyo,
  getProducts,
} from '../lib/airtable';

const TABS = ['Tasks', 'Priorities', 'Risks', 'Inventory', 'B2B', 'Customers', 'Affiliates', 'Partners', 'Marketing', 'Customer Service', 'Finance', 'Reporting', 'Subscriptions', 'Klaviyo'];

const PT_BASE  = 'appfEakXS6FAu2FIY';
const PT_TASKS_TABLE = 'tblCs1y6PPv0Grk75';

// sc() imported from StatusSelect — brand-green, normalizes emoji + aliases site-wide
function fmt(v) { return (v === null || v === undefined || v === '') ? '—' : v; }
function fmtDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch { return raw; }
}

const DONE_VALS_PT = new Set(['Done', 'Complete', 'Completed', 'Approved']);
const BASE_STATUSES_PT = ['Not Started', 'To Do', 'In Progress', 'Under Review', 'Done', 'Blocked', 'Cancelled'];

function downloadCSV(rows, filename) {
  if (!rows || !rows.length) return;
  const keys = Object.keys(rows[0]).filter(k => !k.startsWith('_'));
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = filename + '.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
const csvBtnStyle = { fontSize: 11, fontWeight: 600, padding: '4px 10px', border: '1px solid var(--cream-dark)', borderRadius: 6, background: 'transparent', color: 'var(--forest-600)', cursor: 'pointer', whiteSpace: 'nowrap' };
const csvRowStyle = { display: 'flex', justifyContent: 'flex-end', margin: '12px 0 6px' };

async function patchPTRecord(tableId, recordId, fields) {
  const res = await fetch('/api/update-record', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseId: PT_BASE, tableId, recordId, fields }),
  });
  if (!res.ok) throw new Error('Update failed');
}

/* ── Tasks ────────────────────────────────────────────────── */
function TaskTable({ tasks }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [localStatus, setLocalStatus] = useState({});
  const [doneAt, setDoneAt] = useState({});
  const [saving, setSaving] = useState({});
  const [selectedTask, setSelectedTask] = useState(null);

  const allStatuses = useMemo(() =>
    [...new Set([...BASE_STATUSES_PT, ...tasks.map(t => t.Status).filter(Boolean)])],
    [tasks]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tasks.filter(t => {
      const eff = localStatus[t.id] || t.Status;
      const matchQ = !q || (t.Task || '').toLowerCase().includes(q) || (t.Owner || '').toLowerCase().includes(q);
      const matchS = !statusFilter || eff === statusFilter;
      return matchQ && matchS;
    });
  }, [tasks, search, statusFilter, localStatus]);

  const dataWithStatus = useMemo(() =>
    filtered.map(t => ({ ...t, Status: localStatus[t.id] || t.Status })),
    [filtered, localStatus]
  );

  async function handleStatusChange(recordId, newStatus) {
    setLocalStatus(prev => ({ ...prev, [recordId]: newStatus }));
    setSaving(prev => ({ ...prev, [recordId]: true }));
    if (DONE_VALS_PT.has(newStatus)) setDoneAt(prev => ({ ...prev, [recordId]: new Date().toISOString() }));
    setSelectedTask(prev => prev?.id === recordId ? { ...prev, Status: newStatus } : prev);
    try {
      await patchPTRecord(PT_TASKS_TABLE, recordId, { Status: newStatus });
    } catch {
      setLocalStatus(prev => { const n = { ...prev }; delete n[recordId]; return n; });
      setDoneAt(prev => { const n = { ...prev }; delete n[recordId]; return n; });
      setSelectedTask(prev => prev?.id === recordId ? { ...prev, Status: tasks.find(t => t.id === recordId)?.Status } : prev);
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[recordId]; return n; });
    }
  }

  return (
    <>
      <div className="os-toolbar">
        <input className="os-search" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} />
        {allStatuses.length > 0 && (
          <select className="os-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <span className="os-count">{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>
        <button style={csvBtnStyle} onClick={() => downloadCSV(dataWithStatus, 'pt-tasks')}>↓ CSV</button>
      </div>
      <SortableTable
        cols={[
          { label: 'Task', key: 'Task' },
          { label: 'Phase', key: 'Phase', w: 110 },
          { label: 'Status', key: 'Status', w: 120 },
          { label: 'Owner', key: 'Owner', w: 100 },
          { label: 'Due', key: 'Due Date', type: 'date', w: 90 },
        ]}
        data={dataWithStatus}
        sinkCompleted="Status"
        renderRow={t => {
          const isDone = DONE_VALS_PT.has(t.Status);
          return (
            <tr key={t.id} className={isDone ? 'row-done' : ''} onClick={() => setSelectedTask({ ...t, Status: localStatus[t.id] || t.Status })} style={{ cursor: 'pointer' }}>
              <td>
                <strong>{fmt(t.Task)}</strong>
                {t['Risk Flag'] && <span className="os-tag os-tag-alert" style={{marginLeft:6}}>⚠ Risk</span>}
                {isDone && doneAt[t.id] && <span className="done-stamp"> ✓ {new Date(doneAt[t.id]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
              </td>
              <td className="os-muted">{fmt(t.Phase)}</td>
              <td onClick={e => e.stopPropagation()}>
                <select
                  className={`os-pill status-select ${sc(t.Status)}`}
                  value={t.Status || ''}
                  onChange={e => handleStatusChange(t.id, e.target.value)}
                  disabled={!!saving[t.id]}
                >
                  {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td className="os-muted">{fmt(t.Owner)}</td>
              <td className="os-mono" style={{ fontSize: 11, color: 'var(--charcoal-45)' }}>{fmtDate(t['Due Date'])}</td>
            </tr>
          );
        }}
        emptyMsg="No tasks found."
      />
      <TaskDetailPanel
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        allStatuses={allStatuses}
        onStatusChange={handleStatusChange}
        saving={selectedTask ? saving[selectedTask.id] : false}
      />
    </>
  );
}

/* ── Priorities ───────────────────────────────────────────── */
function PriorityList({ items }) {
  if (!items.length) return <div className="os-empty">No priorities this week.</div>;
  return (
    <div className="priority-list">
      {items.map((p, i) => (
        <div key={p.id} className="priority-item">
          <span className="priority-num">{i + 1}</span>
          <div className="priority-body">
            <strong>{fmt(p['Priority Item'])}</strong>
            {p.Notes && <p className="os-muted">{p.Notes}</p>}
            <div className="priority-meta">
              {p.Owner && <span className="os-tag">{p.Owner}</span>}
              {p.Week && <span className="os-tag os-tag-week">W{p.Week}</span>}
              {p['Due Date'] && <span className="os-tag">{fmtDate(p['Due Date'])}</span>}
            </div>
          </div>
          {p.Status && <span className={`os-pill ${sc(p.Status)}`}>{p.Status}</span>}
        </div>
      ))}
    </div>
  );
}

/* ── Risks ────────────────────────────────────────────────── */
function RiskList({ items }) {
  const open = items.filter(r => !['Resolved', 'Closed', 'Done'].includes(r.Status));
  if (!items.length) return <div className="os-empty">No risks logged.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-red"><div className="os-stat-num">{open.length}</div><div className="os-stat-label">Open Risks</div></div>
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{items.length - open.length}</div><div className="os-stat-label">Resolved</div></div>
      </div>
      <div style={{marginTop:24}}>
        <SortableTable
          cols={[
            { label: 'Risk / Blocker', key: 'Risk / Blocker' },
            { label: 'Status', key: 'Status', w: 110 },
            { label: 'Impact', key: 'Impact', w: 90 },
            { label: 'Mitigation Plan', key: 'Mitigation Plan' },
            { label: 'Owner', key: 'Owner', w: 110 },
          ]}
          data={items}
          renderRow={r => (
            <tr key={r.id}>
              <td><strong>{fmt(r['Risk / Blocker'])}</strong></td>
              <td>{r.Status ? <span className={`os-pill ${sc(r.Status)}`}>{r.Status}</span> : '—'}</td>
              <td>{r.Impact ? <span className="os-pill pill-blocked">{r.Impact}</span> : '—'}</td>
              <td className="os-muted">{fmt(r['Mitigation Plan'])}</td>
              <td className="os-muted">{fmt(r.Owner)}</td>
            </tr>
          )}
          emptyMsg="No risks logged."
        />
      </div>
    </>
  );
}

/* ── Inventory ────────────────────────────────────────────── */
function InventoryTab({ items }) {
  const editor = useStatusEditor(items);
  if (!items.length) return <div className="os-empty">No inventory records.</div>;
  const lowStock = editor.dataWithStatus.filter(i => ['Low Stock', 'Out of Stock', 'Critical'].includes(i.Status));
  const invStatuses = [...new Set(['In Stock', 'Low Stock', 'Out of Stock', 'Critical', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      {lowStock.length > 0 && (
        <div className="os-stat-row">
          <div className="os-stat-card os-stat-red"><div className="os-stat-num">{lowStock.length}</div><div className="os-stat-label">Low / Out of Stock</div></div>
          <div className="os-stat-card os-stat-green"><div className="os-stat-num">{items.length - lowStock.length}</div><div className="os-stat-label">Adequate Stock</div></div>
        </div>
      )}
      <div style={{...csvRowStyle, marginTop: lowStock.length ? 16 : 0}}>
        <button style={csvBtnStyle} onClick={() => downloadCSV(editor.dataWithStatus, 'pt-inventory')}>↓ CSV</button>
      </div>
      <div>
        <SortableTable
          cols={[
            { label: 'Product', key: 'Product Name' },
            { label: 'SKU', key: 'SKU', w: 100 },
            { label: 'Qty', key: 'Quantity', type: 'number', w: 80 },
            { label: 'Location', key: 'Warehouse / Location', w: 160 },
            { label: 'Batch', key: 'Batch Number', w: 110 },
            { label: 'Status', key: 'Status', w: 120 },
            { label: 'BBD', key: 'BBD', type: 'date', w: 90 },
          ]}
          data={editor.dataWithStatus}
          renderRow={i => (
            <tr key={i.id}>
              <td><strong>{fmt(i['Product Name'])}</strong></td>
              <td className="os-mono">{fmt(i.SKU)}</td>
              <td className="os-mono">{fmt(i.Quantity)}</td>
              <td className="os-muted">{fmt(i['Warehouse / Location'])}</td>
              <td className="os-mono" style={{fontSize:11}}>{fmt(i['Batch Number'])}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={i} allStatuses={invStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
              </td>
              <td className="os-mono">{fmt(i.BBD)}</td>
            </tr>
          )}
          emptyMsg="No inventory records."
        />
      </div>
    </>
  );
}

/* ── Finance ──────────────────────────────────────────────── */
function FinanceTab({ items }) {
  const editor = useStatusEditor(items);
  const finStatuses = [...new Set(['Draft', 'In Review', 'Approved', 'Done', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  if (!items.length) return <div className="os-empty">No finance records.</div>;
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <div style={csvRowStyle}>
        <button style={csvBtnStyle} onClick={() => downloadCSV(editor.dataWithStatus, 'pt-finance')}>↓ CSV</button>
      </div>
      <SortableTable
        cols={[
          { label: 'Period', key: 'Period' },
          { label: 'Channel', key: 'Channel', w: 120 },
          { label: 'Revenue (EUR)', key: 'Revenue (EUR)', type: 'number', w: 130 },
          { label: 'Revenue (GBP)', key: 'Revenue (GBP)', type: 'number', w: 120 },
          { label: 'Platform Fees', key: 'Platform Fees', type: 'number', w: 120 },
          { label: 'Net Revenue', key: 'Net Revenue', type: 'number', w: 120 },
          { label: 'Status', key: 'Status', w: 120 },
        ]}
        data={editor.dataWithStatus}
        sinkCompleted="Status"
        renderRow={r => {
          const isDone = DONE_VALS_SHARED.has(r.Status);
          return (
            <tr key={r.id} className={isDone ? 'row-done' : ''}>
              <td><strong>{fmt(r.Period)}</strong></td>
              <td className="os-muted">{fmt(r.Channel)}</td>
              <td className="os-mono">{r['Revenue (EUR)'] ? `€${Number(r['Revenue (EUR)']).toLocaleString()}` : '—'}</td>
              <td className="os-mono">{r['Revenue (GBP)'] ? `£${Number(r['Revenue (GBP)']).toLocaleString()}` : '—'}</td>
              <td className="os-mono">{r['Platform Fees'] ? `€${Number(r['Platform Fees']).toLocaleString()}` : '—'}</td>
              <td className="os-mono" style={r['Net Revenue'] ? { color: Number(r['Net Revenue']) < 0 ? '#dc2626' : '#16a34a', fontWeight: 600 } : {}}>{r['Net Revenue'] ? `€${Number(r['Net Revenue']).toLocaleString()}` : '—'}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={r} allStatuses={finStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
              </td>
            </tr>
          );
        }}
        emptyMsg="No finance records."
      />
    </>
  );
}

/* ── B2B ──────────────────────────────────────────────────── */
function B2BTab({ items }) {
  const editor = useStatusEditor(items);
  const b2bStatuses = [...new Set(['Active', 'Inactive', 'Prospect', 'On Hold', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  if (!items.length) return <div className="os-empty">No B2B accounts.</div>;
  const active = editor.dataWithStatus.filter(i => i.Status === 'Active');
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{active.length}</div><div className="os-stat-label">Active Accounts</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total Accounts</div></div>
      </div>
      <div style={{...csvRowStyle, marginTop: 16}}>
        <button style={csvBtnStyle} onClick={() => downloadCSV(editor.dataWithStatus, 'pt-b2b')}>↓ CSV</button>
      </div>
      <div>
        <SortableTable
          cols={[
            { label: 'Account', key: 'Account Name' },
            { label: 'Type', key: 'Account Type', w: 110 },
            { label: 'Contact', key: 'Contact Name', w: 120 },
            { label: 'City', key: 'City', w: 110 },
            { label: 'Status', key: 'Status', w: 120 },
            { label: 'Monthly Vol (EUR)', key: 'Monthly Volume (EUR)', type: 'number', w: 150 },
          ]}
          data={editor.dataWithStatus}
          renderRow={b => (
            <tr key={b.id}>
              <td><strong>{fmt(b['Account Name'])}</strong>
                {b.Email && <p className="os-table-note">{b.Email}</p>}
              </td>
              <td className="os-muted">{fmt(b['Account Type'])}</td>
              <td className="os-muted">{fmt(b['Contact Name'])}</td>
              <td className="os-muted">{fmt(b.City)}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={b} allStatuses={b2bStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
              </td>
              <td className="os-mono">{b['Monthly Volume (EUR)'] ? `€${Number(b['Monthly Volume (EUR)']).toLocaleString()}` : '—'}</td>
            </tr>
          )}
          emptyMsg="No B2B accounts."
        />
      </div>
    </>
  );
}

/* ── Customers ────────────────────────────────────────────── */
function CustomersTab({ items }) {
  const editor = useStatusEditor(items);
  const custStatuses = [...new Set(['Active', 'Inactive', 'VIP', 'At Risk', 'Churned', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  if (!items.length) return <div className="os-empty">No customer records.</div>;
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <div style={csvRowStyle}>
        <button style={csvBtnStyle} onClick={() => downloadCSV(editor.dataWithStatus, 'pt-customers')}>↓ CSV</button>
      </div>
      <SortableTable
        cols={[
          { label: 'Customer', key: 'Customer Name' },
          { label: 'Source', key: 'Source', w: 130 },
          { label: 'Type', key: 'Customer Type', w: 130 },
          { label: 'Status', key: 'Status', w: 120 },
          { label: 'LTV (EUR)', key: 'LTV (EUR)', type: 'number', w: 110 },
          { label: 'Orders', key: 'Total Orders', type: 'number', w: 90 },
        ]}
        data={editor.dataWithStatus}
        renderRow={c => (
          <tr key={c.id}>
            <td><strong>{fmt(c['Customer Name'])}</strong>
              {c.Email && <p className="os-table-note">{c.Email}</p>}
            </td>
            <td className="os-muted">{fmt(c.Source)}</td>
            <td className="os-muted">{fmt(c['Customer Type'])}</td>
            <td onClick={e => e.stopPropagation()}>
              <StatusSelect record={c} allStatuses={custStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
            </td>
            <td className="os-mono">{c['LTV (EUR)'] ? `€${Number(c['LTV (EUR)']).toLocaleString()}` : '—'}</td>
            <td className="os-mono">{fmt(c['Total Orders'])}</td>
          </tr>
        )}
        emptyMsg="No customer records."
      />
    </>
  );
}

/* ── Affiliates ───────────────────────────────────────────── */
function AffiliatesTab({ items }) {
  const editor = useStatusEditor(items);
  const affStatuses = [...new Set(['Active', 'Inactive', 'Pending', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  if (!items.length) return <div className="os-empty">No affiliates yet. Add referral partners to the Affiliates & Referrals PT table in Airtable.</div>;
  const active = editor.dataWithStatus.filter(i => i.Status === 'Active');
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{active.length}</div><div className="os-stat-label">Active Affiliates</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total Affiliates</div></div>
      </div>
      <div style={{...csvRowStyle, marginTop: 16}}>
        <button style={csvBtnStyle} onClick={() => downloadCSV(editor.dataWithStatus, 'pt-affiliates')}>↓ CSV</button>
      </div>
      <div>
        <SortableTable
          cols={[
            { label: 'Affiliate', key: 'Affiliate Name' },
            { label: 'Type', key: 'Type', w: 120 },
            { label: 'Status', key: 'Status', w: 120 },
            { label: 'Coupon Code', key: 'Coupon Code', w: 130 },
            { label: 'Commission %', key: 'Commission Rate (%)', type: 'number', w: 110 },
          ]}
          data={editor.dataWithStatus}
          renderRow={a => (
            <tr key={a.id}>
              <td><strong>{fmt(a['Affiliate Name'])}</strong>
                {a.Email && <p className="os-table-note">{a.Email}</p>}
              </td>
              <td className="os-muted">{fmt(a.Type)}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={a} allStatuses={affStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
              </td>
              <td className="os-mono">{fmt(a['Coupon Code'])}</td>
              <td className="os-mono">{a['Commission Rate (%)'] ? `${(a['Commission Rate (%)'] * 100).toFixed(0)}%` : '—'}</td>
            </tr>
          )}
          emptyMsg="No affiliates."
        />
      </div>
    </>
  );
}

/* ── Marketing ────────────────────────────────────────────── */
function MarketingTab({ items }) {
  const editor = useStatusEditor(items);
  const mktStatuses = [...new Set([...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  if (!items.length) return <div className="os-empty">No marketing campaigns.</div>;
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <div style={csvRowStyle}>
        <button style={csvBtnStyle} onClick={() => downloadCSV(editor.dataWithStatus, 'pt-marketing')}>↓ CSV</button>
      </div>
      <SortableTable
        cols={[
          { label: 'Campaign', key: 'Campaign / Launch' },
          { label: 'Type', key: 'Type', w: 110 },
          { label: 'Status', key: 'Status', w: 120 },
          { label: 'Owner', key: 'Owner', w: 110 },
          { label: 'Start', key: 'Start Date', type: 'date', w: 100 },
          { label: 'End', key: 'End Date', type: 'date', w: 100 },
          { label: 'Budget (EUR)', key: 'Budget (EUR)', type: 'number', w: 120 },
        ]}
        data={editor.dataWithStatus}
        sinkCompleted="Status"
        renderRow={m => {
          const isDone = DONE_VALS_SHARED.has(m.Status);
          return (
            <tr key={m.id} className={isDone ? 'row-done' : ''}>
              <td><strong>{fmt(m['Campaign / Launch'])}</strong></td>
              <td className="os-muted">{fmt(m.Type)}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={m} allStatuses={mktStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
              </td>
              <td className="os-muted">{fmt(m.Owner)}</td>
              <td className="os-mono">{fmtDate(m['Start Date'])}</td>
              <td className="os-mono">{fmtDate(m['End Date'])}</td>
              <td className="os-mono">{m['Budget (EUR)'] ? `€${Number(m['Budget (EUR)']).toLocaleString()}` : '—'}</td>
            </tr>
          );
        }}
        emptyMsg="No marketing campaigns."
      />
    </>
  );
}

/* ── Customer Service ─────────────────────────────────────── */
function CSTab({ items }) {
  const csEditor = useStatusEditor(items);
  const csStatuses = [...new Set(['Open', 'In Progress', 'Resolved', 'Closed', 'Escalated', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  const open = csEditor.dataWithStatus.filter(i => !['Resolved', 'Closed', 'Done'].includes(i.Status));
  if (!items.length) return <div className="os-empty">No customer service tickets.</div>;
  return (
    <>
      {csEditor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{csEditor.updateError}</div>}
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-red"><div className="os-stat-num">{open.length}</div><div className="os-stat-label">Open Tickets</div></div>
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{items.length - open.length}</div><div className="os-stat-label">Resolved</div></div>
      </div>
      <div style={{...csvRowStyle, marginTop: 16}}>
        <button style={csvBtnStyle} onClick={() => downloadCSV(csEditor.dataWithStatus, 'pt-customer-service')}>↓ CSV</button>
      </div>
      <div>
        <SortableTable
          cols={[
            { label: 'Ticket / Reference', key: 'Ticket ID / Reference' },
            { label: 'Customer', key: 'Customer Name', w: 130 },
            { label: 'Issue Type', key: 'Issue Type', w: 130 },
            { label: 'Status', key: 'Status', w: 120 },
            { label: 'Priority', key: 'Priority', w: 90 },
            { label: 'Refund', key: 'Refund Issued', w: 70 },
            { label: 'Refund (EUR)', key: 'Refund Amount (EUR)', type: 'number', w: 110 },
          ]}
          data={csEditor.dataWithStatus}
          sinkCompleted="Status"
          renderRow={t => {
            const isDone = DONE_VALS_SHARED.has(t.Status);
            return (
              <tr key={t.id} className={isDone ? 'row-done' : ''}>
                <td><strong>{fmt(t['Ticket ID / Reference'])}</strong></td>
                <td className="os-muted">{fmt(t['Customer Name'])}</td>
                <td className="os-muted">{fmt(t['Issue Type'])}</td>
                <td onClick={e => e.stopPropagation()}>
                  <StatusSelect record={t} allStatuses={csStatuses} handleStatusChange={csEditor.handleStatusChange} saving={csEditor.saving} />
                </td>
                <td>{t.Priority ? <span className={`os-pill ${sc(t.Priority)}`}>{t.Priority}</span> : '—'}</td>
                <td>{t['Refund Issued'] ? <span className="os-pill pill-done">✓</span> : '—'}</td>
                <td className="os-mono">{t['Refund Amount (EUR)'] ? `€${Number(t['Refund Amount (EUR)']).toLocaleString()}` : '—'}</td>
              </tr>
            );
          }}
          emptyMsg="No customer service tickets."
        />
      </div>
    </>
  );
}

/* ── Reporting ────────────────────────────────────────────── */
function ReportingTab({ items }) {
  const editor = useStatusEditor(items);
  const repStatuses = [...new Set(['Draft', 'In Review', 'Approved', 'Done', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  if (!items.length) return <div className="os-empty">No reporting data yet.</div>;
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <div style={csvRowStyle}>
        <button style={csvBtnStyle} onClick={() => downloadCSV(editor.dataWithStatus, 'pt-reporting')}>↓ CSV</button>
      </div>
      <SortableTable
        cols={[
          { label: 'Period', key: 'Report Period' },
          { label: 'Report Type', key: 'Report Type', w: 130 },
          { label: 'Revenue (EUR)', key: 'Revenue (EUR)', type: 'number', w: 130 },
          { label: 'Orders', key: 'Orders', type: 'number', w: 80 },
          { label: 'New Customers', key: 'New Customers', type: 'number', w: 110 },
          { label: 'AOV (EUR)', key: 'AOV (EUR)', type: 'number', w: 110 },
          { label: 'Status', key: 'Status', w: 120 },
        ]}
        data={editor.dataWithStatus}
        sinkCompleted="Status"
        renderRow={r => {
          const isDone = DONE_VALS_SHARED.has(r.Status);
          return (
            <tr key={r.id} className={isDone ? 'row-done' : ''}>
              <td><strong>{fmt(r['Report Period'])}</strong></td>
              <td className="os-muted">{fmt(r['Report Type'])}</td>
              <td className="os-mono">{r['Revenue (EUR)'] ? `€${Number(r['Revenue (EUR)']).toLocaleString()}` : '—'}</td>
              <td className="os-mono">{fmt(r.Orders)}</td>
              <td className="os-mono">{fmt(r['New Customers'])}</td>
              <td className="os-mono">{r['AOV (EUR)'] ? `€${Number(r['AOV (EUR)']).toLocaleString()}` : '—'}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={r} allStatuses={repStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
              </td>
            </tr>
          );
        }}
        emptyMsg="No reporting data yet."
      />
    </>
  );
}

/* ── Partners ─────────────────────────────────────────────── */
function PartnersTab({ items }) {
  const editor = useStatusEditor(items);
  const partStatuses = [...new Set(['Active', 'Inactive', 'Prospect', 'On Hold', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  if (!items.length) return <div className="os-empty">No strategic partners yet.</div>;
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <SortableTable
        cols={[
          { label: 'Partner', key: 'Partner Name' },
          { label: 'Type', key: 'Partner Type', w: 130 },
          { label: 'Contact', key: 'Contact Name', w: 130 },
          { label: 'Status', key: 'Status', w: 120 },
          { label: 'Agreement', key: 'Agreement In Place', w: 100 },
        ]}
        data={editor.dataWithStatus}
        renderRow={p => (
          <tr key={p.id}>
            <td><strong>{fmt(p['Partner Name'])}</strong>
              {p.Email && <p className="os-table-note">{p.Email}</p>}
            </td>
            <td className="os-muted">{fmt(p['Partner Type'])}</td>
            <td className="os-muted">{fmt(p['Contact Name'])}</td>
            <td onClick={e => e.stopPropagation()}>
              <StatusSelect record={p} allStatuses={partStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
            </td>
            <td>{p['Agreement In Place'] ? <span className="os-pill pill-done">✓ Yes</span> : <span className="os-pill pill-todo">Pending</span>}</td>
          </tr>
        )}
        emptyMsg="No partners."
      />
    </>
  );
}

/* ── Subscriptions ────────────────────────────────────────── */
function SubscriptionsTab({ items }) {
  if (!items.length) return <div className="os-empty">No subscription plans yet. Set up once PT Shopify store is live.</div>;
  const active = items.filter(i => i.Status === 'Active');
  const totalRevenue = active.reduce((s, i) => s + (Number(i['Monthly Revenue (EUR)']) || 0), 0);
  const totalSubs = active.reduce((s, i) => s + (Number(i['Active Subscribers']) || 0), 0);
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{active.length}</div><div className="os-stat-label">Active Plans</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{totalSubs}</div><div className="os-stat-label">Subscribers</div></div>
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">€{totalRevenue.toLocaleString()}</div><div className="os-stat-label">Monthly Revenue</div></div>
      </div>
      <div style={{marginTop:24}}>
        <SortableTable
          cols={[
            { label: 'Plan', key: 'Plan Name' },
            { label: 'Product', key: 'Product', w: 160 },
            { label: 'Frequency', key: 'Billing Frequency', w: 110 },
            { label: 'Discount', key: 'Discount %', type: 'number', w: 90 },
            { label: 'Subscribers', key: 'Active Subscribers', type: 'number', w: 100 },
            { label: 'MRR (EUR)', key: 'Monthly Revenue (EUR)', type: 'number', w: 110 },
            { label: 'Status', key: 'Status', w: 110 },
          ]}
          data={items}
          renderRow={s => (
            <tr key={s.id}>
              <td><strong>{fmt(s['Plan Name'])}</strong></td>
              <td className="os-muted">{fmt(s.Product)}</td>
              <td className="os-muted">{fmt(s['Billing Frequency'])}</td>
              <td className="os-mono">{s['Discount %'] ? `${s['Discount %']}%` : '—'}</td>
              <td className="os-mono">{fmt(s['Active Subscribers'])}</td>
              <td className="os-mono">{s['Monthly Revenue (EUR)'] ? `€${Number(s['Monthly Revenue (EUR)']).toLocaleString()}` : '—'}</td>
              <td>{s.Status ? <span className={`os-pill ${sc(s.Status)}`}>{s.Status}</span> : '—'}</td>
            </tr>
          )}
          emptyMsg="No subscription plans."
        />
      </div>
    </>
  );
}

/* ── Klaviyo ──────────────────────────────────────────────── */
function KlaviyoTab({ items }) {
  if (!items.length) return <div className="os-empty">No Klaviyo flows yet. Set up once PT Shopify store is live.</div>;
  const live = items.filter(i => i.Status === 'Live');
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{live.length}</div><div className="os-stat-label">Live Flows</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total Flows</div></div>
      </div>
      <div style={{marginTop:24}}>
        <SortableTable
          cols={[
            { label: 'Flow', key: 'Flow Name' },
            { label: 'Type', key: 'Flow Type', w: 150 },
            { label: 'Status', key: 'Status', w: 120 },
            { label: 'Open Rate', key: 'Open Rate %', type: 'number', w: 100 },
            { label: 'Click Rate', key: 'Click Rate %', type: 'number', w: 100 },
            { label: 'Revenue (EUR)', key: 'Revenue Attributed (EUR)', type: 'number', w: 130 },
            { label: 'Recipients', key: 'Recipients', type: 'number', w: 90 },
          ]}
          data={items}
          renderRow={f => (
            <tr key={f.id}>
              <td><strong>{fmt(f['Flow Name'])}</strong></td>
              <td className="os-muted">{fmt(f['Flow Type'])}</td>
              <td>{f.Status ? <span className={`os-pill ${sc(f.Status)}`}>{f.Status}</span> : '—'}</td>
              <td className="os-mono">{f['Open Rate %'] ? `${(f['Open Rate %'] * 100).toFixed(1)}%` : '—'}</td>
              <td className="os-mono">{f['Click Rate %'] ? `${(f['Click Rate %'] * 100).toFixed(1)}%` : '—'}</td>
              <td className="os-mono">{f['Revenue Attributed (EUR)'] ? `€${Number(f['Revenue Attributed (EUR)']).toLocaleString()}` : '—'}</td>
              <td className="os-mono">{fmt(f.Recipients)}</td>
            </tr>
          )}
          emptyMsg="No Klaviyo flows."
        />
      </div>
    </>
  );
}

/* ── Page ─────────────────────────────────────────────────── */
export default function PTPage({ tasks, priorities, risks, inventory, finance, b2b, customers, affiliates, marketing, cs, reporting, partners, subscriptions, klaviyo, products, error, serverTime }) {
  const [tab, setTab] = useState('Tasks');
  const openRisks = risks.filter(r => !['Resolved','Closed','Done'].includes(r.Status)).length;
  const openTasks = tasks.filter(t => !['Done','Complete','Completed'].includes(t.Status)).length;

  return (
    <OsLayout title="PT Dashboard" region="Portugal" airtableUrl="https://airtable.com/appfEakXS6FAu2FIY" serverTime={serverTime}>
      <section className="region-hero region-hero-pt">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Regional Module · Launch Stage</p>
          <h1 className="os-region-title">🇵🇹 Portugal</h1>
          <div className="region-hero-stats">
            <div className="rhs"><span className="rhs-num">{openTasks}</span><span className="rhs-label">Open Tasks</span></div>
            <div className="rhs"><span className="rhs-num">{priorities.length}</span><span className="rhs-label">Priorities</span></div>
            <div className="rhs"><span className="rhs-num">{openRisks}</span><span className="rhs-label">Open Risks</span></div>
            <div className="rhs"><span className="rhs-num">{b2b.length}</span><span className="rhs-label">B2B Accounts</span></div>
            <div className="rhs"><span className="rhs-num">{customers.length}</span><span className="rhs-label">Customers</span></div>
            <div className="rhs"><span className="rhs-num">{affiliates.length}</span><span className="rhs-label">Affiliates</span></div>
          </div>
        </div>
      </section>

      <div className="os-page-wrap">
        {error && <div className="os-alert-error">{error}</div>}

        <div className="os-subnav">
          {TABS.map(t => (
            <button key={t} className={`os-subnav-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        <div className="os-tab-content">
          {tab === 'Tasks'            && <TaskTable tasks={tasks} />}
          {tab === 'Priorities'       && <PriorityList items={priorities} />}
          {tab === 'Risks'            && <RiskList items={risks} />}
          {tab === 'Inventory'        && <InventoryTab items={inventory} />}
          {tab === 'Finance'          && <FinanceTab items={finance} />}
          {tab === 'B2B'              && <B2BTab items={b2b} />}
          {tab === 'Customers'        && <CustomersTab items={customers} />}
          {tab === 'Affiliates'       && <AffiliatesTab items={affiliates} />}
          {tab === 'Marketing'        && <MarketingTab items={marketing} />}
          {tab === 'Customer Service' && <CSTab items={cs} />}
          {tab === 'Reporting'        && <ReportingTab items={reporting} />}
          {tab === 'Partners'         && <PartnersTab items={partners} />}
          {tab === 'Subscriptions'    && <SubscriptionsTab items={subscriptions} />}
          {tab === 'Klaviyo'          && <KlaviyoTab items={klaviyo} />}
        </div>
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  const safe = p => p.catch(e => { console.warn('[pt] fetch partial fail:', e.message); return []; });

  const [tasks, priorities, risks, inventory, finance, b2b, customers, affiliates, marketing, cs, reporting, partners, subscriptions, klaviyo, products] = await Promise.all([
    safe(getPTTasks()), safe(getPTPriorities()), safe(getPTRisks()),
    safe(getPTInventory()), safe(getPTFinance()), safe(getPTB2B()),
    safe(getPTCustomers()), safe(getPTAffiliates()), safe(getPTMarketing()),
    safe(getPTCS()), safe(getPTReporting()), safe(getPTPartners()),
    safe(getPTSubscriptions()), safe(getPTKlaviyo()),
    safe(getProducts()),
  ]);

  return {
    props: {
      tasks, priorities, risks, inventory, finance, b2b, customers,
      affiliates, marketing, cs, reporting, partners, subscriptions, klaviyo,
      products, error: null, serverTime: new Date().toISOString(),
    },
  };
}
