import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import OsLayout from '../components/OsLayout';
import ProductsSection from '../components/ProductsSection';
import TaskDetailPanel from '../components/TaskDetailPanel';
import SortableTable from '../components/SortableTable';
import { useStatusEditor, StatusSelect, sc, DONE_VALS as DONE_VALS_SHARED, BASE_STATUSES as BASE_STATUSES_SHARED } from '../components/StatusSelect';
import {
  getMETasks, getMEPriorities, getMERisks, getMERegistrations,
  getMEInventory, getMEAffiliates, getMEB2B, getMEPartners,
  getMEFinance, getMEMarketing, getMECS, getMECustomers, getMEReporting,
  getMESubscriptions, getMEKlaviyo,
  getProducts,
} from '../lib/airtable';

const TABS = ['Tasks', 'Priorities', 'Risks', 'Registrations', 'Inventory', 'B2B', 'Partners', 'Affiliates', 'Customers', 'Marketing', 'Customer Service', 'Finance', 'Subscriptions', 'Email / Klaviyo', 'Reporting', 'Products', 'Google'];

const ME_BASE  = 'appdN9dWxVcB2KFZ6';
const ME_TASKS_TABLE = 'tbleGswAUGSDhcrE9';

// sc() imported from StatusSelect — brand-green, normalizes emoji + aliases site-wide
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

const DONE_VALS_ME = new Set(['Done', 'Complete', 'Completed', 'Approved']);
const BASE_STATUSES_ME = ['Not Started', 'To Do', 'In Progress', 'Under Review', 'Done', 'Blocked', 'Cancelled'];

async function patchMERecord(tableId, recordId, fields) {
  const res = await fetch('/api/update-record', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseId: ME_BASE, tableId, recordId, fields }),
  });
  if (!res.ok) throw new Error('Update failed');
}

