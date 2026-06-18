import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import OsLayout from '../components/OsLayout';
import ProductsSection from '../components/ProductsSection';
import SortableTable from '../components/SortableTable';
import TaskDetailPanel from '../components/TaskDetailPanel';
import { useStatusEditor, StatusSelect, sc as scShared, DONE_VALS as DONE_VALS_SHARED, BASE_STATUSES as BASE_STATUSES_SHARED } from '../components/StatusSelect';
import {
  getUKTasks, getUKPriorities, getUKRisks,
  getUKAmazon, getUKAmazonCat,
  getUKShopify, getUKOrders, getUKDiscounts, getUKRefunds, getUKPayouts,
  getUKStock, getUKInbound,
  getUKReporting, getUKReconcile, getUKSoftware,
  getUKB2B, getUKCS, getUKCustomers,
  getUKAffiliates, getUKMarketing, getUKSubscriptions,
  getUKEmailList,
  getProducts,
} from '../lib/airtable';
import { getShopifyOrdersLive } from '../lib/shopify';

/* ── Section / Tab structure ──────────────────── */
const SECTIONS = ['Overview', 'Shopify UK', 'Amazon UK', 'Warehouse'];
const SECTION_TABS = {
  'Overview':   ['Tasks', 'Priorities', 'Risks', 'Reporting', 'Products'],
  'Shopify UK': ['Tasks', 'Priorities', 'Risks', 'Orders', 'Shopify', 'Customers', 'B2B', 'Affiliates', 'Email / Klaviyo', 'Marketing', 'Subscriptions', 'Customer Service', 'Finance'],
  'Amazon UK':  ['Amazon UK'],
  'Warehouse':  ['Stock on Hand', 'Inbound Stock'],
};
const TABS = Object.values(SECTION_TABS).flat();

function sectionForTab(t) {
  return Object.keys(SECTION_TABS).find(s => SECTION_TABS[s].includes(t)) || 'Overview';
}

/* Brand SVG icons for UK section buttons */
const SECTION_ICON = {
  'Overview':   <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="2" y="2" width="4" height="4" rx="0.5"/><rect x="8" y="2" width="4" height="4" rx="0.5"/><rect x="2" y="8" width="4" height="4" rx="0.5"/><rect x="8" y="8" width="4" height="4" rx="0.5"/></svg>,
  'Shopify UK': <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h10l-1.5 7H3.5L2 3z"/><path d="M5 3l.5-1.5h3L9 3"/><circle cx="5" cy="12" r="0.8" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="0.8" fill="currentColor" stroke="none"/></svg>,
  'Amazon UK':  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="10" height="7" rx="1"/><path d="M5 5V4a2 2 0 014 0v1"/></svg>,
  'Warehouse':  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12V6l6-4 6 4v6"/><rect x="4" y="7" width="2.5" height="5"/><rect x="7.5" y="7" width="2.5" height="5"/><line x1="1" y1="12" x2="13" y2="12"/></svg>,
};

/* ── Airtable base/table IDs (for inline record updates) ─── */
const UK_BASE   = 'appb0pnXsdtALWq80';
const UK_TABLES_CLIENT = {
  TASKS:      'tbl5GXDhdcu6iwCA8',
  PRIORITIES: 'tblYTB8FShzWDqVeN',
};

