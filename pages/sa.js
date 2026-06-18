import { useState, useMemo } from 'react';
import Link from 'next/link';
import OsLayout from '../components/OsLayout';
import ProductsSection from '../components/ProductsSection';
import SortableTable from '../components/SortableTable';
import TaskDetailPanel from '../components/TaskDetailPanel';
import { useStatusEditor, StatusSelect, DONE_VALS as DONE_VALS_SHARED, BASE_STATUSES as BASE_STATUSES_SHARED } from '../components/StatusSelect';
import {
  getSATasks, getSAPriorities, getSARisks,
  getSAInventory, getSAFinance, getSAB2B,
  getSACustomers, getSAMarketing, getSACS, getSAReporting,
  getProducts,
} from '../lib/airtable';

const TABS = ['Tasks', 'Priorities', 'Risks', 'Inventory', 'Finance', 'B2B', 'Customers', 'Marketing', 'Customer Service', 'Reporting', 'Products'];

const SA_BASE  = 'appz7wLo78sxzLhjV';
const SA_TASKS_TABLE = 'tblAv5lowKpohE27i';

const STATUS_CLASS = {
  'Done': 'pill-done', 'Complete': 'pill-done', 'Completed': 'pill-done',
  'In Progress': 'pill-progress', 'Active': 'pill-progress',
  'To Do': 'pill-todo', 'Not Started': 'pill-todo', 'Pending': 'pill-todo',
  'Blocked': 'pill-blocked', 'At Risk': 'pill-blocked',
};
function statusClass(s) { return STATUS_CLASS[s] || 'pill-default'; }
function fmt(v) { return (v === null || v === undefined || v === '') ? '—' : v; }
function fmtEntryDate(dateEntry, createdTime) {
  const raw = dateEntry || createdTime;
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch { return raw; }
}

const DONE_VALS_SA = new Set(['Done', 'Complete', 'Completed', 'Approved']);
const BASE_STATUSES_SA = ['Not Started', 'To Do', 'In Progress', 'Under Review', 'Done', 'Blocked', 'Cancelled'];