/* ── Tasks ────────────────────────────────────────────────── */
function TaskTable({ tasks }) {
  const [search, setSearch] = useState('');
  const [phase, setPhase] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [localStatus, setLocalStatus] = useState({});
  const [doneAt, setDoneAt] = useState({});
  const [saving, setSaving] = useState({});
  const [selectedTask, setSelectedTask] = useState(null);

  const phases = [...new Set(tasks.map(t => t.Phase).filter(Boolean))];
  const allStatuses = useMemo(() =>
    [...new Set([...BASE_STATUSES_ME, ...tasks.map(t => t.Status).filter(Boolean)])],
    [tasks]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tasks.filter(t => {
      const eff = localStatus[t.id] || t.Status;
      const matchQ = !q || (t.Task || '').toLowerCase().includes(q) || (t.Owner || '').toLowerCase().includes(q);
      const matchP = !phase || t.Phase === phase;
      const matchS = !statusFilter || eff === statusFilter;
      return matchQ && matchP && matchS;
    });
  }, [tasks, search, phase, statusFilter, localStatus]);

  const dataWithStatus = useMemo(() =>
    filtered.map(t => ({ ...t, Status: localStatus[t.id] || t.Status })),
    [filtered, localStatus]
  );

  async function handleStatusChange(recordId, newStatus) {
    setLocalStatus(prev => ({ ...prev, [recordId]: newStatus }));
    setSaving(prev => ({ ...prev, [recordId]: true }));
    if (DONE_VALS_ME.has(newStatus)) setDoneAt(prev => ({ ...prev, [recordId]: new Date().toISOString() }));
    setSelectedTask(prev => prev?.id === recordId ? { ...prev, Status: newStatus } : prev);
    try {
      await patchMERecord(ME_TASKS_TABLE, recordId, { Status: newStatus });
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
        <input className="os-search" placeholder="Search launch tasks…" value={search} onChange={e => setSearch(e.target.value)} />
        {phases.length > 0 && (
          <select className="os-select" value={phase} onChange={e => setPhase(e.target.value)}>
            <option value="">All Phases</option>
            {phases.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
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
        ]}
        data={dataWithStatus}
        sinkCompleted="Status"
        renderRow={t => {
          const isDone = DONE_VALS_ME.has(t.Status);
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
                  className={`os-pill status-select ${sc(t.Status)}`}
                  value={t.Status || ''}
                  onChange={e => handleStatusChange(t.id, e.target.value)}
                  disabled={!!saving[t.id]}
                >
                  {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td className="os-muted">{fmt(t.Owner)}</td>
              <td className="os-mono" style={{ fontSize: 11, color: 'var(--charcoal-45)', whiteSpace: 'nowrap' }}>{fmtEntryDate(t['Date of Entry'], t.createdTime)}</td>
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
          {p.Status && <span className={`os-pill ${sc(p.Status)}`}>{p.Status}</span>}
        </div>
      ))}
    </div>
  );
}

/* ── Risks ────────────────────────────────────────────────── */
function RiskList({ items }) {
  const editor = useStatusEditor(items);
  const riskStatuses = [...new Set(['Open', 'In Progress', 'Resolved', 'Closed', 'Mitigated', 'Blocked', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  const open = editor.dataWithStatus.filter(r => !['Resolved', 'Closed', 'Done', 'Mitigated'].includes(r.Status));
  if (!items.length) return <div className="os-empty">No risks logged.</div>;
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-red"><div className="os-stat-num">{open.length}</div><div className="os-stat-label">Open Risks</div></div>
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{items.length - open.length}</div><div className="os-stat-label">Resolved</div></div>
      </div>
      <div style={{marginTop:24}}>
        <SortableTable
          cols={[
            { label: 'Risk / Blocker', key: 'Risk / Blocker' },
            { label: 'Status', key: 'Status', w: 120 },
            { label: 'Impact', key: 'Impact', w: 90 },
            { label: 'Mitigation Plan', key: 'Mitigation Plan' },
            { label: 'Owner', key: 'Owner', w: 110 },
          ]}
          data={editor.dataWithStatus}
          sinkCompleted="Status"
          renderRow={r => {
            const isDone = DONE_VALS_SHARED.has(r.Status) || r.Status === 'Mitigated';
            return (
            <tr key={r.id} className={isDone ? 'row-done' : ''}>
              <td><strong>{fmt(r['Risk / Blocker'])}</strong></td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={r} allStatuses={riskStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
              </td>
              <td>{r.Impact ? <span className="os-pill pill-blocked">{r.Impact}</span> : '—'}</td>
              <td className="os-muted">{fmt(r['Mitigation Plan'])}</td>
              <td className="os-muted">{fmt(r.Owner)}</td>
            </tr>
            );
          }}
          emptyMsg="No risks logged."
        />
      </div>
    </>
  );
}

/* ── Product Registrations ────────────────────────────────── */
function RegistrationsTab({ items }) {
  if (!items.length) return <div className="os-empty">No product registrations logged.</div>;
  const approved = items.filter(r => ['Approved', 'Registered', 'Done', 'Complete'].includes(r['Registration Status']));
  const eligible = items.filter(r => r['Eligible for ME Launch'] === true || r['Eligible for ME Launch'] === 'true');
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{approved.length}</div><div className="os-stat-label">Registered</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{eligible.length}</div><div className="os-stat-label">Eligible for ME</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total Products</div></div>
      </div>
      <div style={{marginTop:24}}>
        <SortableTable
          cols={[
            { label: 'Product', key: 'Product Name' },
            { label: 'SKU', key: 'SKU', w: 80 },
            { label: 'Market', key: 'Market', w: 100 },
            { label: 'Registration Status', key: 'Registration Status', w: 140 },
            { label: 'Regulatory Body', key: 'Regulatory Body', w: 120 },
            { label: 'Submitted', key: 'Submission Date', type: 'date', w: 110 },
            { label: 'Expected', key: 'Expected Approval', type: 'date', w: 110 },
          ]}
          data={items}
          renderRow={r => (
            <tr key={r.id}>
              <td><strong>{fmt(r['Product Name'])}</strong>
                {r['Eligible for ME Launch'] && <span className="os-tag" style={{marginLeft:6}}>ME Launch</span>}
              </td>
              <td className="os-mono">{fmt(r.SKU)}</td>
              <td className="os-muted">{fmt(r.Market)}</td>
              <td>{r['Registration Status'] ? <span className={`os-pill ${sc(r['Registration Status'])}`}>{r['Registration Status']}</span> : '—'}</td>
              <td className="os-muted">{fmt(r['Regulatory Body'])}</td>
              <td className="os-mono">{fmt(r['Submission Date'])}</td>
              <td className="os-mono">{fmt(r['Expected Approval'])}</td>
            </tr>
          )}
          emptyMsg="No product registrations logged."
        />
      </div>
    </>
  );
}

/* ── Inventory ME ─────────────────────────────────────────── */
function InventoryTab({ items }) {
  if (!items.length) return <div className="os-empty">No inventory records.</div>;
  const low = items.filter(i => ['Low Stock', 'Out of Stock', 'Critical'].includes(i['Stock Status']));
  return (
    <>
      {low.length > 0 && (
        <div className="os-stat-row">
          <div className="os-stat-card os-stat-red"><div className="os-stat-num">{low.length}</div><div className="os-stat-label">Low / Out of Stock</div></div>
          <div className="os-stat-card os-stat-green"><div className="os-stat-num">{items.length - low.length}</div><div className="os-stat-label">Adequate Stock</div></div>
        </div>
      )}
      <div style={{marginTop: low.length ? 24 : 0}}>
        <SortableTable
          cols={[
            { label: 'Product', key: 'Product Name' },
            { label: 'SKU', key: 'SKU', w: 100 },
            { label: 'On Hand', key: 'Units On Hand', type: 'number', w: 100 },
            { label: 'On Order', key: 'Units On Order', type: 'number', w: 100 },
            { label: 'Warehouse', key: 'Warehouse Location', w: 130 },
            { label: 'Stock Status', key: 'Stock Status', w: 110 },
            { label: 'Next Shipment', key: 'Next Shipment ETA', type: 'date', w: 110 },
          ]}
          data={items}
          renderRow={i => (
            <tr key={i.id}>
              <td><strong>{fmt(i['Product Name'])}</strong></td>
              <td className="os-mono">{fmt(i.SKU)}</td>
              <td className="os-mono">{fmt(i['Units On Hand'])}</td>
              <td className="os-mono">{fmt(i['Units On Order'])}</td>
              <td className="os-muted">{fmt(i['Warehouse Location'])}</td>
              <td>{i['Stock Status'] ? <span className={`os-pill ${sc(i['Stock Status'])}`}>{i['Stock Status']}</span> : '—'}</td>
              <td className="os-mono">{fmt(i['Next Shipment ETA'])}</td>
            </tr>
          )}
          emptyMsg="No inventory records."
        />
      </div>
    </>
  );
}

/* ── Affiliates ME ────────────────────────────────────────── */
function AffiliatesTab({ items }) {
  if (!items.length) return <div className="os-empty">No affiliates yet.</div>;
  const signed = items.filter(i => i['Agreement Signed'] === true || i['Agreement Signed'] === 'true');
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{signed.length}</div><div className="os-stat-label">Agreements Signed</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total Affiliates</div></div>
      </div>
      <div style={{marginTop:24}}>
        <SortableTable
          cols={[
            { label: 'Name', key: 'Name' },
            { label: 'Type', key: 'Type', w: 120 },
            { label: 'Platform', key: 'Platform', w: 130 },
            { label: 'Market', w: 130 },
            { label: 'Commission Tier', key: 'Commission Tier', w: 140 },
            { label: 'Onboarding Status', key: 'Onboarding Status', w: 150 },
          ]}
          data={items}
          renderRow={a => (
            <tr key={a.id}>
              <td><strong>{fmt(a.Name)}</strong>
                {a.Email && <p className="os-table-note">{a.Email}</p>}
              </td>
              <td className="os-muted">{fmt(a.Type)}</td>
              <td className="os-muted">{fmt(a.Platform)}</td>
              <td className="os-muted">{Array.isArray(a.Market) ? a.Market.join(', ') : fmt(a.Market)}</td>
              <td>{a['Commission Tier'] ? <span className="os-pill pill-default">{a['Commission Tier']}</span> : '—'}</td>
              <td>{a['Onboarding Status'] ? <span className={`os-pill ${sc(a['Onboarding Status'])}`}>{a['Onboarding Status']}</span> : '—'}</td>
            </tr>
          )}
          emptyMsg="No affiliates yet."
        />
      </div>
    </>
  );
}

/* ── B2B ME ───────────────────────────────────────────────── */
function B2BTab({ items }) {
  if (!items.length) return <div className="os-empty">No B2B accounts.</div>;
  const active = items.filter(i => i['Account Status'] === 'Active');
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{active.length}</div><div className="os-stat-label">Active Accounts</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total Accounts</div></div>
      </div>
      <div style={{marginTop:24}}>
        <SortableTable
          cols={[
            { label: 'Business', key: 'Business Name' },
            { label: 'Type', key: 'Business Type', w: 130 },
            { label: 'Market', key: 'Market', w: 110 },
            { label: 'Status', key: 'Account Status', w: 110 },
            { label: 'Monthly Order (AED)', key: 'Monthly Order Value (AED)', type: 'number', w: 160 },
          ]}
          data={items}
          renderRow={b => (
            <tr key={b.id}>
              <td><strong>{fmt(b['Business Name'])}</strong>
                {b['Contact Name'] && <p className="os-table-note">{b['Contact Name']}{b.Email ? ` · ${b.Email}` : ''}</p>}
              </td>
              <td className="os-muted">{fmt(b['Business Type'])}</td>
              <td className="os-muted">{fmt(b.Market)}</td>
              <td>{b['Account Status'] ? <span className={`os-pill ${sc(b['Account Status'])}`}>{b['Account Status']}</span> : '—'}</td>
              <td className="os-mono">{b['Monthly Order Value (AED)'] ? `AED ${Number(b['Monthly Order Value (AED)']).toLocaleString()}` : '—'}</td>
            </tr>
          )}
          emptyMsg="No B2B accounts."
        />
      </div>
    </>
  );
}

/* ── Partners ME ──────────────────────────────────────────── */
function PartnersTab({ items }) {
  const editor = useStatusEditor(items);
  const partnerStatuses = [...new Set(['Active', 'Prospect', 'On Hold', 'Inactive', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  if (!items.length) return <div className="os-empty">No strategic partners.</div>;
  const signed = items.filter(i => i['Agreement Signed'] === true || i['Agreement Signed'] === 'true');
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{signed.length}</div><div className="os-stat-label">Agreements Signed</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total Partners</div></div>
      </div>
      <div style={{marginTop:24}}>
        <SortableTable
          cols={[
            { label: 'Partner', key: 'Partner Name' },
            { label: 'Type', key: 'Partner Type', w: 130 },
            { label: 'Key Contact', key: 'Key Contact', w: 130 },
            { label: 'Markets', w: 130 },
            { label: 'Status', key: 'Status', w: 120 },
            { label: 'Agreement', w: 120 },
          ]}
          data={editor.dataWithStatus}
          renderRow={p => (
            <tr key={p.id}>
              <td><strong>{fmt(p['Partner Name'])}</strong>
                {p.Email && <p className="os-table-note">{p.Email}</p>}
              </td>
              <td className="os-muted">{fmt(p['Partner Type'])}</td>
              <td className="os-muted">{fmt(p['Key Contact'])}</td>
              <td className="os-muted">{Array.isArray(p['Markets Covered']) ? p['Markets Covered'].join(', ') : fmt(p['Markets Covered'])}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={p} allStatuses={partnerStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
              </td>
              <td className="os-mono">{p['Agreement Signed'] ? '✓ Signed' : 'Pending'}</td>
            </tr>
          )}
          emptyMsg="No strategic partners."
        />
      </div>
    </>
  );
}

/* ── Finance ME ───────────────────────────────────────────── */
function FinanceTab({ items }) {
  const editor = useStatusEditor(items);
  const finStatuses = [...new Set(['Draft', 'In Review', 'Approved', 'Done', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  if (!items.length) return <div className="os-empty">No finance data yet. Populates once ME store is live.</div>;
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <SortableTable
        cols={[
          { label: 'Period', key: 'Period' },
          { label: 'Market', key: 'Market', w: 100 },
          { label: 'Gross Rev (AED)', key: 'Gross Revenue (AED)', type: 'number', w: 150 },
          { label: 'Net Rev (AED)', key: 'Net Revenue (AED)', type: 'number', w: 130 },
          { label: 'GBP Equiv (£)', key: 'GBP Equivalent (£)', type: 'number', w: 130 },
          { label: 'Status', key: 'Status', w: 120 },
        ]}
        data={editor.dataWithStatus}
        sinkCompleted="Status"
        renderRow={r => {
          const isDone = DONE_VALS_SHARED.has(r.Status);
          return (
          <tr key={r.id} className={isDone ? 'row-done' : ''}>
            <td><strong>{fmt(r.Period)}</strong></td>
            <td className="os-muted">{fmt(r.Market)}</td>
            <td className="os-mono">{r['Gross Revenue (AED)'] ? `AED ${Number(r['Gross Revenue (AED)']).toLocaleString()}` : '—'}</td>
            <td className="os-mono">{r['Net Revenue (AED)'] ? `AED ${Number(r['Net Revenue (AED)']).toLocaleString()}` : '—'}</td>
            <td className="os-mono">{r['GBP Equivalent (£)'] ? `£${Number(r['GBP Equivalent (£)']).toLocaleString()}` : '—'}</td>
            <td onClick={e => e.stopPropagation()}>
              <StatusSelect record={r} allStatuses={finStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
            </td>
          </tr>
          );
        }}
        emptyMsg="No finance data yet."
      />
    </>
  );
}

/* ── Marketing ME ─────────────────────────────────────────── */
function MarketingTab({ items }) {
  const editor = useStatusEditor(items);
  const mktStatuses = [...new Set([...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  if (!items.length) return <div className="os-empty">No marketing campaigns.</div>;
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <SortableTable
        cols={[
          { label: 'Campaign', key: 'Campaign / Launch Name' },
          { label: 'Type', key: 'Type', w: 110 },
          { label: 'Market', w: 120 },
          { label: 'Status', key: 'Status', w: 120 },
          { label: 'Owner', key: 'Owner', w: 110 },
          { label: 'Start', key: 'Start Date', type: 'date', w: 100 },
          { label: 'End', key: 'End Date', type: 'date', w: 100 },
          { label: 'Budget (AED)', key: 'Budget (AED)', type: 'number', w: 120 },
        ]}
        data={editor.dataWithStatus}
        sinkCompleted="Status"
        renderRow={m => {
          const isDone = DONE_VALS_SHARED.has(m.Status);
          return (
          <tr key={m.id} className={isDone ? 'row-done' : ''}>
            <td><strong>{fmt(m['Campaign / Launch Name'])}</strong></td>
            <td className="os-muted">{fmt(m.Type)}</td>
            <td className="os-muted">{Array.isArray(m.Market) ? m.Market.join(', ') : fmt(m.Market)}</td>
            <td onClick={e => e.stopPropagation()}>
              <StatusSelect record={m} allStatuses={mktStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
            </td>
            <td className="os-muted">{fmt(m.Owner)}</td>
            <td className="os-mono">{fmt(m['Start Date'])}</td>
            <td className="os-mono">{fmt(m['End Date'])}</td>
            <td className="os-mono">{m['Budget (AED)'] ? `AED ${Number(m['Budget (AED)']).toLocaleString()}` : '—'}</td>
          </tr>
          );
        }}
        emptyMsg="No marketing campaigns."
      />
    </>
  );
}

/* ── Customer Service ME ──────────────────────────────────── */
function CSTab({ items }) {
  const editor = useStatusEditor(items);
  const csStatuses = [...new Set(['Open', 'In Progress', 'Resolved', 'Closed', 'Escalated', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  const open = editor.dataWithStatus.filter(i => !['Resolved', 'Closed', 'Done'].includes(i.Status));
  if (!items.length) return <div className="os-empty">No customer service tickets yet. Populates once ME store is live.</div>;
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-red"><div className="os-stat-num">{open.length}</div><div className="os-stat-label">Open Tickets</div></div>
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{items.length - open.length}</div><div className="os-stat-label">Resolved</div></div>
      </div>
      <div style={{marginTop:24}}>
        <SortableTable
          cols={[
            { label: 'Reference', key: 'Issue Reference' },
            { label: 'Customer', key: 'Customer Name', w: 130 },
            { label: 'Market', key: 'Market', w: 110 },
            { label: 'Category', key: 'Category', w: 130 },
            { label: 'Status', key: 'Status', w: 120 },
            { label: 'Raised', key: 'Date Raised', type: 'date', w: 100 },
          ]}
          data={editor.dataWithStatus}
          sinkCompleted="Status"
          renderRow={t => {
            const isDone = DONE_VALS_SHARED.has(t.Status);
            return (
            <tr key={t.id} className={isDone ? 'row-done' : ''}>
              <td><strong>{fmt(t['Issue Reference'])}</strong></td>
              <td className="os-muted">{fmt(t['Customer Name'])}</td>
              <td className="os-muted">{fmt(t.Market)}</td>
              <td className="os-muted">{fmt(t.Category)}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={t} allStatuses={csStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
              </td>
              <td className="os-mono">{fmt(t['Date Raised'])}</td>
            </tr>
            );
          }}
          emptyMsg="No customer service tickets."
        />
      </div>
    </>
  );
}

/* ── Customers ME ─────────────────────────────────────────── */
function CustomersTab({ items }) {
  const editor = useStatusEditor(items);
  const custStatuses = [...new Set(['Active', 'Inactive', 'VIP', 'At Risk', 'Churned', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  if (!items.length) return <div className="os-empty">No customer records yet. Populates once ME store is live.</div>;
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <SortableTable
        cols={[
          { label: 'Customer', key: 'Customer Name' },
          { label: 'Country', key: 'Country', w: 100 },
          { label: 'Source', key: 'Source', w: 110 },
          { label: 'Type', key: 'Customer Type', w: 120 },
          { label: 'Status', key: 'Status', w: 120 },
          { label: 'LTV (AED)', key: 'LTV (AED)', type: 'number', w: 110 },
          { label: 'Orders', key: 'Total Orders', type: 'number', w: 80 },
        ]}
        data={editor.dataWithStatus}
        renderRow={c => (
          <tr key={c.id}>
            <td><strong>{fmt(c['Customer Name'])}</strong>
              {c.Email && <p className="os-table-note">{c.Email}</p>}
            </td>
            <td className="os-muted">{fmt(c.Country)}</td>
            <td className="os-muted">{fmt(c.Source)}</td>
            <td className="os-muted">{fmt(c['Customer Type'])}</td>
            <td onClick={e => e.stopPropagation()}>
              <StatusSelect record={c} allStatuses={custStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
            </td>
            <td className="os-mono">{c['LTV (AED)'] ? `AED ${Number(c['LTV (AED)']).toLocaleString()}` : '—'}</td>
            <td className="os-mono">{fmt(c['Total Orders'])}</td>
          </tr>
        )}
        emptyMsg="No customer records."
      />
    </>
  );
}

/* ── Reporting ME ─────────────────────────────────────────── */
function ReportingTab({ items }) {
  const editor = useStatusEditor(items);
  const repStatuses = [...new Set(['Draft', 'In Review', 'Approved', 'Done', ...BASE_STATUSES_SHARED, ...items.map(r => r.Status).filter(Boolean)])];
  if (!items.length) return <div className="os-empty">No reporting data yet. Populates once ME store is live (late August 2026).</div>;
  return (
    <>
      {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}
      <SortableTable
        cols={[
          { label: 'Period', key: 'Period' },
          { label: 'Market', key: 'Market', w: 100 },
          { label: 'Shopify Rev (AED)', key: 'Shopify Revenue (AED)', type: 'number', w: 150 },
          { label: 'Total Rev (AED)', key: 'Total Revenue (AED)', type: 'number', w: 130 },
          { label: 'GBP Equiv (£)', key: 'GBP Equivalent (£)', type: 'number', w: 120 },
          { label: 'New Customers', key: 'New Customers', type: 'number', w: 100 },
          { label: 'MoM %', key: 'MoM Growth %', type: 'number', w: 90 },
          { label: 'Status', key: 'Status', w: 120 },
        ]}
        data={editor.dataWithStatus}
        sinkCompleted="Status"
        renderRow={r => {
          const isDone = DONE_VALS_SHARED.has(r.Status);
          return (
          <tr key={r.id} className={isDone ? 'row-done' : ''}>
            <td><strong>{fmt(r.Period)}</strong></td>
            <td className="os-muted">{fmt(r.Market)}</td>
            <td className="os-mono">{r['Shopify Revenue (AED)'] ? `AED ${Number(r['Shopify Revenue (AED)']).toLocaleString()}` : '—'}</td>
            <td className="os-mono">{r['Total Revenue (AED)'] ? `AED ${Number(r['Total Revenue (AED)']).toLocaleString()}` : '—'}</td>
            <td className="os-mono">{r['GBP Equivalent (£)'] ? `£${Number(r['GBP Equivalent (£)']).toLocaleString()}` : '—'}</td>
            <td className="os-mono">{fmt(r['New Customers'])}</td>
            <td className="os-mono">{r['MoM Growth %'] ? `${r['MoM Growth %']}%` : '—'}</td>
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

/* ── Google ──────────────────────────────────────────────── */
function GoogleTab() {
  const [sub, setSub] = useState('Merchant Center');
  return (
    <>
      <div className="os-sub-tabs" style={{ marginTop: 8, overflowX: 'auto', display: 'flex', flexWrap: 'nowrap', gap: 4 }}>
        {['Merchant Center', 'GA4 Traffic', 'AI Referrer', 'SEO'].map(s => (
          <button key={s} className={`os-subnav-btn${sub === s ? ' active' : ''}`} onClick={() => setSub(s)}>{s}</button>
        ))}
      </div>
      {sub === 'Merchant Center' && (
        <div className="os-empty" style={{ marginTop: 16 }}>
          <strong>Google Merchant Center not yet configured for Middle East.</strong>
          <p className="os-muted" style={{ marginTop: 8, fontSize: 13 }}>
            Connect the ME Shopify store to Google Merchant Center once the store goes live. Product feed approval status will appear here.
          </p>
        </div>
      )}
      {sub === 'GA4 Traffic' && (
        <div className="os-empty" style={{ marginTop: 16 }}>
          <strong>GA4 not yet connected.</strong>
          <p className="os-muted" style={{ marginTop: 8, fontSize: 13 }}>
            Connect Google Analytics 4 via the Reporting API to surface sessions, users, channel breakdown, and conversion data here.
          </p>
        </div>
      )}
      {sub === 'AI Referrer' && (
        <div className="os-empty" style={{ marginTop: 16 }}>
          <strong>AI referrer tracking not yet configured.</strong>
          <p className="os-muted" style={{ marginTop: 8, fontSize: 13 }}>
            Traffic from ChatGPT, Perplexity, and Claude will appear here once GA4 is connected and referral source dimensions are tracked.
          </p>
        </div>
      )}
      {sub === 'SEO' && (
        <div className="os-empty" style={{ marginTop: 16 }}>
          <strong>SEO data not yet connected.</strong>
          <p className="os-muted" style={{ marginTop: 8, fontSize: 13 }}>
            Connect Google Search Console for the ME domain to surface organic impressions, clicks, average position, and query data here.
          </p>
        </div>
      )}
    </>
  );
}

/* ── Subscriptions ME ─────────────────────────────────────── */
function SubscriptionsMETab({ items }) {
  const totalSubs = items.reduce((s, i) => s + (Number(i['Active Subscribers']) || 0), 0);
  const totalRev  = items.reduce((s, i) => s + (Number(i['Monthly Revenue (AED)']) || 0), 0);
  if (!items.length) return <div className="os-empty">No subscription plans yet. Add data to the Subscriptions ME table in Airtable.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{totalSubs}</div><div className="os-stat-label">Active Subscribers</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Plans</div></div>
        <div className="os-stat-card"><div className="os-stat-num">AED {totalRev.toLocaleString()}</div><div className="os-stat-label">Monthly Revenue</div></div>
      </div>
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Plan', key: 'Plan Name' },
            { label: 'Product', key: 'Product' },
            { label: 'SKU', key: 'SKU', w: 110 },
            { label: 'Discount %', key: 'Discount %', type: 'number', w: 100 },
            { label: 'Frequency', key: 'Billing Frequency', w: 120 },
            { label: 'Market', key: 'Market', w: 90 },
            { label: 'Subscribers', key: 'Active Subscribers', type: 'number', w: 110 },
            { label: 'Monthly Rev (AED)', key: 'Monthly Revenue (AED)', type: 'number', w: 150 },
            { label: 'Status', key: 'Status', w: 110 },
          ]}
          data={items}
          renderRow={s => (
            <tr key={s.id}>
              <td><strong>{fmt(s['Plan Name'])}</strong></td>
              <td className="os-muted">{fmt(s.Product)}</td>
              <td className="os-mono" style={{ fontSize: 11 }}>{fmt(s.SKU)}</td>
              <td className="os-mono">{s['Discount %'] ? `${s['Discount %']}%` : '—'}</td>
              <td className="os-muted">{fmt(s['Billing Frequency'])}</td>
              <td className="os-muted">{fmt(s.Market)}</td>
              <td className="os-mono">{fmt(s['Active Subscribers'])}</td>
              <td className="os-mono">{s['Monthly Revenue (AED)'] ? `AED ${Number(s['Monthly Revenue (AED)']).toLocaleString()}` : '—'}</td>
              <td>{s.Status ? <span className={`os-pill ${sc(s.Status)}`}>{s.Status}</span> : '—'}</td>
            </tr>
          )}
          emptyMsg="No subscription plans."
        />
      </div>
    </>
  );
}

/* ── Email / Klaviyo ME ───────────────────────────────────── */
function KlaviyoMETab({ items }) {
  if (!items.length) return <div className="os-empty">No Klaviyo flows logged. Add data to the Klaviyo ME table in Airtable.</div>;
  const active = items.filter(i => (i.Status || '').toLowerCase() === 'active').length;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{active}</div><div className="os-stat-label">Active Flows</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total Flows</div></div>
        <div className="os-stat-card"><div className="os-stat-num">AED {items.reduce((s,i) => s + (Number(i['Revenue Attributed (AED)']) || 0), 0).toLocaleString()}</div><div className="os-stat-label">Revenue Attributed</div></div>
      </div>
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Flow Name', key: 'Flow Name' },
            { label: 'Type', key: 'Flow Type', w: 130 },
            { label: 'Market', key: 'Market', w: 90 },
            { label: 'Status', key: 'Status', w: 110 },
            { label: 'Open Rate %', key: 'Open Rate %', type: 'number', w: 110 },
            { label: 'Click Rate %', key: 'Click Rate %', type: 'number', w: 110 },
            { label: 'Revenue (AED)', key: 'Revenue Attributed (AED)', type: 'number', w: 140 },
            { label: 'Recipients', key: 'Recipients', type: 'number', w: 100 },
            { label: 'Last Reviewed', key: 'Last Reviewed', type: 'date', w: 120 },
          ]}
          data={items}
          renderRow={r => (
            <tr key={r.id}>
              <td><strong>{fmt(r['Flow Name'])}</strong></td>
              <td className="os-muted">{fmt(r['Flow Type'])}</td>
              <td className="os-muted">{fmt(r.Market)}</td>
              <td>{r.Status ? <span className={`os-pill ${sc(r.Status)}`}>{r.Status}</span> : '—'}</td>
              <td className="os-mono">{r['Open Rate %'] ? `${r['Open Rate %']}%` : '—'}</td>
              <td className="os-mono">{r['Click Rate %'] ? `${r['Click Rate %']}%` : '—'}</td>
              <td className="os-mono">{r['Revenue Attributed (AED)'] ? `AED ${Number(r['Revenue Attributed (AED)']).toLocaleString()}` : '—'}</td>
              <td className="os-mono">{fmt(r.Recipients)}</td>
              <td className="os-mono">{fmt(r['Last Reviewed'])}</td>
            </tr>
          )}
          emptyMsg="No Klaviyo flow data."
        />
      </div>
    </>
  );
}

/* ── Page ─────────────────────────────────────────────────── */
export default function MEPage({ tasks, priorities, risks, registrations, inventory, affiliates, b2b, partners, finance, marketing, cs, customers, reporting, products, subscriptions = [], klaviyo = [], error, serverTime }) {
  const router = useRouter();
  const [tab, setTab] = useState('Tasks');
  useEffect(() => {
    if (router.query.tab && TABS.includes(router.query.tab)) setTab(router.query.tab);
  }, [router.query.tab]);
  const openRisks = risks.filter(r => !['Resolved','Closed','Done'].includes(r.Status)).length;
  const openTasks = tasks.filter(t => !['Done','Complete','Completed','Approved'].includes(t.Status)).length;
  const registered = registrations.filter(r => ['Approved', 'Registered', 'Done', 'Complete'].includes(r['Registration Status'])).length;
  const eligibleME = registrations.filter(r => r['Eligible for ME Launch'] === true || r['Eligible for ME Launch'] === 'true').length;

  return (
    <OsLayout title="Middle East Dashboard" region="Middle East" airtableUrl="https://airtable.com/appdN9dWxVcB2KFZ6" serverTime={serverTime}>
      <section className="region-hero region-hero-me">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Regional Module</p>
          <h1 className="os-region-title">🇦🇪 Middle East</h1>
          <div className="region-hero-stats">
            <div className="rhs"><span className="rhs-num">{openTasks}</span><span className="rhs-label">Open Tasks</span></div>
            <div className="rhs"><span className="rhs-num">{registered}/{registrations.length}</span><span className="rhs-label">Registrations</span></div>
            <div className="rhs"><span className="rhs-num">{eligibleME}</span><span className="rhs-label">ME Launch Ready</span></div>
            <div className="rhs"><span className="rhs-num">{openRisks}</span><span className="rhs-label">Open Risks</span></div>
            <div className="rhs"><span className="rhs-num">{partners.length}</span><span className="rhs-label">Partners</span></div>
            <div className="rhs"><span className="rhs-num">{b2b.length}</span><span className="rhs-label">B2B Accounts</span></div>
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
          {tab === 'Tasks' && <TaskTable tasks={tasks} />}
          {tab === 'Priorities' && <PriorityList items={priorities} />}
          {tab === 'Risks' && <RiskList items={risks} />}
          {tab === 'Registrations' && <RegistrationsTab items={registrations} />}
          {tab === 'Inventory' && <InventoryTab items={inventory} />}
          {tab === 'Affiliates' && <AffiliatesTab items={affiliates} />}
          {tab === 'B2B' && <B2BTab items={b2b} />}
          {tab === 'Partners' && <PartnersTab items={partners} />}
          {tab === 'Finance' && <FinanceTab items={finance} />}
          {tab === 'Marketing' && <MarketingTab items={marketing} />}
          {tab === 'Customer Service' && <CSTab items={cs} />}
          {tab === 'Customers' && <CustomersTab items={customers} />}
          {tab === 'Reporting'       && <ReportingTab items={reporting} />}
          {tab === 'Products'        && <ProductsSection products={products} />}
          {tab === 'Subscriptions'   && <SubscriptionsMETab items={subscriptions} />}
          {tab === 'Email / Klaviyo' && <KlaviyoMETab items={klaviyo} />}
          {tab === 'Google'          && <GoogleTab />}
        </div>
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  const safe = p => p.catch(e => { console.warn('[me] fetch partial fail:', e.message); return []; });

  const [tasks, priorities, risks, registrations, inventory, affiliates, b2b, partners, finance, marketing, cs, customers, reporting, products, subscriptions, klaviyo] = await Promise.all([
    safe(getMETasks()), safe(getMEPriorities()), safe(getMERisks()), safe(getMERegistrations()),
    safe(getMEInventory()), safe(getMEAffiliates()), safe(getMEB2B()), safe(getMEPartners()),
    safe(getMEFinance()), safe(getMEMarketing()), safe(getMECS()), safe(getMECustomers()), safe(getMEReporting()),
    safe(getProducts()),
    safe(getMESubscriptions()), safe(getMEKlaviyo()),
  ]);
  return { props: { tasks, priorities, risks, registrations, inventory, affiliates, b2b, partners, finance, marketing, cs, customers, reporting, products, subscriptions, klaviyo, error: null, serverTime: new Date().toISOString() } };
}