/* ── Helpers ──────────────────────────────────── */
const STATUS_CLASS = {
  'Done': 'pill-done', 'Complete': 'pill-done', 'Completed': 'pill-done', 'Paid': 'pill-done', 'Active': 'pill-done',
  'In Progress': 'pill-progress', 'Active Expired': 'pill-progress',
  'To Do': 'pill-todo', 'Not Started': 'pill-todo', 'Pending': 'pill-todo', 'Draft': 'pill-todo',
  'Blocked': 'pill-blocked', 'At Risk': 'pill-blocked', 'Overdue': 'pill-blocked',
};
function sc(s) { return STATUS_CLASS[s] || 'pill-default'; }
function fmt(v) { return (v === null || v === undefined || v === '') ? '—' : v; }
function gbp(v) { return v ? `£${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'; }
function gbp0(v) { return v ? `£${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'; }
/** Show 'Date of Entry' if set, otherwise fall back to createdTime (record creation date). */
function fmtEntryDate(dateEntry, createdTime) {
  const raw = dateEntry || createdTime;
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch { return raw; }
}

/* ── Shared inline-status constants ──────────── */
const DONE_VALS = new Set(['Done', 'Complete', 'Completed', 'Approved']);
const BASE_STATUSES = ['Not Started', 'To Do', 'In Progress', 'Under Review', 'Done', 'Blocked', 'Cancelled'];

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

/* ── Tasks ────────────────────────────────────── */
function TaskTable({ tasks }) {
  const [search, setSearch] = useState('');
  const [sf, setSF] = useState('');
  const [localStatus, setLocalStatus] = useState({});
  const [doneAt, setDoneAt] = useState({});
  const [saving, setSaving] = useState({});
  const [selectedTask, setSelectedTask] = useState(null);
  const [updateError, setUpdateError] = useState('');

  const allStatuses = useMemo(() =>
    [...new Set([...BASE_STATUSES, ...tasks.map(t => t.Status).filter(Boolean)])],
    [tasks]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tasks.filter(t => {
      const eff = localStatus[t.id] || t.Status;
      const mQ = !q || (t.Task || '').toLowerCase().includes(q) || (t.Owner || '').toLowerCase().includes(q);
      const mS = !sf || eff === sf;
      return mQ && mS;
    });
  }, [tasks, search, sf, localStatus]);

  const dataWithStatus = useMemo(() =>
    filtered.map(t => ({ ...t, Status: localStatus[t.id] || t.Status })),
    [filtered, localStatus]
  );

  async function handleStatusChange(recordId, newStatus) {
    setLocalStatus(prev => ({ ...prev, [recordId]: newStatus }));
    setSaving(prev => ({ ...prev, [recordId]: true }));
    if (DONE_VALS.has(newStatus)) {
      setDoneAt(prev => ({ ...prev, [recordId]: new Date().toISOString() }));
    }
    // Keep panel record in sync
    setSelectedTask(prev => prev?.id === recordId ? { ...prev, Status: newStatus } : prev);
    try {
      await patchRecord(UK_BASE, UK_TABLES_CLIENT.TASKS, recordId, { Status: newStatus });
    } catch (err) {
      setLocalStatus(prev => { const n = { ...prev }; delete n[recordId]; return n; });
      setDoneAt(prev => { const n = { ...prev }; delete n[recordId]; return n; });
      setSelectedTask(prev => prev?.id === recordId ? { ...prev, Status: tasks.find(t => t.id === recordId)?.Status } : prev);
      setUpdateError(`Save failed: ${err.message}`);
      setTimeout(() => setUpdateError(''), 6000);
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[recordId]; return n; });
    }
  }

  return (
    <>
      {updateError && (
        <div className="os-alert-error" style={{ marginBottom: 8 }}>{updateError}</div>
      )}
      <div className="os-toolbar">
        <input className="os-search" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} />
        {allStatuses.length > 0 && (
          <select className="os-select" value={sf} onChange={e => setSF(e.target.value)}>
            <option value="">All Statuses</option>
            {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <span className="os-count">{filtered.length} tasks</span>
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
          const isDone = DONE_VALS.has(t.Status);
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

/* ── Priorities ───────────────────────────────── */
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

/* ── Risks ────────────────────────────────────── */
function RiskList({ items }) {
  const open = items.filter(r => !['Resolved', 'Closed', 'Done'].includes(r.Status));
  if (!items.length) return <div className="os-empty">No risks logged.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-red"><div className="os-stat-num">{open.length}</div><div className="os-stat-label">Open Risks</div></div>
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{items.length - open.length}</div><div className="os-stat-label">Resolved</div></div>
      </div>
      <div style={{ marginTop: 24 }}>
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
        />
      </div>
    </>
  );
}

/* ── Orders (date-filtered, KPI summary) ─────── */
function OrdersTab({ orders, ordersSource, discounts, refunds }) {
  const [range, setRange] = useState('MTD');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sub, setSub] = useState('Summary');

  const today = new Date();

  const { dateFrom, dateTo } = useMemo(() => {
    const d = new Date();
    if (range === 'MTD') return { dateFrom: new Date(d.getFullYear(), d.getMonth(), 1), dateTo: today };
    if (range === 'Last Month') {
      const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const end = new Date(d.getFullYear(), d.getMonth(), 0);
      return { dateFrom: start, dateTo: end };
    }
    if (range === '30 Days') { const f = new Date(); f.setDate(f.getDate() - 30); return { dateFrom: f, dateTo: today }; }
    if (range === '90 Days') { const f = new Date(); f.setDate(f.getDate() - 90); return { dateFrom: f, dateTo: today }; }
    if (range === 'YTD') return { dateFrom: new Date(d.getFullYear(), 0, 1), dateTo: today };
    if (range === 'Custom') return { dateFrom: customFrom ? new Date(customFrom) : null, dateTo: customTo ? new Date(customTo) : today };
    return { dateFrom: null, dateTo: today };
  }, [range, customFrom, customTo]);

  const filteredOrders = useMemo(() => {
    if (!dateFrom) return orders;
    return orders.filter(o => {
      if (!o['Order Date']) return false;
      const d = new Date(o['Order Date']);
      return d >= dateFrom && d <= dateTo;
    });
  }, [orders, dateFrom, dateTo]);

  const kpis = useMemo(() => {
    const count = filteredOrders.length;
    const gross = filteredOrders.reduce((s, o) => s + (Number(o['Gross Total (£)']) || 0), 0);
    const disc = filteredOrders.reduce((s, o) => s + (Number(o['Discount Amount (£)']) || 0), 0);
    const refund = filteredOrders.reduce((s, o) => s + (Number(o['Refund Amount (£)']) || 0), 0);
    const net = filteredOrders.reduce((s, o) => s + (Number(o['Net Total (£)']) || 0), 0);
    const aov = count > 0 ? gross / count : 0;
    return { count, gross, disc, refund, net, aov };
  }, [filteredOrders]);

  const RANGES = ['MTD', 'Last Month', '30 Days', '90 Days', 'YTD', 'Custom'];

  return (
    <>
      {/* ── Date filter bar ── */}
      <div className="orders-filter-bar">
        <div className="orders-range-group">
          {RANGES.map(r => (
            <button key={r} className={`orders-range-btn${range === r ? ' active' : ''}`} onClick={() => setRange(r)}>{r}</button>
          ))}
          {ordersSource === 'live' && <span className="orders-live-badge">🟢 LIVE · Shopify</span>}
          {ordersSource !== 'live' && <span className="orders-live-badge orders-live-airtable">📋 Airtable</span>}
        </div>
        {range === 'Custom' && (
          <div className="orders-custom-dates">
            <input type="date" className="os-date-input" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span className="os-muted">→</span>
            <input type="date" className="os-date-input" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>

      {/* ── KPI cards ── */}
      <div className="orders-kpi-row">
        <div className="orders-kpi-card">
          <div className="orders-kpi-num">{kpis.count}</div>
          <div className="orders-kpi-label">ORDERS</div>
          <div className="orders-kpi-sub">{orders.length} total</div>
        </div>
        <div className="orders-kpi-card">
          <div className="orders-kpi-num">{gbp0(kpis.gross)}</div>
          <div className="orders-kpi-label">GROSS REVENUE</div>
        </div>
        <div className={`orders-kpi-card${kpis.disc > 0 ? ' orders-kpi-warn' : ''}`}>
          <div className="orders-kpi-num">{gbp(kpis.disc)}</div>
          <div className="orders-kpi-label">DISCOUNTS</div>
        </div>
        <div className={`orders-kpi-card${kpis.refund > 0 ? ' orders-kpi-alert' : ''}`}>
          <div className="orders-kpi-num">{gbp(kpis.refund)}</div>
          <div className="orders-kpi-label">REFUNDS</div>
        </div>
        <div className="orders-kpi-card">
          <div className="orders-kpi-num">{gbp0(kpis.net)}</div>
          <div className="orders-kpi-label">NET REVENUE</div>
        </div>
        <div className="orders-kpi-card">
          <div className="orders-kpi-num">{gbp(kpis.aov)}</div>
          <div className="orders-kpi-label">AOV (GROSS)</div>
        </div>
      </div>

      {/* ── Sub-tabs ── */}
      <div className="os-sub-tabs" style={{ marginTop: 24 }}>
        {['Summary', 'Orders', 'Discounts', 'Refunds'].map(s => (
          <button key={s} className={`os-sub-tab${sub === s ? ' active' : ''}`} onClick={() => setSub(s)}>{s}</button>
        ))}
      </div>

      {/* ── Summary ── */}
      {sub === 'Summary' && (
        <div className="orders-summary-grid">
          <div className="orders-summary-card">
            <h4 className="orders-summary-title">BY FINANCIAL STATUS</h4>
            <table className="os-table" style={{ marginTop: 8 }}>
              <thead><tr><th>Status</th><th style={{ width: 80 }}>Count</th></tr></thead>
              <tbody>
                {[...new Set(filteredOrders.map(o => o['Financial Status']).filter(Boolean))].map(s => (
                  <tr key={s}>
                    <td><span className={`os-pill ${sc(s)}`}>{s}</span></td>
                    <td className="os-mono">{filteredOrders.filter(o => o['Financial Status'] === s).length}</td>
                  </tr>
                ))}
                {filteredOrders.filter(o => !o['Financial Status']).length > 0 && (
                  <tr><td className="os-muted">—</td><td className="os-mono">{filteredOrders.filter(o => !o['Financial Status']).length}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="orders-summary-card">
            <h4 className="orders-summary-title">BY FULFILMENT STATUS</h4>
            <table className="os-table" style={{ marginTop: 8 }}>
              <thead><tr><th>Status</th><th style={{ width: 80 }}>Count</th></tr></thead>
              <tbody>
                {[...new Set(filteredOrders.map(o => o['Fulfilment Status']).filter(Boolean))].map(s => (
                  <tr key={s}>
                    <td><span className={`os-pill ${sc(s)}`}>{s}</span></td>
                    <td className="os-mono">{filteredOrders.filter(o => o['Fulfilment Status'] === s).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="orders-summary-card">
            <h4 className="orders-summary-title">BY CHANNEL</h4>
            <table className="os-table" style={{ marginTop: 8 }}>
              <thead><tr><th>Channel</th><th style={{ width: 80 }}>Count</th></tr></thead>
              <tbody>
                {[...new Set(filteredOrders.map(o => o.Channel).filter(Boolean))].map(c => (
                  <tr key={c}>
                    <td className="os-muted">{c}</td>
                    <td className="os-mono">{filteredOrders.filter(o => o.Channel === c).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Orders list ── */}
      {sub === 'Orders' && (
        <SortableTable
          cols={[
            { label: 'Order', key: 'Order Number' },
            { label: 'Customer', key: 'Customer Name', w: 130 },
            { label: 'Date', key: 'Order Date', type: 'date', w: 100 },
            { label: 'Gross', key: 'Gross Total (£)', type: 'number', w: 90 },
            { label: 'Discount', key: 'Discount Amount (£)', type: 'number', w: 90 },
            { label: 'Net', key: 'Net Total (£)', type: 'number', w: 90 },
            { label: 'Status', key: 'Financial Status', w: 110 },
            { label: 'Fulfilment', key: 'Fulfilment Status', w: 120 },
          ]}
          data={filteredOrders}
          renderRow={o => (
            <tr key={o.id}>
              <td><strong>{fmt(o['Order Number'])}</strong></td>
              <td className="os-muted">{fmt(o['Customer Name'])}</td>
              <td className="os-mono">{fmt(o['Order Date'])}</td>
              <td className="os-mono">{gbp(o['Gross Total (£)'])}</td>
              <td className="os-mono">{o['Discount Amount (£)'] ? <span style={{ color: 'var(--amber)' }}>{gbp(o['Discount Amount (£)'])}</span> : '—'}</td>
              <td className="os-mono">{gbp(o['Net Total (£)'])}</td>
              <td>{o['Financial Status'] ? <span className={`os-pill ${sc(o['Financial Status'])}`}>{o['Financial Status']}</span> : '—'}</td>
              <td>{o['Fulfilment Status'] ? <span className={`os-pill ${sc(o['Fulfilment Status'])}`}>{o['Fulfilment Status']}</span> : '—'}</td>
            </tr>
          )}
          emptyMsg="No orders in this date range."
        />
      )}

      {/* ── Discounts ── */}
      {sub === 'Discounts' && (
        <SortableTable
          cols={[
            { label: 'Code', key: 'Voucher Code' },
            { label: 'Type', key: 'Discount Type', w: 120 },
            { label: 'Value', key: 'Discount Value', w: 80 },
            { label: 'Orders', key: 'Orders Using Code', type: 'number', w: 80 },
            { label: 'Revenue', key: 'Revenue Generated (£)', type: 'number', w: 110 },
            { label: 'Discount Cost', key: 'Gross Discount Value (£)', type: 'number', w: 110 },
            { label: 'Status', key: 'Active / Expired', w: 110 },
          ]}
          data={discounts}
          renderRow={d => (
            <tr key={d.id}>
              <td><strong>{fmt(d['Voucher Code'])}</strong><p className="os-table-note">{fmt(d.Campaign)}</p></td>
              <td className="os-muted">{fmt(d['Discount Type'])}</td>
              <td className="os-mono">{fmt(d['Discount Value'])}</td>
              <td className="os-mono">{fmt(d['Orders Using Code'])}</td>
              <td className="os-mono">{gbp(d['Revenue Generated (£)'])}</td>
              <td className="os-mono">{gbp(d['Gross Discount Value (£)'])}</td>
              <td>{d['Active / Expired'] ? <span className={`os-pill ${sc(d['Active / Expired'])}`}>{d['Active / Expired']}</span> : '—'}</td>
            </tr>
          )}
          emptyMsg="No discount codes."
        />
      )}

      {/* ── Refunds ── */}
      {sub === 'Refunds' && (
        <SortableTable
          cols={[
            { label: 'Reference', key: 'Refund Reference' },
            { label: 'Order', key: 'Order Number', w: 100 },
            { label: 'Customer', key: 'Customer Name', w: 130 },
            { label: 'Date', key: 'Refund Date', type: 'date', w: 100 },
            { label: 'Amount', key: 'Refund Amount (£)', type: 'number', w: 90 },
            { label: 'Reason', key: 'Reason', w: 130 },
          ]}
          data={refunds}
          renderRow={r => (
            <tr key={r.id}>
              <td><strong>{fmt(r['Refund Reference'])}</strong></td>
              <td className="os-mono">{fmt(r['Order Number'])}</td>
              <td className="os-muted">{fmt(r['Customer Name'])}</td>
              <td className="os-mono">{fmt(r['Refund Date'])}</td>
              <td className="os-mono">{gbp(r['Refund Amount (£)'])}</td>
              <td className="os-muted">{fmt(r.Reason)}</td>
            </tr>
          )}
          emptyMsg="No refunds."
        />
      )}
    </>
  );
}

/* ── Shopify Products ─────────────────────────── */
function ShopifyTab({ products }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const cats = [...new Set(products.map(p => p.Category).filter(Boolean))].sort();
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      const mQ = !q || (p.Product || '').toLowerCase().includes(q) || (p.SKU || '').toLowerCase().includes(q);
      const mC = !cat || p.Category === cat;
      return mQ && mC;
    });
  }, [products, search, cat]);

  const totalShopifyStock = filtered.reduce((s, p) => s + (Number(p['Shopify Stock']) || 0), 0);
  const byStock = useMemo(() => [...filtered].filter(p => Number(p['Shopify Stock']) > 0).sort((a, b) => (Number(b['Shopify Stock']) || 0) - (Number(a['Shopify Stock']) || 0)), [filtered]);
  const top5 = byStock.slice(0, 5);
  const bottom5 = [...byStock].reverse().slice(0, 5);

  return (
    <>
      <div className="wh-banner">
        <div className="wh-banner-inner">
          <span className="wh-banner-label">Shopify UK</span>
          <span className="wh-banner-sub">Live product catalogue</span>
        </div>
        <div className="wh-banner-stats">
          <div className="wh-banner-stat"><span className="wh-banner-num">{filtered.length}</span><span className="wh-banner-unit">SKUs</span></div>
          <div className="wh-banner-stat"><span className="wh-banner-num">{totalShopifyStock.toLocaleString()}</span><span className="wh-banner-unit">Units</span></div>
        </div>
      </div>
      {(top5.length > 0 || bottom5.length > 0) && (
        <div className="wh-insights">
          {top5.length > 0 && (
            <div className="wh-insight-block">
              <div className="wh-insight-title">↑ Top 5 Stock</div>
              {top5.map(p => (
                <div key={p.id} className="wh-insight-row">
                  <span className="wh-insight-name">{p.Product || p.SKU || '—'}</span>
                  <span className="wh-insight-num">{p['Shopify Stock']}</span>
                </div>
              ))}
            </div>
          )}
          {bottom5.length > 0 && (
            <div className="wh-insight-block">
              <div className="wh-insight-title">↓ Lowest Stock</div>
              {bottom5.map(p => (
                <div key={p.id} className="wh-insight-row">
                  <span className="wh-insight-name">{p.Product || p.SKU || '—'}</span>
                  <span className="wh-insight-num wh-insight-low">{p['Shopify Stock']}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="os-toolbar">
        <input className="os-search" placeholder="Search products, SKU…" value={search} onChange={e => setSearch(e.target.value)} />
        {cats.length > 0 && (
          <select className="os-select" value={cat} onChange={e => setCat(e.target.value)}>
            <option value="">All Categories</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <span className="os-count">{filtered.length} products</span>
      </div>
      <SortableTable
        cols={[
          { label: 'Product', key: 'Product' },
          { label: 'SKU', key: 'SKU', w: 100 },
          { label: 'Category', key: 'Category', w: 110 },
          { label: 'Price', key: 'Price (GBP)', type: 'number', w: 80 },
          { label: 'Stock', key: 'Shopify Stock', type: 'number', w: 80 },
          { label: 'Margin %', key: 'Gross Margin %', type: 'number', w: 100 },
          { label: 'Status', key: 'Status', w: 110 },
        ]}
        data={filtered}
        renderRow={p => (
          <tr key={p.id}>
            <td><strong>{fmt(p.Product)}</strong></td>
            <td className="os-mono">{fmt(p.SKU)}</td>
            <td className="os-muted">{fmt(p.Category)}</td>
            <td className="os-mono">{p['Price (GBP)'] ? `£${p['Price (GBP)']}` : '—'}</td>
            <td className="os-mono">{fmt(p['Shopify Stock'])}</td>
            <td className="os-mono">{p['Gross Margin %'] ? `${p['Gross Margin %']}%` : '—'}</td>
            <td>{p.Status ? <span className={`os-pill ${sc(p.Status)}`}>{p.Status}</span> : '—'}</td>
          </tr>
        )}
        emptyMsg="No products found."
      />
    </>
  );
}

/* ── Amazon UK — full hub ─────────────────────── */
function AmazonTab({ fba, catalogue, tasks, priorities, marketing, inbound, reporting }) {
  const [sub, setSub] = useState('Overview');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatus, setTaskStatus] = useState('');

  const AMZ_SUBS = ['Overview', 'Tasks', 'Priorities', 'FBA Stock', 'Inbound', 'Catalogue', 'Marketing', 'Reporting'];

  // Status editors — one per dataset so each table has independent optimistic state
  const tasksEditor    = useStatusEditor(tasks);
  const catEditor      = useStatusEditor(catalogue);
  const fbaEditor      = useStatusEditor(fba);
  const mktEditor      = useStatusEditor(marketing);
  const inboundEditor  = useStatusEditor(inbound);
  const reportingEditor = useStatusEditor(reporting);

  // Derive status option lists
  const catStatuses      = useMemo(() => [...new Set([...BASE_STATUSES_SHARED, ...(catalogue || []).map(r => r.Status).filter(Boolean)])], [catalogue]);
  const fbaStatuses      = useMemo(() => [...new Set([...BASE_STATUSES_SHARED, ...(fba || []).map(r => r.Status).filter(Boolean)])], [fba]);
  const mktStatuses      = useMemo(() => [...new Set([...BASE_STATUSES_SHARED, ...(marketing || []).map(r => r.Status).filter(Boolean)])], [marketing]);
  const inboundStatuses  = useMemo(() => [...new Set(['Pending', 'In Transit', 'Received', 'Done', 'Delayed', ...BASE_STATUSES_SHARED, ...(inbound || []).map(r => r.Status).filter(Boolean)])], [inbound]);
  const reportingStatuses = useMemo(() => [...new Set(['Draft', 'In Review', 'Approved', 'Done', ...BASE_STATUSES_SHARED, ...(reporting || []).map(r => r.Status).filter(Boolean)])], [reporting]);

  // Filter to Amazon-related records (using editors' dataWithStatus so local changes propagate)
  const amazonTasks = useMemo(() =>
    tasksEditor.dataWithStatus.filter(t => (t['Business Area'] || '').toLowerCase().includes('amazon')),
    [tasksEditor.dataWithStatus]
  );
  const amazonPriorities = useMemo(() =>
    priorities.filter(p => (p['Business Area'] || '').toLowerCase().includes('amazon')),
    [priorities]
  );
  const amazonMarketing = useMemo(() =>
    mktEditor.dataWithStatus.filter(m =>
      (m.Type || '').toLowerCase().includes('amazon') ||
      (m.Channel || '').toLowerCase().includes('amazon') ||
      (m['Campaign / Launch Name'] || '').toLowerCase().includes('amazon')
    ),
    [mktEditor.dataWithStatus]
  );
  // Inbound destined for Amazon FBA
  const amazonInbound = useMemo(() =>
    inboundEditor.dataWithStatus.filter(s => {
      const ch = Array.isArray(s.Channel) ? s.Channel.join(' ') : (s.Channel || '');
      return ch.toLowerCase().includes('amazon') || (s.Location || '').toLowerCase().includes('amazon');
    }),
    [inboundEditor.dataWithStatus]
  );

  const reorderCount = fba.filter(p => p.Reorder === 'Yes' || p.Reorder === true).length;
  const totalFBA = fba.reduce((s, p) => s + (Number(p['FBA Stock']) || 0), 0);
  const openTasks = amazonTasks.filter(t => !DONE_VALS_SHARED.has(t.Status));
  const taskStatuses = [...new Set([...BASE_STATUSES_SHARED, ...amazonTasks.map(t => t.Status).filter(Boolean)])];

  const filteredTasks = useMemo(() => {
    const q = taskSearch.toLowerCase();
    return amazonTasks.filter(t => {
      const mQ = !q || (t.Task || '').toLowerCase().includes(q) || (t.Owner || '').toLowerCase().includes(q);
      const mS = !taskStatus || t.Status === taskStatus;
      return mQ && mS;
    });
  }, [amazonTasks, taskSearch, taskStatus]);

  const totalInbound = amazonInbound.reduce((s, i) => s + (Number(i['Inbound QTY']) || 0), 0);

  // Aggregate update errors
  const anyError = tasksEditor.updateError || catEditor.updateError || fbaEditor.updateError ||
    mktEditor.updateError || inboundEditor.updateError || reportingEditor.updateError;

  return (
    <>
      {/* Sub-tab nav */}
      <div className="os-sub-tabs">
        {AMZ_SUBS.map(s => (
          <button key={s} className={`os-sub-tab${sub === s ? ' active' : ''}`} onClick={() => setSub(s)}>{s}</button>
        ))}
      </div>

      {anyError && <div className="os-alert-error" style={{ marginTop: 8 }}>{anyError}</div>}

      {/* ── Overview ── */}
      {sub === 'Overview' && (
        <>
          <div className="os-stat-row" style={{ marginTop: 16 }}>
            <div className="os-stat-card"><div className="os-stat-num">{fba.length}</div><div className="os-stat-label">Amazon SKUs</div></div>
            <div className="os-stat-card"><div className="os-stat-num">{totalFBA.toLocaleString()}</div><div className="os-stat-label">FBA Units</div></div>
            <div className={`os-stat-card${reorderCount > 0 ? ' os-stat-red' : ' os-stat-green'}`}><div className="os-stat-num">{reorderCount}</div><div className="os-stat-label">Reorder Required</div></div>
            <div className="os-stat-card"><div className="os-stat-num">{amazonInbound.length}</div><div className="os-stat-label">Inbound Lines</div></div>
            <div className="os-stat-card"><div className="os-stat-num">{totalInbound.toLocaleString()}</div><div className="os-stat-label">Inbound Units</div></div>
            <div className={`os-stat-card${openTasks.length > 0 ? ' os-stat-amber' : ' os-stat-green'}`}><div className="os-stat-num">{openTasks.length}</div><div className="os-stat-label">Open Tasks</div></div>
          </div>

          {amazonPriorities.length > 0 && (
            <>
              <h3 className="os-section-heading" style={{ marginTop: 28 }}>Amazon Priorities</h3>
              <div className="priority-list">
                {amazonPriorities.map((p, i) => (
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
            </>
          )}

          {openTasks.length > 0 && (
            <>
              <h3 className="os-section-heading" style={{ marginTop: 28 }}>Open Amazon Tasks</h3>
              <SortableTable
                cols={[
                  { label: 'Task', key: 'Task' },
                  { label: 'Area', key: 'Business Area', w: 130 },
                  { label: 'Status', key: 'Status', w: 120 },
                  { label: 'Priority', key: 'Priority', w: 100 },
                  { label: 'Owner', key: 'Owner', w: 110 },
                  { label: 'Due', key: 'Due Date', type: 'date', w: 100 },
                ]}
                data={openTasks}
                sinkCompleted="Status"
                renderRow={t => {
                  const isDone = DONE_VALS_SHARED.has(t.Status);
                  return (
                  <tr key={t.id} className={isDone ? 'row-done' : ''}>
                    <td><strong>{fmt(t.Task)}</strong>{t.Notes && <p className="os-table-note">{t.Notes}</p>}</td>
                    <td className="os-muted">{fmt(t['Business Area'])}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <StatusSelect record={t} allStatuses={taskStatuses} handleStatusChange={tasksEditor.handleStatusChange} saving={tasksEditor.saving} />
                    </td>
                    <td>{t.Priority ? <span className="os-pill pill-default">{t.Priority}</span> : '—'}</td>
                    <td className="os-muted">{fmt(t.Owner)}</td>
                    <td className="os-mono">{fmt(t['Due Date'])}</td>
                  </tr>
                  );
                }}
                emptyMsg="No open tasks."
              />
            </>
          )}

          {reorderCount > 0 && (
            <>
              <h3 className="os-section-heading" style={{ marginTop: 28 }}>⚠️ Reorder Required</h3>
              <SortableTable
                cols={[
                  { label: 'Product', key: 'Product' },
                  { label: 'ASIN', key: 'ASIN', w: 130 },
                  { label: 'FBA Stock', key: 'FBA Stock', type: 'number', w: 90 },
                  { label: 'Days Left', key: 'Days Left', type: 'number', w: 90 },
                  { label: 'Velocity/day', key: 'Velocity (daily)', type: 'number', w: 100 },
                ]}
                data={fba.filter(p => p.Reorder === 'Yes' || p.Reorder === true)}
                renderRow={p => (
                  <tr key={p.id}>
                    <td><strong>{fmt(p.Product)}</strong></td>
                    <td className="os-mono" style={{ fontSize: 11 }}>{fmt(p.ASIN)}</td>
                    <td className="os-mono"><span style={{ color: 'var(--red-500, #ef4444)', fontWeight: 700 }}>{fmt(p['FBA Stock'])}</span></td>
                    <td className="os-mono"><span style={{ color: 'var(--red-500, #ef4444)', fontWeight: 700 }}>{fmt(p['Days Left'])}</span></td>
                    <td className="os-mono">{fmt(p['Velocity (daily)'])}</td>
                  </tr>
                )}
                emptyMsg=""
              />
            </>
          )}
        </>
      )}

      {/* ── Tasks ── */}
      {sub === 'Tasks' && (
        <>
          <div className="os-toolbar" style={{ marginTop: 8 }}>
            <input className="os-search" placeholder="Search tasks, owners…" value={taskSearch} onChange={e => setTaskSearch(e.target.value)} />
            {taskStatuses.length > 0 && (
              <select className="os-select" value={taskStatus} onChange={e => setTaskStatus(e.target.value)}>
                <option value="">All Statuses</option>
                {taskStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <span className="os-count">{filteredTasks.length} tasks</span>
          </div>
          <SortableTable
            cols={[
              { label: 'Task', key: 'Task' },
              { label: 'Area', key: 'Business Area', w: 140 },
              { label: 'Status', key: 'Status', w: 120 },
              { label: 'Priority', key: 'Priority', w: 100 },
              { label: 'Owner', key: 'Owner', w: 110 },
              { label: 'Due', key: 'Due Date', type: 'date', w: 100 },
            ]}
            data={filteredTasks}
            sinkCompleted="Status"
            renderRow={t => {
              const isDone = DONE_VALS_SHARED.has(t.Status);
              return (
              <tr key={t.id} className={isDone ? 'row-done' : ''}>
                <td><strong>{fmt(t.Task)}</strong>{t.Notes && <p className="os-table-note">{t.Notes}</p>}</td>
                <td className="os-muted">{fmt(t['Business Area'])}</td>
                <td onClick={e => e.stopPropagation()}>
                  <StatusSelect record={t} allStatuses={taskStatuses} handleStatusChange={tasksEditor.handleStatusChange} saving={tasksEditor.saving} />
                </td>
                <td>{t.Priority ? <span className="os-pill pill-default">{t.Priority}</span> : '—'}</td>
                <td className="os-muted">{fmt(t.Owner)}</td>
                <td className="os-mono">{fmt(t['Due Date'])}</td>
              </tr>
              );
            }}
            emptyMsg="No Amazon tasks found."
          />
        </>
      )}

      {/* ── Priorities ── */}
      {sub === 'Priorities' && (
        amazonPriorities.length === 0
          ? <div className="os-empty">No Amazon priorities logged.</div>
          : <div className="priority-list" style={{ marginTop: 8 }}>
              {amazonPriorities.map((p, i) => (
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
      )}

      {/* ── FBA Stock ── */}
      {sub === 'FBA Stock' && (
        !fba.length ? <div className="os-empty">No Amazon FBA stock data.</div> : (() => {
          const fbaByStock = [...fba].filter(p => Number(p['FBA Stock']) > 0).sort((a, b) => (Number(b['FBA Stock']) || 0) - (Number(a['FBA Stock']) || 0));
          const fbaTop5 = fbaByStock.slice(0, 5);
          const fbaBottom5 = [...fbaByStock].reverse().slice(0, 5);
          return (
          <>
            <div className="wh-banner" style={{ marginTop: 8 }}>
              <div className="wh-banner-inner">
                <span className="wh-banner-label">Amazon UK — FBA Stock</span>
                <span className="wh-banner-sub">Fulfilment by Amazon inventory</span>
              </div>
              <div className="wh-banner-stats">
                <div className="wh-banner-stat"><span className="wh-banner-num">{fba.length}</span><span className="wh-banner-unit">SKUs</span></div>
                <div className="wh-banner-stat"><span className="wh-banner-num">{totalFBA.toLocaleString()}</span><span className="wh-banner-unit">Units</span></div>
                {reorderCount > 0 && <div className="wh-banner-stat"><span className="wh-banner-num" style={{ color: '#f87171' }}>{reorderCount}</span><span className="wh-banner-unit">Reorder</span></div>}
              </div>
            </div>
            {(fbaTop5.length > 0 || fbaBottom5.length > 0) && (
              <div className="wh-insights">
                {fbaTop5.length > 0 && (
                  <div className="wh-insight-block">
                    <div className="wh-insight-title">↑ Top 5 FBA Stock</div>
                    {fbaTop5.map(p => (
                      <div key={p.id} className="wh-insight-row">
                        <span className="wh-insight-name">{p.Product || p['Amazon SKU'] || '—'}</span>
                        <span className="wh-insight-num">{p['FBA Stock']}</span>
                      </div>
                    ))}
                  </div>
                )}
                {fbaBottom5.length > 0 && (
                  <div className="wh-insight-block">
                    <div className="wh-insight-title">↓ Lowest FBA Stock</div>
                    {fbaBottom5.map(p => (
                      <div key={p.id} className="wh-insight-row">
                        <span className="wh-insight-name">{p.Product || p['Amazon SKU'] || '—'}</span>
                        <span className="wh-insight-num wh-insight-low">{p['FBA Stock']}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <SortableTable
                cols={[
                  { label: 'Product', key: 'Product' },
                  { label: 'ASIN', key: 'ASIN', w: 130 },
                  { label: 'FBA Stock', key: 'FBA Stock', type: 'number', w: 90 },
                  { label: 'Velocity/day', key: 'Velocity (daily)', type: 'number', w: 100 },
                  { label: 'Days Left', key: 'Days Left', type: 'number', w: 90 },
                  { label: 'Margin %', key: 'Margin %', type: 'number', w: 90 },
                  { label: 'P30 Forecast', key: 'P30 Forecast £', type: 'number', w: 120 },
                  { label: 'Reorder', key: 'Reorder', w: 90 },
                  { label: 'Status', key: 'Status', w: 110 },
                ]}
                data={fbaEditor.dataWithStatus}
                sinkCompleted="Status"
                renderRow={p => {
                  const isDone = DONE_VALS_SHARED.has(p.Status);
                  return (
                  <tr key={p.id} className={isDone ? 'row-done' : ''}>
                    <td><strong>{fmt(p.Product)}</strong><p className="os-table-note os-mono" style={{ fontSize: 10 }}>{fmt(p['Amazon SKU'])}</p></td>
                    <td className="os-mono" style={{ fontSize: 11 }}>{fmt(p.ASIN)}</td>
                    <td className="os-mono">{fmt(p['FBA Stock'])}</td>
                    <td className="os-mono">{fmt(p['Velocity (daily)'])}</td>
                    <td className="os-mono">{p['Days Left'] && p['Days Left'] < 30 ? <span style={{ color: 'var(--red-500, #ef4444)', fontWeight: 700 }}>{p['Days Left']}</span> : fmt(p['Days Left'])}</td>
                    <td className="os-mono">{p['Margin %'] ? `${p['Margin %']}%` : '—'}</td>
                    <td className="os-mono">{gbp(p['P30 Forecast £'])}</td>
                    <td>{(p.Reorder === 'Yes' || p.Reorder === true) ? <span className="os-pill pill-blocked">Yes</span> : <span className="os-pill pill-done">No</span>}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <StatusSelect record={p} allStatuses={fbaStatuses} handleStatusChange={fbaEditor.handleStatusChange} saving={fbaEditor.saving} />
                    </td>
                  </tr>
                  );
                }}
              />
            </div>
          </>
          );
        })()
      )}

      {/* ── Inbound (Bio-nature → Amazon FBA) ── */}
      {sub === 'Inbound' && (
        <>
          <div className="wh-banner" style={{ marginTop: 8 }}>
            <div className="wh-banner-inner">
              <span className="wh-banner-label">Bio-nature → Amazon FBA</span>
              <span className="wh-banner-sub">Stock en route to FBA fulfilment centres</span>
            </div>
            <div className="wh-banner-stats">
              <div className="wh-banner-stat"><span className="wh-banner-num">{amazonInbound.length}</span><span className="wh-banner-unit">Lines</span></div>
              <div className="wh-banner-stat"><span className="wh-banner-num">{totalInbound.toLocaleString()}</span><span className="wh-banner-unit">Units</span></div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            {amazonInbound.length === 0
              ? <div className="os-empty">No inbound stock tagged to Amazon. Showing all inbound lines below.</div>
              : null}
            <SortableTable
              cols={[
                { label: 'Product', key: 'Product' },
                { label: 'SKU', key: 'SKU', w: 110 },
                { label: 'Inbound QTY', key: 'Inbound QTY', type: 'number', w: 110 },
                { label: 'PO Reference', key: 'PO Reference', w: 140 },
                { label: 'Location', key: 'Location', w: 130 },
                { label: 'Status', key: 'Status', w: 110 },
                { label: 'Expected Arrival', key: 'Expected Arrival', type: 'date', w: 140 },
              ]}
              data={amazonInbound.length > 0 ? amazonInbound : inboundEditor.dataWithStatus}
              sinkCompleted="Status"
              renderRow={s => {
                const isDone = DONE_VALS_SHARED.has(s.Status);
                return (
                <tr key={s.id} className={isDone ? 'row-done' : ''}>
                  <td><strong>{fmt(s.Product)}</strong></td>
                  <td className="os-mono">{fmt(s.SKU)}</td>
                  <td className="os-mono"><strong>{fmt(s['Inbound QTY'])}</strong></td>
                  <td className="os-mono">{fmt(s['PO Reference'])}</td>
                  <td className="os-muted">{fmt(s.Location)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <StatusSelect record={s} allStatuses={inboundStatuses} handleStatusChange={inboundEditor.handleStatusChange} saving={inboundEditor.saving} />
                  </td>
                  <td className="os-mono">{fmt(s['Expected Arrival'])}</td>
                </tr>
                );
              }}
              emptyMsg="No inbound stock."
            />
          </div>
        </>
      )}

      {/* ── Catalogue ── */}
      {sub === 'Catalogue' && (
        <div style={{ marginTop: 8 }}>
          <SortableTable
            cols={[
              { label: 'Task / Update', key: 'Task / Update' },
              { label: 'Category', key: 'Category', w: 130 },
              { label: 'Status', key: 'Status', w: 110 },
              { label: 'Priority', key: 'Priority', w: 100 },
              { label: 'Owner', key: 'Owner', w: 110 },
              { label: 'ASIN / SKU', key: 'ASIN / SKU', w: 120 },
            ]}
            data={catEditor.dataWithStatus}
            sinkCompleted="Status"
            renderRow={t => {
              const isDone = DONE_VALS_SHARED.has(t.Status);
              return (
              <tr key={t.id} className={isDone ? 'row-done' : ''}>
                <td><strong>{fmt(t['Task / Update'])}</strong>{t['Notes / Detail'] && <p className="os-table-note">{t['Notes / Detail']}</p>}</td>
                <td className="os-muted">{fmt(t.Category)}</td>
                <td onClick={e => e.stopPropagation()}>
                  <StatusSelect record={t} allStatuses={catStatuses} handleStatusChange={catEditor.handleStatusChange} saving={catEditor.saving} />
                </td>
                <td>{t.Priority ? <span className="os-pill pill-default">{t.Priority}</span> : '—'}</td>
                <td className="os-muted">{fmt(t.Owner)}</td>
                <td className="os-mono" style={{ fontSize: 11 }}>{fmt(t['ASIN / SKU'])}</td>
              </tr>
              );
            }}
            emptyMsg="No catalogue tasks."
          />
        </div>
      )}

      {/* ── Marketing ── */}
      {sub === 'Marketing' && (
        <div style={{ marginTop: 8 }}>
          {amazonMarketing.length === 0 && (
            <p className="os-muted" style={{ marginBottom: 12, fontSize: 13 }}>No Amazon-tagged campaigns found — showing all UK marketing below.</p>
          )}
          <SortableTable
            cols={[
              { label: 'Campaign', key: 'Campaign / Launch Name' },
              { label: 'Type', key: 'Type', w: 110 },
              { label: 'Status', key: 'Status', w: 110 },
              { label: 'Owner', key: 'Owner', w: 110 },
              { label: 'Start', key: 'Start Date', type: 'date', w: 100 },
              { label: 'End', key: 'End Date', type: 'date', w: 100 },
              { label: 'Budget', key: 'Budget (£)', type: 'number', w: 100 },
              { label: 'Revenue', key: 'Revenue Generated (£)', type: 'number', w: 110 },
            ]}
            data={amazonMarketing.length > 0 ? amazonMarketing : mktEditor.dataWithStatus}
            sinkCompleted="Status"
            renderRow={m => {
              const isDone = DONE_VALS_SHARED.has(m.Status);
              return (
              <tr key={m.id} className={isDone ? 'row-done' : ''}>
                <td><strong>{fmt(m['Campaign / Launch Name'])}</strong></td>
                <td className="os-muted">{fmt(m.Type)}</td>
                <td onClick={e => e.stopPropagation()}>
                  <StatusSelect record={m} allStatuses={mktStatuses} handleStatusChange={mktEditor.handleStatusChange} saving={mktEditor.saving} />
                </td>
                <td className="os-muted">{fmt(m.Owner)}</td>
                <td className="os-mono">{fmt(m['Start Date'])}</td>
                <td className="os-mono">{fmt(m['End Date'])}</td>
                <td className="os-mono">{gbp(m['Budget (£)'])}</td>
                <td className="os-mono">{gbp(m['Revenue Generated (£)'])}</td>
              </tr>
              );
            }}
            emptyMsg="No marketing campaigns."
          />
        </div>
      )}

      {/* ── Reporting ── */}
      {sub === 'Reporting' && (
        <div style={{ marginTop: 8 }}>
          <div className="wh-banner">
            <div className="wh-banner-inner">
              <span className="wh-banner-label">Amazon UK — Reporting</span>
              <span className="wh-banner-sub">Monthly reconciliation, ads &amp; performance</span>
            </div>
            <div className="wh-banner-stats">
              <div className="wh-banner-stat"><span className="wh-banner-num">{(reporting || []).length}</span><span className="wh-banner-unit">Periods</span></div>
            </div>
          </div>
          {(!reporting || reporting.length === 0) ? (
            <div className="os-empty" style={{ marginTop: 20 }}>
              <p style={{ marginBottom: 8 }}>No reporting data yet.</p>
              <p className="os-muted" style={{ fontSize: 13 }}>Add monthly periods to the Reporting table in Airtable — or upload an export here for review. Fields to add: Period, Amazon Revenue (£), Amazon Orders, Ad Spend (£), ACOS %, TACOS %, Net Revenue (£), Refunds (£), FBA Fees (£), Status.</p>
            </div>
          ) : (
            <SortableTable
              cols={[
                { label: 'Period', key: 'Period' },
                { label: 'Amazon Rev', key: 'Amazon Revenue (£)', type: 'number', w: 120 },
                { label: 'Orders', key: 'Amazon Orders', type: 'number', w: 90 },
                { label: 'Ad Spend', key: 'Ad Spend (£)', type: 'number', w: 100 },
                { label: 'ACOS %', key: 'ACOS %', type: 'number', w: 80 },
                { label: 'FBA Fees', key: 'FBA Fees (£)', type: 'number', w: 100 },
                { label: 'Net Rev', key: 'Net Revenue (£)', type: 'number', w: 110 },
                { label: 'Status', key: 'Status', w: 110 },
              ]}
              data={reportingEditor.dataWithStatus}
              renderRow={r => (
                <tr key={r.id}>
                  <td><strong>{fmt(r.Period)}</strong></td>
                  <td className="os-mono">{gbp(r['Amazon Revenue (£)'])}</td>
                  <td className="os-mono">{fmt(r['Amazon Orders'])}</td>
                  <td className="os-mono">{r['Ad Spend (£)'] ? <span style={{ color: 'var(--amber)' }}>{gbp(r['Ad Spend (£)'])}</span> : '—'}</td>
                  <td className="os-mono">{r['ACOS %'] ? `${r['ACOS %']}%` : '—'}</td>
                  <td className="os-mono">{gbp(r['FBA Fees (£)'])}</td>
                  <td className="os-mono">{gbp(r['Net Revenue (£)'])}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <StatusSelect record={r} allStatuses={reportingStatuses} handleStatusChange={reportingEditor.handleStatusChange} saving={reportingEditor.saving} />
                  </td>
                </tr>
              )}
              emptyMsg="No reporting data."
            />
          )}
        </div>
      )}
    </>
  );
}

/* ── Warehouse: Stock on Hand (Bio-nature) ────── */
function SOHTab({ soh }) {
  const [chanFilter, setChan] = useState('');
  const [search, setSearch] = useState('');
  const channels = [...new Set(soh.flatMap(s => Array.isArray(s.Channel) ? s.Channel : [s.Channel]).filter(Boolean))].sort();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return soh.filter(s => {
      const mQ = !q || (s.Product || '').toLowerCase().includes(q) || (s.SKU || '').toLowerCase().includes(q);
      const mC = !chanFilter || (Array.isArray(s.Channel) ? s.Channel.includes(chanFilter) : s.Channel === chanFilter);
      return mQ && mC;
    });
  }, [soh, search, chanFilter]);

  const totalUnits = filtered.reduce((sum, s) => sum + (Number(s['Total QTY']) || 0), 0);
  const byQty = useMemo(() => [...filtered].filter(s => Number(s['Total QTY']) > 0).sort((a, b) => (Number(b['Total QTY']) || 0) - (Number(a['Total QTY']) || 0)), [filtered]);
  const top5soh = byQty.slice(0, 5);
  const bottom5soh = [...byQty].reverse().slice(0, 5);

  return (
    <>
      <div className="wh-banner">
        <div className="wh-banner-inner">
          <span className="wh-banner-label">Bio-nature UK Warehouse</span>
          <span className="wh-banner-sub">Stock on hand — allocated by channel</span>
        </div>
        <div className="wh-banner-stats">
          <div className="wh-banner-stat"><span className="wh-banner-num">{filtered.length}</span><span className="wh-banner-unit">SKUs</span></div>
          <div className="wh-banner-stat"><span className="wh-banner-num">{totalUnits.toLocaleString()}</span><span className="wh-banner-unit">Units</span></div>
        </div>
      </div>
      {(top5soh.length > 0 || bottom5soh.length > 0) && (
        <div className="wh-insights">
          {top5soh.length > 0 && (
            <div className="wh-insight-block">
              <div className="wh-insight-title">↑ Top 5 Stock</div>
              {top5soh.map(s => (
                <div key={s.id} className="wh-insight-row">
                  <span className="wh-insight-name">{s.Product || s.SKU || '—'}</span>
                  <span className="wh-insight-num">{s['Total QTY']}</span>
                </div>
              ))}
            </div>
          )}
          {bottom5soh.length > 0 && (
            <div className="wh-insight-block">
              <div className="wh-insight-title">↓ Lowest Stock</div>
              {bottom5soh.map(s => (
                <div key={s.id} className="wh-insight-row">
                  <span className="wh-insight-name">{s.Product || s.SKU || '—'}</span>
                  <span className="wh-insight-num wh-insight-low">{s['Total QTY']}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="os-toolbar" style={{ marginTop: 16 }}>
        <input className="os-search" placeholder="Search product, SKU…" value={search} onChange={e => setSearch(e.target.value)} />
        {channels.length > 0 && (
          <select className="os-select" value={chanFilter} onChange={e => setChan(e.target.value)}>
            <option value="">All Channels</option>
            {channels.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <span className="os-count">{filtered.length} SKUs</span>
      </div>

      <SortableTable
        cols={[
          { label: 'Product', key: 'Product' },
          { label: 'SKU', key: 'SKU', w: 110 },
          { label: 'Total QTY', key: 'Total QTY', type: 'number', w: 100 },
          { label: 'Batch Info', key: 'Batch Info', w: 140 },
          { label: 'Channel', w: 150 },
          { label: 'Status', key: 'Status', w: 110 },
          { label: 'Last Updated', key: 'Last Updated', type: 'date', w: 120 },
        ]}
        data={filtered}
        renderRow={s => (
          <tr key={s.id}>
            <td><strong>{fmt(s.Product)}</strong></td>
            <td className="os-mono">{fmt(s.SKU)}</td>
            <td className="os-mono"><strong>{fmt(s['Total QTY'])}</strong></td>
            <td className="os-muted">{fmt(s['Batch Info'])}</td>
            <td>
              {(Array.isArray(s.Channel) ? s.Channel : [s.Channel]).filter(Boolean).map(c => (
                <span key={c} className="os-tag" style={{ marginRight: 4 }}>{c}</span>
              ))}
            </td>
            <td>{s.Status ? <span className={`os-pill ${sc(s.Status)}`}>{s.Status}</span> : '—'}</td>
            <td className="os-mono">{fmt(s['Last Updated'])}</td>
          </tr>
        )}
        emptyMsg="No stock on hand data."
      />
    </>
  );
}

/* ── Warehouse: Inbound Stock ─────────────────── */
function InboundTab({ inbound }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatus] = useState('');
  const statuses = [...new Set(inbound.map(s => s.Status).filter(Boolean))];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return inbound.filter(s => {
      const mQ = !q || (s.Product || '').toLowerCase().includes(q) || (s.SKU || '').toLowerCase().includes(q) || (s['PO Reference'] || '').toLowerCase().includes(q);
      const mS = !statusFilter || s.Status === statusFilter;
      return mQ && mS;
    });
  }, [inbound, search, statusFilter]);

  const totalInbound = filtered.reduce((sum, s) => sum + (Number(s['Inbound QTY']) || 0), 0);

  return (
    <>
      <div className="wh-banner">
        <div className="wh-banner-inner">
          <span className="wh-banner-label">Bio-nature UK Warehouse</span>
          <span className="wh-banner-sub">Inbound stock — en route from supplier</span>
        </div>
        <div className="wh-banner-stats">
          <div className="wh-banner-stat"><span className="wh-banner-num">{filtered.length}</span><span className="wh-banner-unit">Lines</span></div>
          <div className="wh-banner-stat"><span className="wh-banner-num">{totalInbound.toLocaleString()}</span><span className="wh-banner-unit">Units</span></div>
        </div>
      </div>

      <div className="os-toolbar" style={{ marginTop: 16 }}>
        <input className="os-search" placeholder="Search product, SKU, PO ref…" value={search} onChange={e => setSearch(e.target.value)} />
        {statuses.length > 0 && (
          <select className="os-select" value={statusFilter} onChange={e => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <span className="os-count">{filtered.length} lines</span>
      </div>

      <SortableTable
        cols={[
          { label: 'Product', key: 'Product' },
          { label: 'SKU', key: 'SKU', w: 110 },
          { label: 'Inbound QTY', key: 'Inbound QTY', type: 'number', w: 110 },
          { label: 'PO Reference', key: 'PO Reference', w: 140 },
          { label: 'Location', key: 'Location', w: 130 },
          { label: 'Channel', w: 130 },
          { label: 'Status', key: 'Status', w: 110 },
          { label: 'Expected Arrival', key: 'Expected Arrival', type: 'date', w: 140 },
        ]}
        data={filtered}
        renderRow={s => (
          <tr key={s.id}>
            <td><strong>{fmt(s.Product)}</strong></td>
            <td className="os-mono">{fmt(s.SKU)}</td>
            <td className="os-mono"><strong>{fmt(s['Inbound QTY'])}</strong></td>
            <td className="os-mono">{fmt(s['PO Reference'])}</td>
            <td className="os-muted">{fmt(s.Location)}</td>
            <td>
              {(Array.isArray(s.Channel) ? s.Channel : [s.Channel]).filter(Boolean).map(c => (
                <span key={c} className="os-tag" style={{ marginRight: 4 }}>{c}</span>
              ))}
            </td>
            <td>{s.Status ? <span className={`os-pill ${sc(s.Status)}`}>{s.Status}</span> : '—'}</td>
            <td className="os-mono">{fmt(s['Expected Arrival'])}</td>
          </tr>
        )}
        emptyMsg="No inbound stock."
      />
    </>
  );
}

/* ── B2B ──────────────────────────────────────── */
function B2BTab({ items }) {
  if (!items.length) return <div className="os-empty">No B2B accounts.</div>;
  const active = items.filter(i => i['Account Status'] === 'Active').length;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{active}</div><div className="os-stat-label">Active Accounts</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total</div></div>
      </div>
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Business', key: 'Business Name' },
            { label: 'Type', key: 'Business Type', w: 130 },
            { label: 'Contact', key: 'Contact Name', w: 130 },
            { label: 'Status', key: 'Account Status', w: 110 },
            { label: 'Monthly Value', key: 'Monthly Order Value (£)', type: 'number', w: 140 },
          ]}
          data={items}
          renderRow={b => (
            <tr key={b.id}>
              <td><strong>{fmt(b['Business Name'])}</strong>{b.Email && <p className="os-table-note">{b.Email}</p>}</td>
              <td className="os-muted">{fmt(b['Business Type'])}</td>
              <td className="os-muted">{fmt(b['Contact Name'])}</td>
              <td>{b['Account Status'] ? <span className={`os-pill ${sc(b['Account Status'])}`}>{b['Account Status']}</span> : '—'}</td>
              <td className="os-mono">{gbp(b['Monthly Order Value (£)'])}</td>
            </tr>
          )}
          emptyMsg="No B2B accounts."
        />
      </div>
    </>
  );
}

/* ── Customers ────────────────────────────────── */
function CustomersTab({ items }) {
  return (
    <SortableTable
      cols={[
        { label: 'Customer', key: 'Customer Name' },
        { label: 'Source', key: 'Source', w: 120 },
        { label: 'Type', key: 'Customer Type', w: 120 },
        { label: 'Status', key: 'Status', w: 110 },
        { label: 'LTV', key: 'LTV (£)', type: 'number', w: 90 },
        { label: 'Orders', key: 'Total Orders', type: 'number', w: 80 },
      ]}
      data={items}
      renderRow={c => (
        <tr key={c.id}>
          <td><strong>{fmt(c['Customer Name'])}</strong>{c.Email && <p className="os-table-note">{c.Email}</p>}</td>
          <td className="os-muted">{fmt(c.Source)}</td>
          <td className="os-muted">{fmt(c['Customer Type'])}</td>
          <td>{c.Status ? <span className={`os-pill ${sc(c.Status)}`}>{c.Status}</span> : '—'}</td>
          <td className="os-mono">{gbp(c['LTV (£)'])}</td>
          <td className="os-mono">{fmt(c['Total Orders'])}</td>
        </tr>
      )}
      emptyMsg="No customer records."
    />
  );
}

/* ── Affiliates ───────────────────────────────── */
function AffiliatesTab({ items }) {
  if (!items.length) return <div className="os-empty">No affiliates.</div>;
  const signed = items.filter(i => i['Agreement Signed'] === true || i['Agreement Signed'] === 'true').length;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{signed}</div><div className="os-stat-label">Agreements Signed</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total</div></div>
      </div>
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Name', key: 'Name' },
            { label: 'Type', key: 'Type', w: 120 },
            { label: 'Platform', key: 'Platform', w: 120 },
            { label: 'Market', key: 'Market', w: 130 },
            { label: 'Commission Tier', key: 'Commission Tier', w: 140 },
            { label: 'Status', key: 'Onboarding Status', w: 140 },
          ]}
          data={items}
          renderRow={a => (
            <tr key={a.id}>
              <td><strong>{fmt(a.Name)}</strong>{a.Email && <p className="os-table-note">{a.Email}</p>}</td>
              <td className="os-muted">{fmt(a.Type)}</td>
              <td className="os-muted">{fmt(a.Platform)}</td>
              <td className="os-muted">{Array.isArray(a.Market) ? a.Market.join(', ') : fmt(a.Market)}</td>
              <td>{a['Commission Tier'] ? <span className="os-pill pill-default">{a['Commission Tier']}</span> : '—'}</td>
              <td>{a['Onboarding Status'] ? <span className={`os-pill ${sc(a['Onboarding Status'])}`}>{a['Onboarding Status']}</span> : '—'}</td>
            </tr>
          )}
          emptyMsg="No affiliates."
        />
      </div>
    </>
  );
}

/* ── Email / Klaviyo ──────────────────────────── */
function EmailTab({ items }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return !q ? items : items.filter(i =>
      (i.Email || '').toLowerCase().includes(q) ||
      (i['First Name'] || '').toLowerCase().includes(q) ||
      (i['Last Name'] || '').toLowerCase().includes(q)
    );
  }, [items, search]);
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Email Subscribers</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.filter(i => i['Email Marketing Consent'] === 'True' || i['Email Marketing Consent'] === 'SUBSCRIBED').length}</div><div className="os-stat-label">Consented</div></div>
      </div>
      <div className="os-toolbar" style={{ marginTop: 16 }}>
        <input className="os-search" placeholder="Search email, name…" value={search} onChange={e => setSearch(e.target.value)} />
        <span className="os-count">{filtered.length} subscribers</span>
      </div>
      <div style={{ marginTop: 12 }}>
        <SortableTable
          cols={[
            { label: 'Email', key: 'Email' },
            { label: 'Name', w: 160 },
            { label: 'Source', key: 'Initial Source', w: 130 },
            { label: 'Country', key: 'Locale: Country', w: 100 },
            { label: 'Consent', key: 'Email Marketing Consent', w: 120 },
          ]}
          data={filtered.slice(0, 200)}
          renderRow={s => (
            <tr key={s.id}>
              <td className="os-mono" style={{ fontSize: 12 }}>{fmt(s.Email)}</td>
              <td className="os-muted">{[s['First Name'], s['Last Name']].filter(Boolean).join(' ') || '—'}</td>
              <td className="os-muted">{fmt(s['Initial Source'] || s.Source)}</td>
              <td className="os-muted">{fmt(s['Locale: Country'] || s.Country)}</td>
              <td>{s['Email Marketing Consent'] ? <span className="os-pill pill-done">{s['Email Marketing Consent']}</span> : '—'}</td>
            </tr>
          )}
        />
        {filtered.length > 200 && <p className="os-muted" style={{ marginTop: 8, fontSize: 12 }}>Showing 200 of {filtered.length} — use search to narrow down.</p>}
      </div>
    </>
  );
}

/* ── Marketing ────────────────────────────────── */
function MarketingTab({ items }) {
  return (
    <SortableTable
      cols={[
        { label: 'Campaign', key: 'Campaign / Launch Name' },
        { label: 'Type', key: 'Type', w: 110 },
        { label: 'Status', key: 'Status', w: 110 },
        { label: 'Owner', key: 'Owner', w: 110 },
        { label: 'Start', key: 'Start Date', type: 'date', w: 100 },
        { label: 'End', key: 'End Date', type: 'date', w: 100 },
        { label: 'Budget', key: 'Budget (£)', type: 'number', w: 100 },
        { label: 'Revenue', key: 'Revenue Generated (£)', type: 'number', w: 110 },
      ]}
      data={items}
      renderRow={m => (
        <tr key={m.id}>
          <td><strong>{fmt(m['Campaign / Launch Name'])}</strong></td>
          <td className="os-muted">{fmt(m.Type)}</td>
          <td>{m.Status ? <span className={`os-pill ${sc(m.Status)}`}>{m.Status}</span> : '—'}</td>
          <td className="os-muted">{fmt(m.Owner)}</td>
          <td className="os-mono">{fmt(m['Start Date'])}</td>
          <td className="os-mono">{fmt(m['End Date'])}</td>
          <td className="os-mono">{gbp(m['Budget (£)'])}</td>
          <td className="os-mono">{gbp(m['Revenue Generated (£)'])}</td>
        </tr>
      )}
      emptyMsg="No marketing campaigns."
    />
  );
}

/* ── Subscriptions ────────────────────────────── */
function SubscriptionsTab({ items }) {
  if (!items.length) return <div className="os-empty">No subscription plans yet.</div>;
  const totalSubs = items.reduce((s, i) => s + (Number(i['Active Subscribers']) || 0), 0);
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{totalSubs}</div><div className="os-stat-label">Active Subscribers</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Plans</div></div>
      </div>
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Plan', key: 'Plan Name' },
            { label: 'Product / SKU', key: 'Product', w: 160 },
            { label: 'Subscribers', key: 'Active Subscribers', type: 'number', w: 120 },
            { label: 'Monthly Rev', key: 'Monthly Revenue £', type: 'number', w: 130 },
            { label: 'Status', key: 'Status', w: 110 },
          ]}
          data={items}
          renderRow={s => (
            <tr key={s.id}>
              <td><strong>{fmt(s['Plan Name'])}</strong></td>
              <td className="os-muted">{fmt(s.Product)}{s.SKU ? ` · ${s.SKU}` : ''}</td>
              <td className="os-mono">{fmt(s['Active Subscribers'])}</td>
              <td className="os-mono">{gbp(s['Monthly Revenue £'])}</td>
              <td>{s.Status ? <span className={`os-pill ${sc(s.Status)}`}>{s.Status}</span> : '—'}</td>
            </tr>
          )}
          emptyMsg="No subscription plans yet."
        />
      </div>
    </>
  );
}

/* ── Customer Service ─────────────────────────── */
function CSTab({ items }) {
  const open = items.filter(i => !['Resolved', 'Closed', 'Done'].includes(i.Status));
  if (!items.length) return <div className="os-empty">No CS tickets.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-red"><div className="os-stat-num">{open.length}</div><div className="os-stat-label">Open</div></div>
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{items.length - open.length}</div><div className="os-stat-label">Resolved</div></div>
      </div>
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Reference', key: 'Issue Reference' },
            { label: 'Customer', key: 'Customer Name', w: 130 },
            { label: 'Category', key: 'Category', w: 130 },
            { label: 'Status', key: 'Status', w: 110 },
            { label: 'Owner', key: 'Owner', w: 110 },
            { label: 'Raised', key: 'Date Raised', type: 'date', w: 100 },
          ]}
          data={items}
          renderRow={t => (
            <tr key={t.id}>
              <td><strong>{fmt(t['Issue Reference'])}</strong></td>
              <td className="os-muted">{fmt(t['Customer Name'])}</td>
              <td className="os-muted">{fmt(t.Category)}</td>
              <td>{t.Status ? <span className={`os-pill ${sc(t.Status)}`}>{t.Status}</span> : '—'}</td>
              <td className="os-muted">{fmt(t.Owner)}</td>
              <td className="os-mono">{fmt(t['Date Raised'])}</td>
            </tr>
          )}
          emptyMsg="No CS tickets."
        />
      </div>
    </>
  );
}

/* ── Finance ──────────────────────────────────── */
function FinanceTab({ reconcile, software, payouts }) {
  const [sub, setSub] = useState('Reconciliation');
  return (
    <>
      <div className="os-sub-tabs">
        {['Reconciliation', 'Payouts', 'Software'].map(s => (
          <button key={s} className={`os-sub-tab${sub === s ? ' active' : ''}`} onClick={() => setSub(s)}>{s}</button>
        ))}
      </div>

      {sub === 'Reconciliation' && (
        <SortableTable
          cols={[
            { label: 'Period', key: 'Period' },
            { label: 'Channel', key: 'Channel', w: 120 },
            { label: 'Gross', key: 'Gross Revenue (£)', type: 'number', w: 100 },
            { label: 'Discounts', key: 'Discounts (£)', type: 'number', w: 90 },
            { label: 'Refunds', key: 'Refunds (£)', type: 'number', w: 90 },
            { label: 'Fees', key: 'Platform Fees (£)', type: 'number', w: 90 },
            { label: 'Net', key: 'Net Revenue (£)', type: 'number', w: 100 },
            { label: 'Variance', key: 'Variance (£)', type: 'number', w: 90 },
            { label: 'Status', key: 'Status', w: 110 },
          ]}
          data={reconcile}
          renderRow={r => (
            <tr key={r.id}>
              <td><strong>{fmt(r.Period)}</strong></td>
              <td className="os-muted">{fmt(r.Channel)}</td>
              <td className="os-mono">{gbp(r['Gross Revenue (£)'])}</td>
              <td className="os-mono">{gbp(r['Discounts (£)'])}</td>
              <td className="os-mono">{gbp(r['Refunds (£)'])}</td>
              <td className="os-mono">{gbp(r['Platform Fees (£)'])}</td>
              <td className="os-mono"><strong>{gbp(r['Net Revenue (£)'])}</strong></td>
              <td className="os-mono">{gbp(r['Variance (£)'])}</td>
              <td>{r.Status ? <span className={`os-pill ${sc(r.Status)}`}>{r.Status}</span> : '—'}</td>
            </tr>
          )}
          emptyMsg="No reconciliation records."
        />
      )}

      {sub === 'Payouts' && (
        <SortableTable
          cols={[
            { label: 'Reference', key: 'Payout Reference' },
            { label: 'Date', key: 'Payout Date', type: 'date', w: 110 },
            { label: 'Gross', key: 'Gross Amount (£)', type: 'number', w: 100 },
            { label: 'Fees', key: 'Fees Deducted (£)', type: 'number', w: 90 },
            { label: 'Net Payout', key: 'Net Payout (£)', type: 'number', w: 110 },
            { label: 'Status', key: 'Status', w: 110 },
          ]}
          data={payouts}
          renderRow={p => (
            <tr key={p.id}>
              <td><strong>{fmt(p['Payout Reference'])}</strong></td>
              <td className="os-mono">{fmt(p['Payout Date'])}</td>
              <td className="os-mono">{gbp(p['Gross Amount (£)'])}</td>
              <td className="os-mono">{gbp(p['Fees Deducted (£)'])}</td>
              <td className="os-mono"><strong>{gbp(p['Net Payout (£)'])}</strong></td>
              <td>{p.Status ? <span className={`os-pill ${sc(p.Status)}`}>{p.Status}</span> : '—'}</td>
            </tr>
          )}
          emptyMsg="No payouts."
        />
      )}

      {sub === 'Software' && (
        <SortableTable
          cols={[
            { label: 'Platform', key: 'Platform' },
            { label: 'Cost/mo', key: 'Cost (£)', type: 'number', w: 90 },
            { label: 'Annual', key: 'Annual Cost (£)', type: 'number', w: 100 },
            { label: 'Billing', key: 'Billing Frequency', w: 110 },
            { label: 'Renewal', key: 'Renewal Date', type: 'date', w: 110 },
            { label: 'Department', key: 'Department', w: 120 },
            { label: 'Status', key: 'Status', w: 110 },
          ]}
          data={software}
          renderRow={s => (
            <tr key={s.id}>
              <td><strong>{fmt(s.Platform)}</strong></td>
              <td className="os-mono">{gbp(s['Cost (£)'])}</td>
              <td className="os-mono">{gbp(s['Annual Cost (£)'])}</td>
              <td className="os-muted">{fmt(s['Billing Frequency'])}</td>
              <td className="os-mono">{fmt(s['Renewal Date'])}</td>
              <td className="os-muted">{fmt(s.Department)}</td>
              <td>{s.Status ? <span className={`os-pill ${sc(s.Status)}`}>{s.Status}</span> : '—'}</td>
            </tr>
          )}
          emptyMsg="No software costs logged."
        />
      )}
    </>
  );
}

/* ── Reporting ────────────────────────────────── */
function ReportingTab({ items }) {
  return (
    <SortableTable
      cols={[
        { label: 'Period', key: 'Period' },
        { label: 'Shopify Rev', key: 'Shopify Revenue (£)', type: 'number', w: 120 },
        { label: 'Shopify Orders', key: 'Shopify Orders', type: 'number', w: 110 },
        { label: 'Amazon Rev', key: 'Amazon Revenue (£)', type: 'number', w: 110 },
        { label: 'Total Rev', key: 'Total Revenue (£)', type: 'number', w: 110 },
        { label: 'Affiliate Rev', key: 'Affiliate Revenue (£)', type: 'number', w: 120 },
        { label: 'New Customers', key: 'New Customers', type: 'number', w: 120 },
        { label: 'MoM %', key: 'MoM Growth %', type: 'number', w: 80 },
        { label: 'Status', key: 'Status', w: 110 },
      ]}
      data={items}
      renderRow={r => (
        <tr key={r.id}>
          <td><strong>{fmt(r.Period)}</strong></td>
          <td className="os-mono">{gbp(r['Shopify Revenue (£)'])}</td>
          <td className="os-mono">{fmt(r['Shopify Orders'])}</td>
          <td className="os-mono">{gbp(r['Amazon Revenue (£)'])}</td>
          <td className="os-mono">{gbp(r['Total Revenue (£)'])}</td>
          <td className="os-mono">{gbp(r['Affiliate Revenue (£)'])}</td>
          <td className="os-mono">{fmt(r['New Customers'])}</td>
          <td className="os-mono">{r['MoM Growth %'] ? `${r['MoM Growth %']}%` : '—'}</td>
          <td>{r.Status ? <span className={`os-pill ${sc(r.Status)}`}>{r.Status}</span> : '—'}</td>
        </tr>
      )}
      emptyMsg="No reporting data yet."
    />
  );
}

/* ── Page ─────────────────────────────────────── */
export default function UKPage({ tasks, priorities, risks, amazon, catalogue, shopifyProducts, orders, ordersSource, discounts, refunds, payouts, soh, inbound, b2b, customers, affiliates, emailList, marketing, subscriptions, cs, reconcile, software, reporting, products, error, serverTime }) {
  const router = useRouter();
  const [section, setSection] = useState('Overview');
  const [tab, setTab] = useState('Tasks');

  useEffect(() => {
    if (router.query.tab && TABS.includes(router.query.tab)) {
      const t = router.query.tab;
      setTab(t);
      setSection(sectionForTab(t));
    }
  }, [router.query.tab]);

  function switchSection(s) {
    setSection(s);
    setTab(SECTION_TABS[s][0]);
  }

  const openRisks = risks.filter(r => !['Resolved', 'Closed', 'Done'].includes(r.Status)).length;
  const totalSubs = subscriptions.reduce((s, i) => s + (Number(i['Active Subscribers']) || 0), 0);
  const reorderCount = amazon.filter(p => p.Reorder === 'Yes' || p.Reorder === true).length;
  const totalSOH = soh.reduce((s, i) => s + (Number(i['Total QTY']) || 0), 0);

  // Segment tasks by Business Area — each section shows only its own tasks, no duplicates
  const shopifyTasks = useMemo(() =>
    tasks.filter(t => (t['Business Area'] || '').toLowerCase().includes('shopify')),
    [tasks]
  );
  const overviewTasks = useMemo(() =>
    tasks.filter(t => {
      const ba = (t['Business Area'] || '').toLowerCase();
      return !ba.includes('amazon') && !ba.includes('shopify');
    }),
    [tasks]
  );

  return (
    <OsLayout title="UK Dashboard" region="United Kingdom" airtableUrl="https://airtable.com/appb0pnXsdtALWq80" serverTime={serverTime}>
      <section className="region-hero region-hero-uk">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Regional Module</p>
          <h1 className="os-region-title">🇬🇧 United Kingdom</h1>
          <div className="region-hero-stats">
            <div className="rhs"><span className="rhs-num">{orders.length}</span><span className="rhs-label">Orders{ordersSource === 'live' ? ' 🟢' : ''}</span></div>
            <div className="rhs"><span className="rhs-num">{shopifyProducts.length}</span><span className="rhs-label">Shopify SKUs</span></div>
            <div className="rhs"><span className="rhs-num">{amazon.length}</span><span className="rhs-label">Amazon SKUs</span></div>
            {reorderCount > 0 && <div className="rhs"><span className="rhs-num rhs-alert">{reorderCount}</span><span className="rhs-label">Reorder</span></div>}
            <div className="rhs"><span className="rhs-num">{totalSOH}</span><span className="rhs-label">Units SOH</span></div>
            <div className="rhs"><span className="rhs-num">{openRisks}</span><span className="rhs-label">Open Risks</span></div>
            <div className="rhs"><span className="rhs-num">{totalSubs}</span><span className="rhs-label">Subscribers</span></div>
            <div className="rhs"><span className="rhs-num">{emailList.length}</span><span className="rhs-label">Email List</span></div>
          </div>
        </div>
      </section>

      <div className="os-page-wrap">
        {error && <div className="os-alert-error">{error}</div>}

        {/* ── Section switcher ── */}
        <div className="uk-section-nav">
          {SECTIONS.map(s => (
            <button key={s} className={`uk-section-btn${section === s ? ' active' : ''}`} onClick={() => switchSection(s)}>
              {SECTION_ICON[s]} {s}
            </button>
          ))}
        </div>

        {/* ── Tab nav ── */}
        <div className="os-subnav">
          {SECTION_TABS[section].map(t => (
            <button key={t} className={`os-subnav-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="os-tab-content">
          {tab === 'Tasks'            && section === 'Overview'   && <TaskTable tasks={overviewTasks} />}
          {tab === 'Tasks'            && section === 'Shopify UK' && <TaskTable tasks={shopifyTasks} />}
          {tab === 'Priorities'       && <PriorityList items={priorities} />}
          {tab === 'Risks'            && <RiskList items={risks} />}
          {tab === 'Reporting'        && <ReportingTab items={reporting} />}
          {tab === 'Products'         && <ProductsSection products={products} markets={[['UK','Shopify UK'],['AMZN','Amazon UK']]} />}
          {tab === 'Orders'           && <OrdersTab orders={orders} ordersSource={ordersSource} discounts={discounts} refunds={refunds} />}
          {tab === 'Shopify'          && <ShopifyTab products={shopifyProducts} />}
          {tab === 'Customers'        && <CustomersTab items={customers} />}
          {tab === 'B2B'              && <B2BTab items={b2b} />}
          {tab === 'Affiliates'       && <AffiliatesTab items={affiliates} />}
          {tab === 'Email / Klaviyo'  && <EmailTab items={emailList} />}
          {tab === 'Marketing'        && <MarketingTab items={marketing} />}
          {tab === 'Subscriptions'    && <SubscriptionsTab items={subscriptions} />}
          {tab === 'Customer Service' && <CSTab items={cs} />}
          {tab === 'Finance'          && <FinanceTab reconcile={reconcile} software={software} payouts={payouts} />}
          {tab === 'Amazon UK'        && <AmazonTab fba={amazon} catalogue={catalogue} tasks={tasks} priorities={priorities} marketing={marketing} inbound={inbound} reporting={reporting} />}
          {tab === 'Stock on Hand'    && <SOHTab soh={soh} />}
          {tab === 'Inbound Stock'    && <InboundTab inbound={inbound} />}
        </div>
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  const safe = p => p.catch(e => { console.warn('[uk] fetch partial fail:', e.message); return []; });

  const [tasks, priorities, risks, amazon, catalogue, shopifyProducts, airtableOrders, discounts, refunds, payouts, soh, inbound, b2b, customers, affiliates, emailList, marketing, subscriptions, cs, reconcile, software, reporting, products] = await Promise.all([
    safe(getUKTasks()), safe(getUKPriorities()), safe(getUKRisks()),
    safe(getUKAmazon()), safe(getUKAmazonCat()),
    safe(getUKShopify()), safe(getUKOrders()), safe(getUKDiscounts()), safe(getUKRefunds()), safe(getUKPayouts()),
    safe(getUKStock()), safe(getUKInbound()),
    safe(getUKB2B()), safe(getUKCustomers()), safe(getUKAffiliates()), safe(getUKEmailList()),
    safe(getUKMarketing()), safe(getUKSubscriptions()), safe(getUKCS()),
    safe(getUKReconcile()), safe(getUKSoftware()), safe(getUKReporting()),
    safe(getProducts()),
  ]);

  // Live Shopify orders — falls back to Airtable if env vars are not set
  let orders = airtableOrders;
  let ordersSource = 'airtable';
  try {
    const liveOrders = await getShopifyOrdersLive({ maxOrders: 500 });
    if (liveOrders !== null) {
      orders = liveOrders;
      ordersSource = 'live';
    }
  } catch (shopifyErr) {
    console.warn('Shopify live orders failed, using Airtable fallback:', shopifyErr.message);
  }

  return { props: { tasks, priorities, risks, amazon, catalogue, shopifyProducts, orders, ordersSource, discounts, refunds, payouts, soh, inbound, b2b, customers, affiliates, emailList, marketing, subscriptions, cs, reconcile, software, reporting, products, error: null, serverTime: new Date().toISOString() } };
}