async function patchSARecord(tableId, recordId, fields) {
  const res = await fetch('/api/update-record', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseId: SA_BASE, tableId, recordId, fields }),
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
    [...new Set([...BASE_STATUSES_SA, ...tasks.map(t => t.Status).filter(Boolean)])],
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
    if (DONE_VALS_SA.has(newStatus)) setDoneAt(prev => ({ ...prev, [recordId]: new Date().toISOString() }));
    setSelectedTask(prev => prev?.id === recordId ? { ...prev, Status: newStatus } : prev);
    try {
      await patchSARecord(SA_TASKS_TABLE, recordId, { Status: newStatus });
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
      </div>
      <SortableTable
        cols={[
          { label: 'Task', key: 'Task' },
          { label: 'Status', key: 'Status', w: 120 },
          { label: 'Owner', key: 'Owner', w: 100 },
          { label: 'Created', key: 'Date of Entry', type: 'date', w: 80 },
          { label: 'Due', key: 'Due Date', type: 'date', w: 80 },
        ]}
        data={dataWithStatus}
        sinkCompleted="Status"
        renderRow={t => {
          const isDone = DONE_VALS_SA.has(t.Status);
          return (
            <tr key={t.id} className={isDone ? 'row-done' : ''} onClick={() => setSelectedTask({ ...t, Status: localStatus[t.id] || t.Status })} style={{ cursor: 'pointer' }}>
              <td>
                <strong>{fmt(t.Task)}</strong>
                {isDone && doneAt[t.id] && (
                  <span className="done-stamp"> ✓ {new Date(doneAt[t.id]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                )}
              </td>
              <td onClick={e => e.stopPropagation()}>
                <select
                  className={`os-pill status-select ${statusClass(t.Status)}`}
                  value={t.Status || ''}
                  onChange={e => handleStatusChange(t.id, e.target.value)}
                  disabled={!!saving[t.id]}
                >
                  {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td className="os-muted">{fmt(t.Owner)}</td>
              <td className="os-mono" style={{ fontSize: 11, color: 'var(--charcoal-45)', whiteSpace: 'nowrap' }}>{fmtEntryDate(t['Date of Entry'], t.createdTime)}</td>
              <td className="os-mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmt(t['Due Date'])}</td>
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
              {p['Business Area'] && <span className="os-tag">{p['Business Area']}</span>}
              {p.Owner && <span className="os-tag">{p.Owner}</span>}
              {p.Week && <span className="os-tag os-tag-week">W{p.Week}</span>}
            </div>
          </div>
          {p.Status && <span className={`os-pill ${statusClass(p.Status)}`}>{p.Status}</span>}
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
              <td>{r.Status ? <span className={`os-pill ${statusClass(r.Status)}`}>{r.Status}</span> : '—'}</td>
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
      <div style={{marginTop: lowStock.length ? 24 : 0}}>
        <SortableTable
          cols={[
            { label: 'Product', key: 'Product Name' },
            { label: 'SKU', key: 'SKU', w: 100 },
            { label: 'Qty', key: 'Quantity', type: 'number', w: 80 },
            { label: 'Location', key: 'Warehouse / Location', w: 160 },
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
      <SortableTable
        cols={[
          { label: 'Period', key: 'Period' },
          { label: 'Channel', key: 'Channel', w: 120 },
          { label: 'Revenue (ZAR)', key: 'Revenue (ZAR)', type: 'number', w: 130 },
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
            <td className="os-mono">{r['Revenue (ZAR)'] ? `R${Number(r['Revenue (ZAR)']).toLocaleString()}` : '—'}</td>
            <td className="os-mono">{r['Revenue (GBP)'] ? `£${Number(r['Revenue (GBP)']).toLocaleString()}` : '—'}</td>
            <td className="os-mono">{r['Platform Fees'] ? `R${Number(r['Platform Fees']).toLocaleString()}` : '—'}</td>
            <td className="os-mono">{r['Net Revenue'] ? `R${Number(r['Net Revenue']).toLocaleString()}` : '—'}</td>
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
      <div style={{marginTop:24}}>
        <SortableTable
          cols={[
            { label: 'Account', key: 'Account Name' },
            { label: 'Type', key: 'Account Type', w: 110 },
            { label: 'Contact', key: 'Contact Name', w: 120 },
            { label: 'City', key: 'City', w: 110 },
            { label: 'Status', key: 'Status', w: 120 },
            { label: 'Monthly Vol (ZAR)', key: 'Monthly Volume (ZAR)', type: 'number', w: 150 },
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
              <td className="os-mono">{b['Monthly Volume (ZAR)'] ? `R${Number(b['Monthly Volume (ZAR)']).toLocaleString()}` : '—'}</td>
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
      <SortableTable
        cols={[
          { label: 'Customer', key: 'Customer Name' },
          { label: 'Source', key: 'Source', w: 130 },
          { label: 'Type', key: 'Customer Type', w: 130 },
          { label: 'Status', key: 'Status', w: 120 },
          { label: 'LTV (ZAR)', key: 'LTV (ZAR)', type: 'number', w: 110 },
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
            <td className="os-mono">{c['LTV (ZAR)'] ? `R${Number(c['LTV (ZAR)']).toLocaleString()}` : '—'}</td>
            <td className="os-mono">{fmt(c['Total Orders'])}</td>
          </tr>
        )}
        emptyMsg="No customer records."
      />
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
      <SortableTable
        cols={[
          { label: 'Campaign', key: 'Campaign / Launch' },
          { label: 'Type', key: 'Type', w: 110 },
          { label: 'Status', key: 'Status', w: 120 },
          { label: 'Owner', key: 'Owner', w: 110 },
          { label: 'Start', key: 'Start Date', type: 'date', w: 100 },
          { label: 'End', key: 'End Date', type: 'date', w: 100 },
          { label: 'Budget (ZAR)', key: 'Budget (ZAR)', type: 'number', w: 120 },
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
            <td className="os-mono">{fmt(m['Start Date'])}</td>
            <td className="os-mono">{fmt(m['End Date'])}</td>
            <td className="os-mono">{m['Budget (ZAR)'] ? `R${Number(m['Budget (ZAR)']).toLocaleString()}` : '—'}</td>
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
      <div style={{marginTop:24}}>
        <SortableTable
          cols={[
            { label: 'Ticket / Reference', key: 'Ticket ID / Reference' },
            { label: 'Customer', key: 'Customer Name', w: 130 },
            { label: 'Issue Type', key: 'Issue Type', w: 130 },
            { label: 'Channel', key: 'Channel', w: 110 },
            { label: 'Status', key: 'Status', w: 120 },
            { label: 'Priority', key: 'Priority', w: 90 },
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
              <td className="os-muted">{fmt(t.Channel)}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={t} allStatuses={csStatuses} handleStatusChange={csEditor.handleStatusChange} saving={csEditor.saving} />
              </td>
              <td>{t.Priority ? <span className={`os-pill ${statusClass(t.Priority)}`}>{t.Priority}</span> : '—'}</td>
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
      <SortableTable
        cols={[
          { label: 'Period', key: 'Report Period' },
          { label: 'Report Type', key: 'Report Type', w: 130 },
          { label: 'Revenue (ZAR)', key: 'Revenue (ZAR)', type: 'number', w: 130 },
          { label: 'Orders', key: 'Orders', type: 'number', w: 80 },
          { label: 'New Customers', key: 'New Customers', type: 'number', w: 110 },
          { label: 'AOV (ZAR)', key: 'AOV (ZAR)', type: 'number', w: 110 },
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
            <td className="os-mono">{r['Revenue (ZAR)'] ? `R${Number(r['Revenue (ZAR)']).toLocaleString()}` : '—'}</td>
            <td className="os-mono">{fmt(r.Orders)}</td>
            <td className="os-mono">{fmt(r['New Customers'])}</td>
            <td className="os-mono">{r['AOV (ZAR)'] ? `R${Number(r['AOV (ZAR)']).toLocaleString()}` : '—'}</td>
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

/* ── Page ─────────────────────────────────────────────────── */
export default function SAPage({ tasks, priorities, risks, inventory, finance, b2b, customers, marketing, cs, reporting, products, error, serverTime }) {
  const [tab, setTab] = useState('Tasks');
  const openRisks = risks.filter(r => !['Resolved','Closed','Done'].includes(r.Status)).length;

  return (
    <OsLayout title="SA Dashboard" region="South Africa" airtableUrl="https://airtable.com/appz7wLo78sxzLhjV" serverTime={serverTime}>
      <section className="region-hero region-hero-sa">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Regional Module</p>
          <h1 className="os-region-title">🇿🇦 South Africa</h1>
          <div className="region-hero-stats">
            <div className="rhs"><span className="rhs-num">{tasks.length}</span><span className="rhs-label">Tasks</span></div>
            <div className="rhs"><span className="rhs-num">{priorities.length}</span><span className="rhs-label">Priorities</span></div>
            <div className="rhs"><span className="rhs-num">{openRisks}</span><span className="rhs-label">Open Risks</span></div>
            <div className="rhs"><span className="rhs-num">{b2b.length}</span><span className="rhs-label">B2B Accounts</span></div>
            <div className="rhs"><span className="rhs-num">{customers.length}</span><span className="rhs-label">Customers</span></div>
          </div>
        </div>
      </section>

      <div className="os-page-wrap">
        {error && <div className="os-alert-error">{error}</div>}

        <div className="os-subnav">
          {TABS.map(t => (
            t === 'Knowledge Base'
              ? <Link key={t} href="/products" className="os-subnav-link">Knowledge Base ↗</Link>
              : <button key={t} className={`os-subnav-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        <div className="os-tab-content">
          {tab === 'Tasks' && <TaskTable tasks={tasks} />}
          {tab === 'Priorities' && <PriorityList items={priorities} />}
          {tab === 'Risks' && <RiskList items={risks} />}
          {tab === 'Inventory' && <InventoryTab items={inventory} />}
          {tab === 'Finance' && <FinanceTab items={finance} />}
          {tab === 'B2B' && <B2BTab items={b2b} />}
          {tab === 'Customers' && <CustomersTab items={customers} />}
          {tab === 'Marketing' && <MarketingTab items={marketing} />}
          {tab === 'Customer Service' && <CSTab items={cs} />}
          {tab === 'Reporting' && <ReportingTab items={reporting} />}
          {tab === 'Products' && <ProductsSection products={products} />}
        </div>
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  const safe = p => p.catch(e => { console.warn('[sa] fetch partial fail:', e.message); return []; });

  const [tasks, priorities, risks, inventory, finance, b2b, customers, marketing, cs, reporting, products] = await Promise.all([
    safe(getSATasks()), safe(getSAPriorities()), safe(getSARisks()),
    safe(getSAInventory()), safe(getSAFinance()), safe(getSAB2B()),
    safe(getSACustomers()), safe(getSAMarketing()), safe(getSACS()), safe(getSAReporting()),
    safe(getProducts()),
  ]);
  return { props: { tasks, priorities, risks, inventory, finance, b2b, customers, marketing, cs, reporting, products, error: null, serverTime: new Date().toISOString() } };
}
