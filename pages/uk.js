import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import OsLayout from '../components/OsLayout';
import ProductsSection from '../components/ProductsSection';
import SortableTable from '../components/SortableTable';
import TaskDetailPanel from '../components/TaskDetailPanel';
import RecordDetailPanel from '../components/RecordDetailPanel';
import { useStatusEditor, StatusSelect, DateCell, sc, DONE_VALS as DONE_VALS_SHARED, BASE_STATUSES as BASE_STATUSES_SHARED } from '../components/StatusSelect';
import {
  getUKTasks, getUKPriorities, getUKRisks,
  getUKAmazon, getUKAmazonCat,
  getUKShopify, getUKOrders, getUKDiscounts, getUKRefunds, getUKPayouts,
  getUKStock, getUKInbound,
  getUKReporting, getUKReconcile, getUKSoftware, getUKAmazonDisbursements,
  getUKB2B, getUKCS, getUKCustomers,
  getUKAffiliates, getUKMarketing, getUKSubscriptions, getUKSubscribers,
  getUKEmailList, getUKPPC,
  getAffiliates, getAffiliateSales, getAffiliatePayouts, getAffiliateTraffic, getAffiliateTasks, getAffiliateProducts,
  getUKAmazonReviews, getUKBionature, getUKBilling, getUKSalesByProduct,
  getProducts,
} from '../lib/airtable';
import { getLocalDailySales, getLocalSalesByProduct, getLocalPayouts } from '../lib/shopify';

/* ── Section / Tab structure ──────────────────── */
const SECTIONS = ['Overview', 'Shopify UK', 'Amazon UK', 'Warehouse'];
const SECTION_TABS = {
  'Overview':   ['Tasks', 'Priorities', 'Risks', 'Reporting', 'Products'],
  'Shopify UK': ['Tasks', 'Priorities', 'Risks', 'Orders', 'Shopify', 'Customers', 'B2B', 'Affiliates', 'Email / Klaviyo', 'Marketing', 'Subscriptions', 'Customer Service', 'Finance', 'Google'],
  'Amazon UK':  ['Amazon UK', 'Finance', 'Google'],
  'Warehouse':  ['Stock on Hand', 'Inbound Stock', 'Bionature Batch'],
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
// sc() is imported from StatusSelect — brand-green, normalizes emoji + aliases site-wide
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

function downloadCSV(rows, filename) {
  if (!rows || !rows.length) return;
  const keys = Object.keys(rows[0]).filter(k => !k.startsWith('_'));
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = filename + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
  const [doneAt, setDoneAt] = useState({});
  const [selectedTask, setSelectedTask] = useState(null);

  // useStatusEditor handles optimistic updates + sessionStorage persistence across tab switches
  const editor = useStatusEditor(tasks);

  const allStatuses = useMemo(() =>
    [...new Set([...BASE_STATUSES, ...tasks.map(t => t.Status).filter(Boolean)])],
    [tasks]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return editor.dataWithStatus.filter(t => {
      const mQ = !q || (t.Task || '').toLowerCase().includes(q) || (t.Owner || '').toLowerCase().includes(q);
      const mS = !sf || t.Status === sf;
      return mQ && mS;
    });
  }, [editor.dataWithStatus, search, sf]);

  async function handleStatusChange(recordId, newStatus) {
    if (DONE_VALS.has(newStatus)) {
      setDoneAt(prev => ({ ...prev, [recordId]: new Date().toISOString() }));
    }
    setSelectedTask(prev => prev?.id === recordId ? { ...prev, Status: newStatus } : prev);
    const record = editor.dataWithStatus.find(t => t.id === recordId);
    if (record) await editor.handleStatusChange(recordId, newStatus, record);
  }

  return (
    <>
      {editor.updateError && (
        <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>
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
          { label: 'Created', key: 'Date of Entry', type: 'date', w: 90 },
        ]}
        data={filtered}
        sinkCompleted="Status"
        renderRow={t => {
          const isDone = DONE_VALS.has(t.Status);
          return (
            <tr key={t.id} className={isDone ? 'row-done' : ''} onClick={() => setSelectedTask(t)} style={{ cursor: 'pointer' }}>
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
                  disabled={!!editor.saving[t.id]}
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
        saving={selectedTask ? editor.saving[selectedTask.id] : false}
      />
    </>
  );
}

/* ── Priorities ───────────────────────────────── */
function PriorityList({ items }) {
  const editor = useStatusEditor(items);
  const allStatuses = useMemo(() => [...new Set([...BASE_STATUSES, ...items.map(p => p.Status).filter(Boolean)])], [items]);
  if (!items.length) return <div className="os-empty">No priorities this week.</div>;
  return (
    <div className="priority-list">
      {editor.dataWithStatus.map((p, i) => (
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
          <div onClick={e => e.stopPropagation()}>
            <StatusSelect record={p} allStatuses={allStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Risks ────────────────────────────────────── */
function RiskList({ items }) {
  const editor = useStatusEditor(items);
  const riskStatuses = useMemo(() => [...new Set(['Open', 'Mitigating', 'Resolved', 'Closed', ...BASE_STATUSES, ...items.map(r => r.Status).filter(Boolean)])], [items]);
  const open = editor.dataWithStatus.filter(r => !['Resolved', 'Closed', 'Done', 'Mitigated'].includes(r.Status));
  if (!items.length) return <div className="os-empty">No risks logged.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-red"><div className="os-stat-num">{open.length}</div><div className="os-stat-label">Open Risks</div></div>
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{editor.dataWithStatus.length - open.length}</div><div className="os-stat-label">Resolved</div></div>
      </div>
      {editor.updateError && <div className="os-alert-error" style={{ marginTop: 8 }}>{editor.updateError}</div>}
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Risk / Blocker', key: 'Risk / Blocker' },
            { label: 'Status', key: 'Status', w: 120 },
            { label: 'Impact', key: 'Impact', w: 90 },
            { label: 'Mitigation Plan', key: 'Mitigation Plan' },
            { label: 'Owner', key: 'Owner', w: 110 },
          ]}
          data={editor.dataWithStatus}
          renderRow={r => (
            <tr key={r.id}>
              <td><strong>{fmt(r['Risk / Blocker'])}</strong></td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={r} allStatuses={riskStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
              </td>
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
function OrdersTab({ orders, ordersSource, discounts, refunds, salesByProduct = [], dailySales = [] }) {
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

  // Determine which range buttons have no data so they can be visually disabled
  const disabledRanges = useMemo(() => {
    if (!orders.length) return new Set(RANGES);
    const disabled = new Set();
    const t = new Date();
    const lmStart = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    const lmEnd   = new Date(t.getFullYear(), t.getMonth(), 0);
    if (!orders.some(o => { const d = new Date(o['Order Date']); return d >= lmStart && d <= lmEnd; })) disabled.add('Last Month');
    return disabled;
  }, [orders]);

  return (
    <>
      {/* ── Date filter bar ── */}
      <div className="orders-filter-bar">
        <div className="orders-range-group" style={{ overflowX: 'auto', display: 'flex', flexWrap: 'nowrap', gap: 4 }}>
          {RANGES.map(r => (
            <button
              key={r}
              className={`orders-range-btn${range === r ? ' active' : ''}`}
              style={disabledRanges.has(r) ? { opacity: 0.38, cursor: 'not-allowed' } : undefined}
              title={disabledRanges.has(r) ? 'No data for this period' : undefined}
              onClick={() => setRange(r)}
            >{r}</button>
          ))}
          {ordersSource === 'live'      && <span className="orders-live-badge">🟢 LIVE · Shopify</span>}
          {ordersSource === 'csv'       && <span className="orders-live-badge" style={{ background: 'var(--teal)', color: '#fff' }}>📊 CSV Export</span>}
          {ordersSource === 'airtable'  && <span className="orders-live-badge orders-live-airtable">📋 Airtable</span>}
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
      <div className="os-sub-tabs" style={{ marginTop: 24, overflowX: 'auto', display: 'flex', flexWrap: 'nowrap', gap: 4 }}>
        {['Summary', 'Orders', 'Daily Sales', 'By Product', 'Discounts', 'Refunds'].map(s => (
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
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button className="os-sub-tab" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => downloadCSV(filteredOrders, 'shopify-orders-export')}>↓ CSV</button>
          </div>
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
        </>
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

      {/* ── Daily Sales ── */}
      {sub === 'Daily Sales' && (() => {
        if (dailySales.length === 0) return <div className="wh-banner" style={{ marginTop: 12 }}><div className="wh-banner-inner"><span className="wh-banner-label">No daily sales data</span><span className="wh-banner-sub">Replace data/shopify-daily-sales.csv in the project and redeploy.</span></div></div>;
        const totGross    = dailySales.reduce((s, d) => s + d.gross, 0);
        const totNet      = dailySales.reduce((s, d) => s + d.net, 0);
        const totDisc     = dailySales.reduce((s, d) => s + d.discounts, 0);
        const totShipping = dailySales.reduce((s, d) => s + d.shipping, 0);
        const totTotal    = dailySales.reduce((s, d) => s + d.total, 0);
        const activeDays  = dailySales.filter(d => d.gross > 0).length;
        const dateRange   = dailySales.length > 0 ? `${dailySales[0].day} → ${dailySales[dailySales.length - 1].day}` : '';
        return (
          <>
            <div className="wh-banner" style={{ marginTop: 12 }}>
              <div className="wh-banner-inner">
                <span className="wh-banner-label">Daily Sales</span>
                <span className="wh-banner-sub">📊 CSV Export · {dateRange}</span>
              </div>
              <div className="wh-banner-stats">
                <div className="wh-banner-stat"><span className="wh-banner-num">£{totGross.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><span className="wh-banner-unit">Gross Sales</span></div>
                <div className="wh-banner-stat"><span className="wh-banner-num">£{totNet.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><span className="wh-banner-unit">Net Sales</span></div>
                <div className="wh-banner-stat"><span className="wh-banner-num">{activeDays}</span><span className="wh-banner-unit">Active Days</span></div>
                {totDisc > 0 && <div className="wh-banner-stat"><span className="wh-banner-num" style={{ color: 'var(--amber)' }}>£{totDisc.toFixed(2)}</span><span className="wh-banner-unit">Discounts</span></div>}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, marginBottom: 2 }}>
              <button className="os-sub-tab" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => downloadCSV(dailySales, 'shopify-daily-sales')}>↓ CSV</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
            <table className="os-table" style={{ marginTop: 4 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: 'right', width: 110 }}>Gross</th>
                  <th style={{ textAlign: 'right', width: 100 }}>Discounts</th>
                  <th style={{ textAlign: 'right', width: 100 }}>Net Sales</th>
                  <th style={{ textAlign: 'right', width: 100 }}>Shipping</th>
                  <th style={{ textAlign: 'right', width: 110 }}>Total Sales</th>
                </tr>
              </thead>
              <tbody>
                {dailySales.map(d => (
                  <tr key={d.day} style={{ opacity: d.gross === 0 ? 0.4 : 1 }}>
                    <td className="os-mono">{d.day}</td>
                    <td className="os-mono" style={{ textAlign: 'right' }}>{d.gross > 0 ? gbp(d.gross) : '—'}</td>
                    <td className="os-mono" style={{ textAlign: 'right' }}>{d.discounts > 0 ? <span style={{ color: 'var(--amber)' }}>-{gbp(d.discounts)}</span> : '—'}</td>
                    <td className="os-mono" style={{ textAlign: 'right' }}>{d.net > 0 ? gbp(d.net) : '—'}</td>
                    <td className="os-mono" style={{ textAlign: 'right' }}>{d.shipping > 0 ? gbp(d.shipping) : '—'}</td>
                    <td className="os-mono" style={{ textAlign: 'right' }}><strong>{d.total > 0 ? gbp(d.total) : '—'}</strong></td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <td className="os-mono">TOTAL</td>
                  <td className="os-mono" style={{ textAlign: 'right' }}>{gbp(totGross)}</td>
                  <td className="os-mono" style={{ textAlign: 'right' }}>{totDisc > 0 ? <span style={{ color: 'var(--amber)' }}>-{gbp(totDisc)}</span> : '—'}</td>
                  <td className="os-mono" style={{ textAlign: 'right' }}>{gbp(totNet)}</td>
                  <td className="os-mono" style={{ textAlign: 'right' }}>{gbp(totShipping)}</td>
                  <td className="os-mono" style={{ textAlign: 'right' }}>{gbp(totTotal)}</td>
                </tr>
              </tbody>
            </table>
            </div>
          </>
        );
      })()}

      {/* ── By Product ── */}
      {sub === 'By Product' && (
        salesByProduct.length === 0
          ? <div className="wh-banner" style={{ marginTop: 12 }}><div className="wh-banner-inner"><span className="wh-banner-label">No data</span><span className="wh-banner-sub">Replace data/shopify-sales-by-product.csv and redeploy.</span></div></div>
          : (
            <>
              <div className="wh-banner" style={{ marginTop: 12 }}>
                <div className="wh-banner-inner">
                  <span className="wh-banner-label">Sales by Product</span>
                  <span className="wh-banner-sub">📊 CSV Export · Last 30 days · Shopify UK</span>
                </div>
                <div className="wh-banner-stats">
                  <div className="wh-banner-stat"><span className="wh-banner-num">{salesByProduct.length}</span><span className="wh-banner-unit">SKUs</span></div>
                  <div className="wh-banner-stat"><span className="wh-banner-num">{salesByProduct.reduce((s, r) => s + r.qty, 0)}</span><span className="wh-banner-unit">Units</span></div>
                  <div className="wh-banner-stat"><span className="wh-banner-num">£{salesByProduct.reduce((s, r) => s + r.netSales, 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><span className="wh-banner-unit">Net Sales</span></div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <button className="os-sub-tab" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => downloadCSV(salesByProduct, 'shopify-sales-by-product')}>↓ CSV</button>
              </div>
              <SortableTable
                cols={[
                  { label: 'Product', key: 'product' },
                  { label: 'Qty', key: 'qty', type: 'number', w: 70 },
                  { label: 'Avg Price', key: 'price', type: 'number', w: 95 },
                  { label: 'Gross Sales', key: 'grossSales', type: 'number', w: 110 },
                  { label: 'Discounts', key: 'discounts', type: 'number', w: 100 },
                  { label: 'Returns', key: 'returns', type: 'number', w: 90 },
                  { label: 'Net Sales', key: 'netSales', type: 'number', w: 115 },
                ]}
                data={salesByProduct}
                renderRow={r => (
                  <tr key={r.product}>
                    <td><strong>{r.product}</strong></td>
                    <td className="os-mono">{r.qty}</td>
                    <td className="os-mono">{gbp(r.price)}</td>
                    <td className="os-mono">{gbp(r.grossSales)}</td>
                    <td className="os-mono">{r.discounts > 0 ? <span style={{ color: 'var(--amber)' }}>-{gbp(r.discounts)}</span> : '—'}</td>
                    <td className="os-mono">{r.returns > 0 ? <span style={{ color: 'var(--red)' }}>-{gbp(r.returns)}</span> : '—'}</td>
                    <td className="os-mono"><strong>{gbp(r.netSales)}</strong></td>
                  </tr>
                )}
                emptyMsg="No product sales data."
              />
            </>
          )
      )}
    </>
  );
}

/* ── Shopify Products ─────────────────────────── */
function ShopifyTab({ products }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const shopifyEditor = useStatusEditor(products);
  const shopifyStatuses = useMemo(() => [...new Set([...BASE_STATUSES, ...products.map(p => p.Status).filter(Boolean)])], [products]);
  const cats = [...new Set(products.map(p => p.Category).filter(Boolean))].sort();
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return shopifyEditor.dataWithStatus.filter(p => {
      const mQ = !q || (p.Product || '').toLowerCase().includes(q) || (p.SKU || '').toLowerCase().includes(q);
      const mC = !cat || p.Category === cat;
      return mQ && mC;
    });
  }, [shopifyEditor.dataWithStatus, search, cat]);

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
          { label: 'Status', key: 'Status', w: 120 },
        ]}
        data={shopifyEditor.dataWithStatus}
        renderRow={p => (
          <tr key={p.id}>
            <td><strong>{fmt(p.Product)}</strong></td>
            <td className="os-mono">{fmt(p.SKU)}</td>
            <td className="os-muted">{fmt(p.Category)}</td>
            <td className="os-mono">{p['Price (GBP)'] ? `£${p['Price (GBP)']}` : '—'}</td>
            <td className="os-mono">{fmt(p['Shopify Stock'])}</td>
            <td className="os-mono">{p['Gross Margin %'] ? `${p['Gross Margin %']}%` : '—'}</td>
            <td onClick={e => e.stopPropagation()}>
              <StatusSelect record={p} allStatuses={shopifyStatuses} handleStatusChange={shopifyEditor.handleStatusChange} saving={shopifyEditor.saving} />
            </td>
          </tr>
        )}
        emptyMsg="No products found."
      />
    </>
  );
}

/* ── Amazon P&L helpers ───────────────────────── */
function parseAmzNotes(notes) {
  if (!notes) return {};
  const num = key => {
    const m = notes.match(new RegExp(key + '\\s*[-:£\\s]*([\\d,]+\\.?\\d*)', 'i'));
    return m ? parseFloat(m[1].replace(',', '')) : 0;
  };
  const pct = key => {
    const m = notes.match(new RegExp(key + '\\s*([\\d.]+)%', 'i'));
    return m ? parseFloat(m[1]) : 0;
  };
  return {
    sales: num('Sales £'), units: num('Units'), margin: pct('Margin'),
    netProfit: num('Net profit £'), estPayout: num('Est payout £'),
    amzFees: num('Amazon fees'), cogs: num('COGS'),
    vat: num('VAT'), promo: num('Promo'), refunds: num('Refunds'),
  };
}

function periodToDate(period) {
  if (!period) return new Date('2026-01-01');
  // "2026-W24 (Jun 9–15)" — extract end day from parentheses
  const m = period.match(/\(([A-Za-z]+)\s+\d+[–\-](\d+)\)/);
  if (m) {
    const mo = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 }[m[1].slice(0, 3)];
    if (mo !== undefined) return new Date(2026, mo, parseInt(m[2]));
  }
  const fw = period.match(/2026-W(\d+)/);
  if (fw) { const d = new Date(2026, 0, 1 + (parseInt(fw[1]) - 1) * 7); return d; }
  return new Date('2026-01-01');
}

/* ── Amazon Reporting & Finance tab ──────────── */
function AmazonReportingTab({ reporting }) {
  const [range, setRange] = useState('All Time');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sub, setSub] = useState('Reporting');
  const RANGES = ['All Time', 'MTD', 'Last Month', '30 Days', 'Custom'];

  const filtered = useMemo(() => {
    if (!reporting || !reporting.length) return [];
    const today = new Date();
    const d = new Date();
    let from = null, to = today;
    if (range === 'MTD') { from = new Date(d.getFullYear(), d.getMonth(), 1); }
    else if (range === 'Last Month') { from = new Date(d.getFullYear(), d.getMonth()-1, 1); to = new Date(d.getFullYear(), d.getMonth(), 0); }
    else if (range === '30 Days') { from = new Date(d); from.setDate(d.getDate()-30); }
    else if (range === 'Custom') { from = customFrom ? new Date(customFrom) : null; to = customTo ? new Date(customTo + 'T23:59:59') : today; }
    if (!from) return reporting;
    return reporting.filter(r => { const rd = periodToDate(r.Period || ''); return rd >= from && rd <= to; });
  }, [reporting, range, customFrom, customTo]);

  const kpis = useMemo(() => {
    let totSales=0, totUnits=0, totNet=0, totPayout=0, totRefunds=0, totCogs=0, totFees=0, totVat=0, totPromo=0;
    filtered.forEach(r => {
      const n = parseAmzNotes(r.Notes || '');
      totSales += Number(r['Amazon Revenue (£)']) || n.sales || 0;
      totUnits += Number(r['Amazon Orders']) || n.units || 0;
      totNet += n.netProfit || 0;
      totPayout += n.estPayout || 0;
      totRefunds += n.refunds || 0;
      totCogs += n.cogs || 0;
      totFees += n.amzFees || 0;
      totVat += n.vat || 0;
      totPromo += n.promo || 0;
    });
    const avgMargin = totSales > 0 ? (totNet / totSales * 100) : 0;
    return { totSales, totUnits, totNet, totPayout, totRefunds, totCogs, totFees, totVat, totPromo, avgMargin };
  }, [filtered]);

  if (!reporting || !reporting.length) return (
    <div className="os-empty" style={{ marginTop: 20 }}>
      <p>No reporting data yet. Seed the Airtable Reporting table with weekly P&amp;L data.</p>
    </div>
  );

  return (
    <>
      <div className="orders-filter-bar">
        <div className="orders-range-group" style={{ overflowX: 'auto', display: 'flex', flexWrap: 'nowrap', gap: 4 }}>
          {RANGES.map(r => (
            <button key={r} className={`orders-range-btn${range === r ? ' active' : ''}`} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
        {range === 'Custom' && (
          <div className="orders-custom-dates">
            <input type="date" className="os-date-input" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span className="os-muted">→</span>
            <input type="date" className="os-date-input" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>
      <div className="os-sub-tabs" style={{ marginTop: 16, overflowX: 'auto', display: 'flex', flexWrap: 'nowrap', gap: 4 }}>
        {['Reporting', 'Finance'].map(s => (
          <button key={s} className={`os-sub-tab${sub === s ? ' active' : ''}`} onClick={() => setSub(s)}>{s}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="os-empty" style={{ marginTop: 16 }}>No data for this date range.</div>
      ) : (
        <>
          <div className="os-stat-row" style={{ marginTop: 16 }}>
            <div className="os-stat-card"><div className="os-stat-num">{gbp(kpis.totSales)}</div><div className="os-stat-label">Revenue</div></div>
            <div className="os-stat-card"><div className="os-stat-num">{kpis.totUnits}</div><div className="os-stat-label">Units</div></div>
            <div className="os-stat-card"><div className="os-stat-num">{gbp(kpis.totNet)}</div><div className="os-stat-label">Net Profit</div></div>
            <div className={`os-stat-card${kpis.avgMargin < 20 ? ' os-stat-red' : kpis.avgMargin < 30 ? ' os-stat-amber' : ' os-stat-green'}`}>
              <div className="os-stat-num">{kpis.avgMargin.toFixed(1)}%</div><div className="os-stat-label">Avg Margin</div>
            </div>
            <div className="os-stat-card"><div className="os-stat-num">{gbp(kpis.totPayout)}</div><div className="os-stat-label">Est. Payout</div></div>
            <div className={`os-stat-card${kpis.totRefunds > 3 ? ' os-stat-red' : ''}`}>
              <div className="os-stat-num">{kpis.totRefunds}</div><div className="os-stat-label">Refunds</div>
            </div>
          </div>

          {sub === 'Reporting' && (
            <SortableTable
              cols={[
                { label: 'Period', key: 'Period' },
                { label: 'Revenue', key: 'Amazon Revenue (£)', type: 'number', w: 110 },
                { label: 'Units', key: 'Amazon Orders', type: 'number', w: 80 },
                { label: 'Margin', w: 80 },
                { label: 'Net Profit', w: 100 },
                { label: 'Est. Payout', w: 110 },
                { label: 'Top SKU', key: 'Top SKU', w: 130 },
              ]}
              data={filtered}
              renderRow={r => {
                const n = parseAmzNotes(r.Notes || '');
                return (
                  <tr key={r.id}>
                    <td><strong>{fmt(r.Period)}</strong></td>
                    <td className="os-mono">{gbp(r['Amazon Revenue (£)'] || n.sales)}</td>
                    <td className="os-mono">{r['Amazon Orders'] || n.units || '—'}</td>
                    <td className="os-mono">{n.margin ? `${n.margin.toFixed(1)}%` : '—'}</td>
                    <td className="os-mono"><strong>{n.netProfit ? gbp(n.netProfit) : '—'}</strong></td>
                    <td className="os-mono">{n.estPayout ? gbp(n.estPayout) : '—'}</td>
                    <td className="os-mono" style={{ fontSize: 11 }}>{fmt(r['Top SKU'])}</td>
                  </tr>
                );
              }}
              emptyMsg="No data in range."
            />
          )}

          {sub === 'Finance' && (
            <>
              <h3 className="os-section-heading" style={{ marginTop: 24 }}>P&amp;L — {filtered.length} period{filtered.length !== 1 ? 's' : ''}</h3>
              <table className="os-table" style={{ maxWidth: 480, marginBottom: 24 }}>
                <tbody>
                  <tr><td><strong>Gross Sales</strong></td><td className="os-mono">{gbp(kpis.totSales)}</td></tr>
                  <tr><td style={{ paddingLeft: 20, color: 'rgba(45,42,38,.55)', fontSize: 13 }}>− COGS</td><td className="os-mono" style={{ color: '#ef4444' }}>({gbp(kpis.totCogs)})</td></tr>
                  <tr style={{ background: 'rgba(238,235,225,.5)' }}><td><strong>Gross Profit</strong></td><td className="os-mono"><strong>{gbp(kpis.totSales - kpis.totCogs)}</strong></td></tr>
                  <tr><td style={{ paddingLeft: 20, color: 'rgba(45,42,38,.55)', fontSize: 13 }}>− Amazon Fees</td><td className="os-mono" style={{ color: '#ef4444' }}>({gbp(kpis.totFees)})</td></tr>
                  <tr><td style={{ paddingLeft: 20, color: 'rgba(45,42,38,.55)', fontSize: 13 }}>− VAT</td><td className="os-mono" style={{ color: '#ef4444' }}>({gbp(kpis.totVat)})</td></tr>
                  <tr><td style={{ paddingLeft: 20, color: 'rgba(45,42,38,.55)', fontSize: 13 }}>− Promo / Vine</td><td className="os-mono" style={{ color: '#ef4444' }}>({gbp(kpis.totPromo)})</td></tr>
                  <tr><td colSpan="2" style={{ padding: 4 }}></td></tr>
                  <tr><td><strong>Net Profit</strong></td><td className="os-mono"><strong style={{ fontSize: 17 }}>{gbp(kpis.totNet)}</strong> <span style={{ fontSize: 11, color: 'rgba(45,42,38,.45)' }}>({kpis.avgMargin.toFixed(1)}%)</span></td></tr>
                </tbody>
              </table>
              <p className="os-muted" style={{ fontSize: 13, marginBottom: 24 }}>Est. Amazon payout: <strong>{gbp(kpis.totPayout)}</strong></p>
              <h3 className="os-section-heading">Weekly P&amp;L Detail</h3>
              <SortableTable
                cols={[
                  { label: 'Period', key: 'Period' },
                  { label: 'Sales', w: 100 },
                  { label: 'COGS', w: 90 },
                  { label: 'Amz Fees', w: 90 },
                  { label: 'VAT', w: 80 },
                  { label: 'Promo', w: 80 },
                  { label: 'Net Profit', w: 100 },
                  { label: 'Margin', w: 80 },
                ]}
                data={filtered}
                renderRow={r => {
                  const n = parseAmzNotes(r.Notes || '');
                  const sales = Number(r['Amazon Revenue (£)']) || n.sales || 0;
                  const mColor = n.margin > 30 ? '#16a34a' : n.margin > 20 ? '#d97706' : '#ef4444';
                  return (
                    <tr key={r.id}>
                      <td><strong>{fmt(r.Period)}</strong></td>
                      <td className="os-mono">{gbp(sales)}</td>
                      <td className="os-mono" style={{ color: '#ef4444' }}>{n.cogs ? `(${gbp(n.cogs)})` : '—'}</td>
                      <td className="os-mono" style={{ color: '#ef4444' }}>{n.amzFees ? `(${gbp(n.amzFees)})` : '—'}</td>
                      <td className="os-mono" style={{ color: '#ef4444' }}>{n.vat ? `(${gbp(n.vat)})` : '—'}</td>
                      <td className="os-mono" style={{ color: '#ef4444' }}>{n.promo ? `(${gbp(n.promo)})` : '—'}</td>
                      <td className="os-mono"><strong>{n.netProfit ? gbp(n.netProfit) : '—'}</strong></td>
                      <td className="os-mono"><span style={n.margin ? { color: mColor } : {}}>{n.margin ? `${n.margin.toFixed(1)}%` : '—'}</span></td>
                    </tr>
                  );
                }}
                emptyMsg="No data."
              />
            </>
          )}
        </>
      )}
    </>
  );
}

/* ── Google ───────────────────────────────────── */
function GoogleTab({ section = 'Shopify UK' }) {
  const [sub, setSub] = useState('Merchant Center');
  const MC_TOTAL = 42, MC_APPROVED = 36, MC_NOT = 6;
  return (
    <>
      <div className="os-stat-row" style={{ marginTop: 8 }}>
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{MC_APPROVED}</div><div className="os-stat-label">GMC Approved</div></div>
        <div className="os-stat-card os-stat-amber"><div className="os-stat-num">{MC_NOT}</div><div className="os-stat-label">Not Approved</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{MC_TOTAL}</div><div className="os-stat-label">Total Products</div></div>
      </div>
      <div className="os-sub-tabs" style={{ marginTop: 16, overflowX: 'auto', display: 'flex', flexWrap: 'nowrap', gap: 4 }}>
        {['Merchant Center', 'GA4 Traffic', 'AI Referrer', 'SEO'].map(s => (
          <button key={s} className={`os-sub-tab${sub === s ? ' active' : ''}`} onClick={() => setSub(s)}>{s}</button>
        ))}
      </div>

      {sub === 'Merchant Center' && (
        <div style={{ marginTop: 16 }}>
          <div className="wh-banner">
            <div className="wh-banner-inner">
              <span className="wh-banner-label">Google Merchant Center — UK</span>
              <span className="wh-banner-sub">uk.natroceutics.com · Last known snapshot</span>
            </div>
            <div className="wh-banner-stats">
              <div className="wh-banner-stat"><span className="wh-banner-num" style={{ color: '#16a34a' }}>{MC_APPROVED}</span><span className="wh-banner-unit">Approved</span></div>
              <div className="wh-banner-stat"><span className="wh-banner-num" style={{ color: '#d97706' }}>{MC_NOT}</span><span className="wh-banner-unit">Not Approved</span></div>
              <div className="wh-banner-stat"><span className="wh-banner-num">{MC_TOTAL}</span><span className="wh-banner-unit">Total</span></div>
            </div>
          </div>
          <table className="os-table" style={{ marginTop: 16, maxWidth: 440 }}>
            <tbody>
              <tr><td><strong>Total Products in Feed</strong></td><td className="os-mono">{MC_TOTAL}</td></tr>
              <tr><td>Approved</td><td className="os-mono"><span className="os-pill pill-done">{MC_APPROVED}</span></td></tr>
              <tr><td>Not Approved</td><td className="os-mono"><span className="os-pill pill-blocked">{MC_NOT}</span></td></tr>
              <tr><td>Approval Rate</td><td className="os-mono">{((MC_APPROVED / MC_TOTAL) * 100).toFixed(1)}%</td></tr>
            </tbody>
          </table>
          <p className="os-muted" style={{ marginTop: 12, fontSize: 12 }}>
            Source: Global Tasks scope record. Not-approved products require image or description review in GMC.
            Connect the GMC Content API for live sync.
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
            Connect Google Search Console to surface organic impressions, clicks, average position, and query data here.
          </p>
        </div>
      )}
    </>
  );
}

/* ── Amazon UK — full hub ─────────────────────── */
function AmazonTab({ fba, catalogue, tasks, priorities, marketing, inbound, reporting, ppc = [], reviews = [] }) {
  const [sub, setSub] = useState('Overview');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [selectedPPC, setSelectedPPC] = useState(null);
  const [selectedDateASIN, setSelectedDateASIN] = useState(null);
  const [amzRange, setAmzRange] = useState('MTD');
  const [amzCustomFrom, setAmzCustomFrom] = useState('');
  const [amzCustomTo, setAmzCustomTo] = useState('');
  const [amzSalesSub, setAmzSalesSub] = useState('Summary');

  // Sales data — loaded client-side only when Sales tab is first clicked (keeps SSR payload small)
  const [salesData, setSalesData] = useState({ dailyPnl: [], asinDaily: [], amazonOrders: [] });
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesLoaded, setSalesLoaded] = useState(false);

  useEffect(() => {
    if (sub === 'Sales' && !salesLoaded && !salesLoading) {
      setSalesLoading(true);
      fetch('/api/amazon-sales')
        .then(r => r.json())
        .then(d => { setSalesData({ dailyPnl: d.dailyPnl || [], asinDaily: d.asinDaily || [], amazonOrders: d.amazonOrders || [] }); setSalesLoaded(true); })
        .catch(() => setSalesLoaded(true))
        .finally(() => setSalesLoading(false));
    }
  }, [sub, salesLoaded, salesLoading]);

  const dailyPnl = salesData.dailyPnl;
  const asinDaily = salesData.asinDaily;
  const amazonOrders = salesData.amazonOrders;

  const AMZ_SUBS = ['Overview', 'Tasks', 'Priorities', 'FBA Stock', 'Sales', 'Daily P&L', 'ASIN Performance', 'Inbound', 'Catalogue', 'Marketing', 'PPC', 'Reviews', 'Reporting'];

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
  const ppcEditor    = useStatusEditor(ppc);
  const ppcStatuses  = useMemo(() => [...new Set(['Enabled', 'Paused', 'Archived', ...BASE_STATUSES_SHARED, ...(ppc || []).map(r => r.Status).filter(Boolean)])], [ppc]);

  // PPC aggregates
  const fbaByAsin = useMemo(() => Object.fromEntries((fba || []).map(p => [p.ASIN, p])), [fba]);
  const ppcTotals = useMemo(() => {
    const totSpend = ppc.reduce((s, r) => s + (Number(r['Spend (£)']) || 0), 0);
    const totSales = ppc.reduce((s, r) => s + (Number(r['Sales (£)']) || 0), 0);
    const totOrders = ppc.reduce((s, r) => s + (Number(r.Orders) || 0), 0);
    const totImpressions = ppc.reduce((s, r) => s + (Number(r.Impressions) || 0), 0);
    const blendedAcos = totSales > 0 ? (totSpend / totSales * 100) : 0;
    const enabledCount = ppc.filter(r => r.Status === 'Enabled').length;
    return { totSpend, totSales, totOrders, totImpressions, blendedAcos, enabledCount };
  }, [ppc]);

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

  // Active inbound = excludes Done/Completed rows (matching strikethrough logic)
  const activeInbound = useMemo(
    () => amazonInbound.filter(i => !DONE_VALS_SHARED.has(i.Status)),
    [amazonInbound]
  );
  const totalInbound = activeInbound.reduce((s, i) => s + (Number(i['Inbound QTY']) || 0), 0);

  // Aggregate update errors
  const anyError = tasksEditor.updateError || catEditor.updateError || fbaEditor.updateError ||
    mktEditor.updateError || inboundEditor.updateError || reportingEditor.updateError || ppcEditor.updateError;

  return (
    <>
      {/* Sub-tab nav */}
      <div className="os-sub-tabs" style={{ overflowX: 'auto', display: 'flex', flexWrap: 'nowrap', gap: 4 }}>
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
            <div className="os-stat-card"><div className="os-stat-num">{activeInbound.length}</div><div className="os-stat-label">Inbound Lines</div></div>
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
              {fba[0] && fba[0]['Last Synced'] && (
                <span style={{ fontSize: 11, color: 'var(--muted, #6b7280)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  Last synced: {new Date(fba[0]['Last Synced']).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              )}
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
                  { label: 'Last Updated', key: 'Last Updated', type: 'date', w: 120 },
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
                    <td className="os-mono" style={{ fontSize: 11, color: 'var(--muted, #6b7280)' }}>{p['Last Updated'] ? new Date(p['Last Updated']).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  </tr>
                  );
                }}
              />
            </div>
          </>
          );
        })()
      )}

      {/* ── Daily P&L (DashboardTotals) ── */}
      {sub === 'Daily P&L' && (
        !dailyPnl.length ? <div className="os-empty">No Daily P&L data yet — run the Sellerboard scheduler to populate.</div> : (() => {
          const sorted = [...dailyPnl].sort((a, b) => new Date(b.Date) - new Date(a.Date));
          const latest = sorted[0] || {};
          const last7 = sorted.slice(0, 7);
          const totalRev = last7.reduce((s, r) => s + (Number(r['Revenue £']) || 0), 0);
          const totalProfit = last7.reduce((s, r) => s + (Number(r['Net Profit £']) || 0), 0);
          const totalOrders = last7.reduce((s, r) => s + (Number(r.Orders) || 0), 0);
          return (
            <>
              <div className="wh-banner" style={{ marginTop: 8 }}>
                <div className="wh-banner-inner">
                  <span className="wh-banner-label">Amazon UK — Daily P&amp;L</span>
                  <span className="wh-banner-sub">DashboardTotals · {sorted.length} days on record</span>
                </div>
              </div>
              <div className="wh-stats" style={{ marginTop: 12, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div className="wh-stat-card"><div className="wh-stat-label">Yesterday Revenue</div><div className="wh-stat-val">{gbp(latest['Revenue £'])}</div></div>
                <div className="wh-stat-card"><div className="wh-stat-label">Yesterday Net Profit</div><div className="wh-stat-val" style={{ color: Number(latest['Net Profit £']) >= 0 ? 'var(--green-600, #16a34a)' : 'var(--red-500, #ef4444)' }}>{gbp(latest['Net Profit £'])}</div></div>
                <div className="wh-stat-card"><div className="wh-stat-label">Yesterday Margin</div><div className="wh-stat-val">{latest['Margin %'] ? `${latest['Margin %']}%` : '—'}</div></div>
                <div className="wh-stat-card"><div className="wh-stat-label">7-Day Revenue</div><div className="wh-stat-val">{gbp(totalRev)}</div></div>
                <div className="wh-stat-card"><div className="wh-stat-label">7-Day Net Profit</div><div className="wh-stat-val" style={{ color: totalProfit >= 0 ? 'var(--green-600, #16a34a)' : 'var(--red-500, #ef4444)' }}>{gbp(totalProfit)}</div></div>
                <div className="wh-stat-card"><div className="wh-stat-label">7-Day Orders</div><div className="wh-stat-val">{totalOrders}</div></div>
              </div>
              <SortableTable
                data={sorted}
                cols={[
                  { label: 'Date', key: 'Date' },
                  { label: 'Revenue £', key: 'Revenue £', type: 'number', w: 110 },
                  { label: 'Organic £', key: 'Organic Revenue £', type: 'number', w: 100 },
                  { label: 'PPC £', key: 'PPC Revenue £', type: 'number', w: 90 },
                  { label: 'Orders', key: 'Orders', type: 'number', w: 70 },
                  { label: 'Amazon Fees', key: 'Amazon Fees £', type: 'number', w: 110 },
                  { label: 'Ad Spend', key: 'Ad Spend £', type: 'number', w: 90 },
                  { label: 'COGS', key: 'COGS £', type: 'number', w: 90 },
                  { label: 'Net Profit £', key: 'Net Profit £', type: 'number', w: 110 },
                  { label: 'Margin %', key: 'Margin %', type: 'number', w: 90 },
                  { label: 'Sessions', key: 'Sessions', type: 'number', w: 80 },
                ]}
                renderRow={(r) => (
                  <tr key={r.id || r.Date}>
                    <td className="os-mono" style={{ fontSize: 11 }}>{fmt(r.Date)}</td>
                    <td className="os-mono">{gbp(r['Revenue £'])}</td>
                    <td className="os-mono">{gbp(r['Organic Revenue £'])}</td>
                    <td className="os-mono">{gbp(r['PPC Revenue £'])}</td>
                    <td className="os-mono">{fmt(r.Orders)}</td>
                    <td className="os-mono">{gbp(r['Amazon Fees £'])}</td>
                    <td className="os-mono">{gbp(r['Ad Spend £'])}</td>
                    <td className="os-mono">{gbp(r['COGS £'])}</td>
                    <td className="os-mono"><span style={{ color: Number(r['Net Profit £']) >= 0 ? 'var(--green-600, #16a34a)' : 'var(--red-500, #ef4444)', fontWeight: 600 }}>{gbp(r['Net Profit £'])}</span></td>
                    <td className="os-mono">{r['Margin %'] ? `${r['Margin %']}%` : '—'}</td>
                    <td className="os-mono">{fmt(r.Sessions)}</td>
                  </tr>
                )}
              />
            </>
          );
        })()
      )}

      {/* ── ASIN Performance (DashboardGoods) ── */}
      {sub === 'ASIN Performance' && (
        !asinDaily.length ? <div className="os-empty">No ASIN Performance data yet — run the Sellerboard scheduler to populate.</div> : (() => {
          const dates = [...new Set(asinDaily.map(r => r.Date))].sort((a, b) => new Date(b) - new Date(a));
          const latestDate = dates[0];
          const activeDate = selectedDateASIN && dates.includes(selectedDateASIN) ? selectedDateASIN : latestDate;
          const displayRows = asinDaily.filter(r => r.Date === activeDate).sort((a, b) => (Number(b['Revenue £']) || 0) - (Number(a['Revenue £']) || 0));
          return (
            <>
              <div className="wh-banner" style={{ marginTop: 8 }}>
                <div className="wh-banner-inner">
                  <span className="wh-banner-label">Amazon UK — ASIN Performance</span>
                  <span className="wh-banner-sub">DashboardGoods · per-ASIN daily data</span>
                </div>
              </div>
              <div style={{ marginTop: 10, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Date:</label>
                <select value={activeDate} onChange={e => setSelectedDateASIN(e.target.value)} style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border, #e5e7eb)' }}>
                  {dates.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <span style={{ fontSize: 11, color: 'var(--muted, #6b7280)' }}>{displayRows.length} ASINs</span>
              </div>
              <SortableTable
                data={displayRows}
                cols={[
                  { label: 'Product', key: 'Product Name' },
                  { label: 'ASIN', key: 'ASIN', w: 130 },
                  { label: 'Revenue £', key: 'Revenue £', type: 'number', w: 100 },
                  { label: 'PPC £', key: 'PPC Revenue £', type: 'number', w: 90 },
                  { label: 'Units', key: 'Units', type: 'number', w: 60 },
                  { label: 'Net Profit £', key: 'Net Profit £', type: 'number', w: 100 },
                  { label: 'Margin %', key: 'Margin %', type: 'number', w: 90 },
                  { label: 'Sessions', key: 'Sessions', type: 'number', w: 80 },
                  { label: 'ROI %', key: 'ROI %', type: 'number', w: 80 },
                  { label: 'Ad Spend £', key: 'Ad Spend £', type: 'number', w: 90 },
                ]}
                renderRow={(r) => (
                  <tr key={r.id || r['Record Key']}>
                    <td><strong style={{ fontSize: 12 }}>{fmt(r['Product Name'])}</strong></td>
                    <td className="os-mono" style={{ fontSize: 11 }}>{fmt(r.ASIN)}</td>
                    <td className="os-mono">{gbp(r['Revenue £'])}</td>
                    <td className="os-mono">{gbp(r['PPC Revenue £'])}</td>
                    <td className="os-mono">{fmt(r.Units)}</td>
                    <td className="os-mono"><span style={{ color: Number(r['Net Profit £']) >= 0 ? 'var(--green-600, #16a34a)' : 'var(--red-500, #ef4444)', fontWeight: 600 }}>{gbp(r['Net Profit £'])}</span></td>
                    <td className="os-mono">{r['Margin %'] ? `${r['Margin %']}%` : '—'}</td>
                    <td className="os-mono">{fmt(r.Sessions)}</td>
                    <td className="os-mono">{r['ROI %'] ? `${r['ROI %']}%` : '—'}</td>
                    <td className="os-mono">{gbp(r['Ad Spend £'])}</td>
                  </tr>
                )}
              />
            </>
          );
        })()
      )}

      {/* ── Sales (Sellerboard DashboardTotals + DashboardGoods) ── */}
      {sub === 'Sales' && salesLoading && (
        <div className="os-empty" style={{ marginTop: 24 }}>Loading Amazon sales data…</div>
      )}
      {sub === 'Sales' && !salesLoading && (() => {
        const today = new Date();
        const amzDateRange = (() => {
          const d = new Date();
          if (amzRange === 'MTD') return { from: new Date(d.getFullYear(), d.getMonth(), 1), to: today };
          if (amzRange === 'Last Month') return { from: new Date(d.getFullYear(), d.getMonth() - 1, 1), to: new Date(d.getFullYear(), d.getMonth(), 0) };
          if (amzRange === '30 Days') { const f = new Date(); f.setDate(f.getDate() - 30); return { from: f, to: today }; }
          if (amzRange === '90 Days') { const f = new Date(); f.setDate(f.getDate() - 90); return { from: f, to: today }; }
          if (amzRange === 'YTD') return { from: new Date(d.getFullYear(), 0, 1), to: today };
          if (amzRange === 'Custom') return { from: amzCustomFrom ? new Date(amzCustomFrom) : null, to: amzCustomTo ? new Date(amzCustomTo) : today };
          return { from: null, to: today };
        })();

        const filteredPnl = dailyPnl.filter(r => {
          if (!r.Date) return false;
          const d = new Date(r.Date);
          return (!amzDateRange.from || d >= amzDateRange.from) && d <= amzDateRange.to;
        }).sort((a, b) => new Date(b.Date) - new Date(a.Date));

        const filteredAsin = asinDaily.filter(r => {
          if (!r.Date) return false;
          const d = new Date(r.Date);
          return (!amzDateRange.from || d >= amzDateRange.from) && d <= amzDateRange.to;
        });

        // KPI aggregates
        const kRevenue    = filteredPnl.reduce((s, r) => s + (Number(r['Revenue £']) || 0), 0);
        const kNetProfit  = filteredPnl.reduce((s, r) => s + (Number(r['Net Profit £']) || 0), 0);
        const kOrders     = filteredPnl.reduce((s, r) => s + (Number(r.Orders) || 0), 0);
        const kAdSpend    = filteredPnl.reduce((s, r) => s + (Number(r['Ad Spend £']) || 0), 0);
        const kFees       = filteredPnl.reduce((s, r) => s + (Number(r['Amazon Fees £']) || 0), 0);
        const kCOGS       = filteredPnl.reduce((s, r) => s + (Number(r['COGS £']) || 0), 0);
        const kMargin     = kRevenue > 0 ? ((kNetProfit / kRevenue) * 100).toFixed(1) : '—';

        // By-product aggregates from asinDaily
        const byProductMap = {};
        filteredAsin.forEach(r => {
          const key = r.ASIN || r['Product Name'] || r.SKU || 'Unknown';
          if (!byProductMap[key]) byProductMap[key] = { 'Product Name': r['Product Name'], ASIN: r.ASIN, Revenue: 0, Units: 0, 'Net Profit £': 0, 'Ad Spend £': 0, Sessions: 0, days: 0 };
          byProductMap[key].Revenue += Number(r['Revenue £']) || 0;
          byProductMap[key].Units   += Number(r.Units) || 0;
          byProductMap[key]['Net Profit £'] += Number(r['Net Profit £']) || 0;
          byProductMap[key]['Ad Spend £']   += Number(r['Ad Spend £']) || 0;
          byProductMap[key].Sessions += Number(r.Sessions) || 0;
          byProductMap[key].days += 1;
        });
        const byProductRows = Object.values(byProductMap).sort((a, b) => b.Revenue - a.Revenue).map(p => ({
          ...p,
          'Revenue £': p.Revenue,
          'Margin %': p.Revenue > 0 ? ((p['Net Profit £'] / p.Revenue) * 100).toFixed(1) : '—',
        }));

        const AMZ_RANGES = ['MTD', 'Last Month', '30 Days', '90 Days', 'YTD', 'Custom'];

        return (
          <>
            {/* Range selector */}
            <div className="orders-filter-bar" style={{ marginTop: 8 }}>
              <div className="orders-range-group" style={{ overflowX: 'auto', display: 'flex', flexWrap: 'nowrap', gap: 4 }}>
                {AMZ_RANGES.map(r => (
                  <button key={r} className={`orders-range-btn${amzRange === r ? ' active' : ''}`} onClick={() => setAmzRange(r)}>{r}</button>
                ))}
                <span className="orders-live-badge orders-live-airtable">📋 Sellerboard · Airtable</span>
              </div>
              {amzRange === 'Custom' && (
                <div className="orders-custom-dates">
                  <input type="date" className="os-date-input" value={amzCustomFrom} onChange={e => setAmzCustomFrom(e.target.value)} />
                  <span className="os-muted">→</span>
                  <input type="date" className="os-date-input" value={amzCustomTo} onChange={e => setAmzCustomTo(e.target.value)} />
                </div>
              )}
            </div>

            {/* KPI cards */}
            <div className="orders-kpi-row">
              <div className="orders-kpi-card">
                <div className="orders-kpi-num">{gbp0(kRevenue)}</div>
                <div className="orders-kpi-label">REVENUE</div>
                <div className="orders-kpi-sub">{filteredPnl.length} days</div>
              </div>
              <div className="orders-kpi-card" style={{ borderTop: `3px solid ${kNetProfit >= 0 ? 'var(--green-600, #16a34a)' : 'var(--red-500, #ef4444)'}` }}>
                <div className="orders-kpi-num" style={{ color: kNetProfit >= 0 ? 'var(--green-600, #16a34a)' : 'var(--red-500, #ef4444)' }}>{gbp(kNetProfit)}</div>
                <div className="orders-kpi-label">NET PROFIT</div>
              </div>
              <div className="orders-kpi-card">
                <div className="orders-kpi-num">{kMargin !== '—' ? `${kMargin}%` : '—'}</div>
                <div className="orders-kpi-label">MARGIN</div>
              </div>
              <div className="orders-kpi-card">
                <div className="orders-kpi-num">{kOrders.toLocaleString()}</div>
                <div className="orders-kpi-label">ORDERS</div>
              </div>
              <div className="orders-kpi-card">
                <div className="orders-kpi-num">{gbp(kAdSpend)}</div>
                <div className="orders-kpi-label">AD SPEND</div>
              </div>
              <div className="orders-kpi-card">
                <div className="orders-kpi-num">{gbp(kFees)}</div>
                <div className="orders-kpi-label">AMAZON FEES</div>
              </div>
              <div className="orders-kpi-card">
                <div className="orders-kpi-num">{gbp(kCOGS)}</div>
                <div className="orders-kpi-label">COGS</div>
              </div>
            </div>

            {/* Inner sub-tabs */}
            <div className="os-sub-tabs" style={{ marginTop: 20, overflowX: 'auto', display: 'flex', flexWrap: 'nowrap', gap: 4 }}>
              {['Summary', 'Daily Sales', 'By Product', 'Orders'].map(s => (
                <button key={s} className={`os-sub-tab${amzSalesSub === s ? ' active' : ''}`} onClick={() => setAmzSalesSub(s)}>{s}</button>
              ))}
            </div>

            {/* Summary */}
            {amzSalesSub === 'Summary' && (
              <div style={{ marginTop: 16 }}>
                <div className="wh-banner">
                  <div className="wh-banner-inner">
                    <span className="wh-banner-label">Amazon UK — Sales Summary</span>
                    <span className="wh-banner-sub">{amzRange} · {filteredPnl.length} days · {byProductRows.length} products</span>
                  </div>
                </div>
                {!filteredPnl.length
                  ? <div className="os-empty" style={{ marginTop: 12 }}>No Sellerboard data for this period. Run the Sellerboard sync to populate.</div>
                  : (
                  <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted, #6b7280)', marginBottom: 12 }}>P&L Breakdown</div>
                      {[
                        ['Revenue', gbp0(kRevenue)],
                        ['Amazon Fees', `−${gbp(kFees)}`],
                        ['Ad Spend', `−${gbp(kAdSpend)}`],
                        ['COGS', `−${gbp(kCOGS)}`],
                        ['Net Profit', gbp(kNetProfit)],
                        ['Margin', kMargin !== '—' ? `${kMargin}%` : '—'],
                      ].map(([label, val]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border, #e5e7eb)', fontSize: 13 }}>
                          <span style={{ color: 'var(--muted, #6b7280)' }}>{label}</span>
                          <span className="os-mono" style={{ fontWeight: label === 'Net Profit' || label === 'Revenue' ? 700 : 400, color: label === 'Net Profit' ? (kNetProfit >= 0 ? 'var(--green-600, #16a34a)' : 'var(--red-500, #ef4444)') : undefined }}>{val}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted, #6b7280)', marginBottom: 12 }}>Top Products by Revenue</div>
                      {byProductRows.slice(0, 8).map((p, i) => (
                        <div key={p.ASIN || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border, #e5e7eb)', fontSize: 12 }}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{p['Product Name'] || p.ASIN || 'Unknown'}</span>
                          <span className="os-mono" style={{ fontWeight: 600, minWidth: 70, textAlign: 'right' }}>{gbp(p['Revenue £'])}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Daily Sales */}
            {amzSalesSub === 'Daily Sales' && (
              <div style={{ marginTop: 16 }}>
                {!filteredPnl.length
                  ? <div className="os-empty">No daily P&L data for this period.</div>
                  : <SortableTable
                      data={filteredPnl}
                      cols={[
                        { label: 'Date', key: 'Date' },
                        { label: 'Revenue £', key: 'Revenue £', type: 'number', w: 110 },
                        { label: 'Organic £', key: 'Organic Revenue £', type: 'number', w: 100 },
                        { label: 'PPC £', key: 'PPC Revenue £', type: 'number', w: 90 },
                        { label: 'Orders', key: 'Orders', type: 'number', w: 70 },
                        { label: 'Amazon Fees', key: 'Amazon Fees £', type: 'number', w: 110 },
                        { label: 'Ad Spend', key: 'Ad Spend £', type: 'number', w: 90 },
                        { label: 'COGS', key: 'COGS £', type: 'number', w: 90 },
                        { label: 'Net Profit £', key: 'Net Profit £', type: 'number', w: 110 },
                        { label: 'Margin %', key: 'Margin %', type: 'number', w: 90 },
                        { label: 'Sessions', key: 'Sessions', type: 'number', w: 80 },
                      ]}
                      renderRow={(r) => (
                        <tr key={r.id || r.Date}>
                          <td className="os-mono" style={{ fontSize: 11 }}>{fmt(r.Date)}</td>
                          <td className="os-mono">{gbp(r['Revenue £'])}</td>
                          <td className="os-mono">{gbp(r['Organic Revenue £'])}</td>
                          <td className="os-mono">{gbp(r['PPC Revenue £'])}</td>
                          <td className="os-mono">{fmt(r.Orders)}</td>
                          <td className="os-mono">{gbp(r['Amazon Fees £'])}</td>
                          <td className="os-mono">{gbp(r['Ad Spend £'])}</td>
                          <td className="os-mono">{gbp(r['COGS £'])}</td>
                          <td className="os-mono"><span style={{ color: Number(r['Net Profit £']) >= 0 ? 'var(--green-600, #16a34a)' : 'var(--red-500, #ef4444)', fontWeight: 600 }}>{gbp(r['Net Profit £'])}</span></td>
                          <td className="os-mono">{r['Margin %'] ? `${r['Margin %']}%` : '—'}</td>
                          <td className="os-mono">{fmt(r.Sessions)}</td>
                        </tr>
                      )}
                    />
                }
              </div>
            )}

            {/* By Product */}
            {amzSalesSub === 'By Product' && (
              <div style={{ marginTop: 16 }}>
                {!byProductRows.length
                  ? <div className="os-empty">No ASIN data for this period. Run the Sellerboard sync to populate.</div>
                  : <SortableTable
                      data={byProductRows}
                      cols={[
                        { label: 'Product', key: 'Product Name' },
                        { label: 'ASIN', key: 'ASIN', w: 130 },
                        { label: 'Revenue £', key: 'Revenue £', type: 'number', w: 110 },
                        { label: 'Units', key: 'Units', type: 'number', w: 70 },
                        { label: 'Net Profit £', key: 'Net Profit £', type: 'number', w: 110 },
                        { label: 'Margin %', key: 'Margin %', w: 90 },
                        { label: 'Ad Spend £', key: 'Ad Spend £', type: 'number', w: 100 },
                        { label: 'Sessions', key: 'Sessions', type: 'number', w: 80 },
                      ]}
                      renderRow={(p, i) => (
                        <tr key={p.ASIN || i}>
                          <td><strong style={{ fontSize: 12 }}>{fmt(p['Product Name'])}</strong></td>
                          <td className="os-mono" style={{ fontSize: 11 }}>{fmt(p.ASIN)}</td>
                          <td className="os-mono">{gbp(p['Revenue £'])}</td>
                          <td className="os-mono">{fmt(p.Units)}</td>
                          <td className="os-mono"><span style={{ color: p['Net Profit £'] >= 0 ? 'var(--green-600, #16a34a)' : 'var(--red-500, #ef4444)', fontWeight: 600 }}>{gbp(p['Net Profit £'])}</span></td>
                          <td className="os-mono">{p['Margin %'] !== '—' ? `${p['Margin %']}%` : '—'}</td>
                          <td className="os-mono">{gbp(p['Ad Spend £'])}</td>
                          <td className="os-mono">{fmt(p.Sessions)}</td>
                        </tr>
                      )}
                    />
                }
              </div>
            )}

            {/* Orders — from email capture (Amazon FBA shipped notifications) */}
            {amzSalesSub === 'Orders' && (() => {
              const filteredOrders = amazonOrders.filter(o => {
                const d = new Date(o['Shipped Date'] || o['Order Date'] || o['Email Source Date']);
                if (isNaN(d)) return true; // include if no date
                return (!amzDateRange.from || d >= amzDateRange.from) && d <= amzDateRange.to;
              }).sort((a, b) => new Date(b['Shipped Date'] || b['Order Date'] || 0) - new Date(a['Shipped Date'] || a['Order Date'] || 0));
              const totalUnits = filteredOrders.reduce((s, o) => s + (Number(o.Quantity) || 0), 0);
              return (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                    <div className="wh-stat-card"><div className="wh-stat-label">Orders in Period</div><div className="wh-stat-val">{filteredOrders.length}</div></div>
                    <div className="wh-stat-card"><div className="wh-stat-label">Units Shipped</div><div className="wh-stat-val">{totalUnits}</div></div>
                    <div className="wh-stat-card"><div className="wh-stat-label">Total on Record</div><div className="wh-stat-val">{amazonOrders.length}</div></div>
                    <div className="wh-stat-card" style={{ fontSize: 11, color: 'var(--muted, #6b7280)', maxWidth: 220, display: 'flex', alignItems: 'center' }}>
                      <span>Source: Amazon FBA dispatched emails via Outlook capture · Revenue populated by Sellerboard</span>
                    </div>
                  </div>
                  {!filteredOrders.length
                    ? <div className="os-empty">No orders found for this period. The email capture runs daily and writes to this table automatically.</div>
                    : <SortableTable
                        data={filteredOrders}
                        cols={[
                          { label: 'Order ID', key: 'Order ID', w: 160 },
                          { label: 'Shipped', key: 'Shipped Date', type: 'date', w: 100 },
                          { label: 'Product', key: 'Product Name' },
                          { label: 'ASIN', key: 'ASIN', w: 130 },
                          { label: 'Qty', key: 'Quantity', type: 'number', w: 55 },
                          { label: 'Revenue £', key: 'Revenue (£)', type: 'number', w: 100 },
                          { label: 'Status', key: 'Status', w: 90 },
                        ]}
                        renderRow={(o) => (
                          <tr key={o.id || o['Order ID']}>
                            <td className="os-mono" style={{ fontSize: 10 }}>{fmt(o['Order ID'])}</td>
                            <td className="os-mono" style={{ fontSize: 11 }}>{fmt(o['Shipped Date'] || o['Order Date'])}</td>
                            <td style={{ fontSize: 12 }}>{fmt(o['Product Name'])}</td>
                            <td className="os-mono" style={{ fontSize: 11 }}>{fmt(o.ASIN)}</td>
                            <td className="os-mono">{fmt(o.Quantity)}</td>
                            <td className="os-mono">{o['Revenue (£)'] ? gbp(o['Revenue (£)']) : <span style={{ color: 'var(--muted, #6b7280)', fontSize: 11 }}>—</span>}</td>
                            <td>{o.Status ? <span className="os-pill pill-done">{o.Status}</span> : '—'}</td>
                          </tr>
                        )}
                      />
                  }
                </div>
              );
            })()}
          </>
        );
      })()}

      {/* ── Inbound (Bio-nature → Amazon FBA) ── */}
      {sub === 'Inbound' && (
        <>
          <div className="wh-banner" style={{ marginTop: 8 }}>
            <div className="wh-banner-inner">
              <span className="wh-banner-label">Bio-nature → Amazon FBA</span>
              <span className="wh-banner-sub">Stock en route to FBA fulfilment centres</span>
            </div>
            <div className="wh-banner-stats">
              <div className="wh-banner-stat"><span className="wh-banner-num">{activeInbound.length}</span><span className="wh-banner-unit">Active Lines</span></div>
              <div className="wh-banner-stat"><span className="wh-banner-num">{totalInbound.toLocaleString()}</span><span className="wh-banner-unit">Active Units</span></div>
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

      {/* ── PPC Campaigns ── */}
      {sub === 'PPC' && (
        <div style={{ marginTop: 8 }}>
          {ppc.length === 0 ? (
            <div className="os-empty">
              No PPC data. Paste campaign rows from your Amazon Ads export into the{' '}
              <strong>📣 Amazon UK — PPC Campaigns</strong> table in Airtable.
            </div>
          ) : (
            <>
              <div className="os-stat-row" style={{ marginTop: 8 }}>
                <div className="os-stat-card"><div className="os-stat-num">{gbp(ppcTotals.totSpend)}</div><div className="os-stat-label">Total Spend</div></div>
                <div className="os-stat-card"><div className="os-stat-num">{gbp(ppcTotals.totSales)}</div><div className="os-stat-label">Ad Sales</div></div>
                <div className="os-stat-card"><div className="os-stat-num">{ppcTotals.totOrders}</div><div className="os-stat-label">Ad Orders</div></div>
                <div className={`os-stat-card${ppcTotals.blendedAcos > 50 ? ' os-stat-red' : ppcTotals.blendedAcos > 30 ? ' os-stat-amber' : ppcTotals.totSales > 0 ? ' os-stat-green' : ''}`}>
                  <div className="os-stat-num">{ppcTotals.totSales > 0 ? ppcTotals.blendedAcos.toFixed(1) + '%' : '—'}</div>
                  <div className="os-stat-label">Blended ACOS</div>
                </div>
                <div className="os-stat-card"><div className="os-stat-num">{ppcTotals.totImpressions.toLocaleString()}</div><div className="os-stat-label">Impressions</div></div>
                <div className="os-stat-card"><div className="os-stat-num">{ppcTotals.enabledCount} / {ppc.length}</div><div className="os-stat-label">Enabled / Total</div></div>
              </div>
              <div style={{ marginTop: 16 }}>
                <SortableTable
                  cols={[
                    { label: 'Report Date', key: 'Report Date', type: 'date', w: 100 },
                    { label: 'Campaign', key: 'Campaign Name' },
                    { label: 'ASIN', key: 'ASIN', w: 115 },
                    { label: 'Type', key: 'Match Type', w: 90 },
                    { label: 'Status', key: 'Status', w: 80 },
                    { label: 'Spend', key: 'Spend (£)', type: 'number', w: 80 },
                    { label: 'Sales', key: 'Sales (£)', type: 'number', w: 80 },
                    { label: 'Orders', key: 'Orders', type: 'number', w: 70 },
                    { label: 'ACOS', key: 'ACOS %', type: 'number', w: 80 },
                    { label: 'ROAS', key: 'ROAS', type: 'number', w: 70 },
                  ]}
                  data={ppcEditor.dataWithStatus}
                  renderRow={r => {
                    const product = fbaByAsin[r.ASIN];
                    const acos = r['ACOS %'] ? (r['ACOS %'] * 100).toFixed(1) + '%' : '—';
                    const acosVal = r['ACOS %'] || 0;
                    const acosColor = acosVal > 0.5 ? '#ef4444' : acosVal > 0.3 ? '#d97706' : acosVal > 0 ? '#16a34a' : undefined;
                    return (
                      <tr key={r.id} onClick={() => setSelectedPPC(r)} style={{ cursor: 'pointer' }}>
                        <td className="os-mono" style={{ fontSize: 11, color: 'var(--charcoal-45)' }}>{fmt(r['Report Date'])}</td>
                        <td style={{ maxWidth: 260 }}>
                          <strong style={{ fontSize: 12 }}>{fmt(r['Campaign Name'])}</strong>
                          {product && <p className="os-table-note">{product.Product}</p>}
                        </td>
                        <td className="os-mono" style={{ fontSize: 11 }}>{fmt(r.ASIN)}</td>
                        <td><span className="os-pill pill-default" style={{ fontSize: 11 }}>{fmt(r['Match Type'])}</span></td>
                        <td>
                          <StatusSelect record={r} allStatuses={ppcStatuses} handleStatusChange={ppcEditor.handleStatusChange} saving={ppcEditor.saving} />
                        </td>
                        <td className="os-mono">{gbp(r['Spend (£)'])}</td>
                        <td className="os-mono">{r['Sales (£)'] ? gbp(r['Sales (£)']) : '—'}</td>
                        <td className="os-mono">{r.Orders || '—'}</td>
                        <td className="os-mono">
                          <span style={acosColor ? { color: acosColor, fontWeight: 600 } : {}}>{acos}</span>
                        </td>
                        <td className="os-mono">{r.ROAS ? Number(r.ROAS).toFixed(2) : '—'}</td>
                      </tr>
                    );
                  }}
                  emptyMsg="No campaigns."
                />
              </div>
            </>
          )}
          <RecordDetailPanel
            record={selectedPPC}
            titleField="Campaign Name"
            onClose={() => setSelectedPPC(null)}
            allStatuses={ppcStatuses}
            onStatusChange={ppcEditor.handleStatusChange}
            saving={ppcEditor.saving}
          />
        </div>
      )}

      {/* ── Reviews ── */}
      {sub === 'Reviews' && <AmazonReviewsTab reviews={reviews} />}

      {/* ── Reporting / Finance (with date filter + P&L waterfall) ── */}
      {sub === 'Reporting' && <AmazonReportingTab reporting={reporting} />}
    </>
  );
}

/* ── Warehouse: Stock on Hand (Bio-nature) ────── */
function SOHTab({ soh, sohSource = 'airtable' }) {
  const isDrive = sohSource === 'drive';
  const [chanFilter, setChan] = useState('');
  const [search, setSearch] = useState('');
  const sohEditor = useStatusEditor(isDrive ? [] : soh); // status editor only for Airtable data
  const sohStatuses = useMemo(() => [...new Set([...BASE_STATUSES, ...soh.map(s => s.Status).filter(Boolean)])], [soh]);
  const channels = [...new Set(soh.flatMap(s => Array.isArray(s.Channel) ? s.Channel : [s.Channel]).filter(Boolean))].sort();

  const displayData = isDrive ? soh : sohEditor.dataWithStatus;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return displayData.filter(s => {
      const mQ = !q || (s.Product || '').toLowerCase().includes(q) || (s.SKU || '').toLowerCase().includes(q);
      const mC = !chanFilter || (Array.isArray(s.Channel) ? s.Channel.includes(chanFilter) : s.Channel === chanFilter);
      return mQ && mC;
    });
  }, [displayData, search, chanFilter]);

  const totalUnits = filtered.reduce((sum, s) => sum + (Number(s['Total QTY']) || 0), 0);
  const byQty = useMemo(() => [...filtered].filter(s => Number(s['Total QTY']) > 0).sort((a, b) => (Number(b['Total QTY']) || 0) - (Number(a['Total QTY']) || 0)), [filtered]);
  const top5soh = byQty.slice(0, 5);
  const bottom5soh = [...byQty].reverse().slice(0, 5);

  return (
    <>
      <div className="wh-banner">
        <div className="wh-banner-inner">
          <span className="wh-banner-label">Bio-nature UK Warehouse</span>
          <span className="wh-banner-sub">
            {isDrive ? 'Live from warehouse file — batch & BBD detail' : 'Stock on hand — allocated by channel'}
          </span>
        </div>
        <div className="wh-banner-stats">
          <div className="wh-banner-stat"><span className="wh-banner-num">{filtered.length}</span><span className="wh-banner-unit">SKUs</span></div>
          <div className="wh-banner-stat"><span className="wh-banner-num">{totalUnits.toLocaleString()}</span><span className="wh-banner-unit">Units</span></div>
          {isDrive && <div className="wh-banner-stat"><span className="wh-banner-num" style={{ fontSize: 11, color: 'var(--accent)' }}>● Drive</span></div>}
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
        {!isDrive && channels.length > 0 && (
          <select className="os-select" value={chanFilter} onChange={e => setChan(e.target.value)}>
            <option value="">All Channels</option>
            {channels.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <span className="os-count">{filtered.length} SKUs</span>
      </div>

      {isDrive ? (
        /* ── Drive mode: batch detail table ── */
        <SortableTable
          cols={[
            { label: 'SKU', key: 'SKU', w: 120 },
            { label: 'Product', key: 'Product' },
            { label: 'Total QTY', key: 'Total QTY', type: 'number', w: 100 },
            { label: 'Batch 1', w: 200 },
            { label: 'Batch 2', w: 200 },
            { label: 'Batch 3', w: 200 },
          ]}
          data={filtered}
          renderRow={s => (
            <tr key={s.id}>
              <td className="os-mono">{fmt(s.SKU)}</td>
              <td><strong>{fmt(s.Product)}</strong></td>
              <td className="os-mono"><strong>{fmt(s['Total QTY'])}</strong></td>
              {[0, 1, 2].map(i => {
                const b = (s.batches || [])[i];
                return (
                  <td key={i} className="os-muted" style={{ fontSize: 12 }}>
                    {b ? <><span className="os-mono" style={{ fontWeight: 600 }}>{b.qty}</span> {b.info}</> : '—'}
                  </td>
                );
              })}
            </tr>
          )}
          emptyMsg="No stock on hand data."
        />
      ) : (
        /* ── Airtable mode: channel / status table ── */
        <SortableTable
          cols={[
            { label: 'Product', key: 'Product' },
            { label: 'SKU', key: 'SKU', w: 110 },
            { label: 'Total QTY', key: 'Total QTY', type: 'number', w: 100 },
            { label: 'Batch Info', key: 'Batch Info', w: 140 },
            { label: 'Channel', w: 150 },
            { label: 'Status', key: 'Status', w: 120 },
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
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={s} allStatuses={sohStatuses} handleStatusChange={sohEditor.handleStatusChange} saving={sohEditor.saving} />
              </td>
              <td className="os-mono">{fmt(s['Last Updated'])}</td>
            </tr>
          )}
          emptyMsg="No stock on hand data."
        />
      )}
    </>
  );
}

/* ── Warehouse: Inbound Stock ─────────────────── */
function InboundTab({ inbound }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatus] = useState('');
  const inboundEditor = useStatusEditor(inbound);
  const inboundStatuses = useMemo(() => [...new Set(['Pending', 'In Transit', 'Received', 'Done', 'Delayed', ...BASE_STATUSES, ...inbound.map(s => s.Status).filter(Boolean)])], [inbound]);
  const statuses = inboundStatuses;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return inboundEditor.dataWithStatus.filter(s => {
      const mQ = !q || (s.Product || '').toLowerCase().includes(q) || (s.SKU || '').toLowerCase().includes(q) || (s['PO Reference'] || '').toLowerCase().includes(q);
      const mS = !statusFilter || s.Status === statusFilter;
      return mQ && mS;
    });
  }, [inboundEditor.dataWithStatus, search, statusFilter]);

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
          { label: 'Status', key: 'Status', w: 120 },
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
            <td onClick={e => e.stopPropagation()}>
              <StatusSelect record={s} allStatuses={inboundStatuses} handleStatusChange={inboundEditor.handleStatusChange} saving={inboundEditor.saving} />
            </td>
            <td className="os-mono">{fmt(s['Expected Arrival'])}</td>
          </tr>
        )}
        emptyMsg="No inbound stock."
      />
    </>
  );
}

/* ── Bionature Batch & BBD ────────────────────── */
function BionatureTab({ items }) {
  const today = new Date();
  const soon = items.filter(i => {
    if (!i.BBD) return false;
    const d = new Date(i.BBD);
    const days = (d - today) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 90;
  });
  if (!items.length) return <div className="os-empty">No Bionature batch records yet.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Batch Records</div></div>
        {soon.length > 0 && <div className="os-stat-card os-stat-amber"><div className="os-stat-num">{soon.length}</div><div className="os-stat-label">Expiring ≤90 days</div></div>}
      </div>
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'SKU', key: 'SKU Code', w: 110 },
            { label: 'Product', key: 'Product Description' },
            { label: 'Batch #', key: 'Batch Number', w: 120 },
            { label: 'BBD', key: 'BBD', type: 'date', w: 110 },
            { label: 'Batch Qty', key: 'Batch Qty', type: 'number', w: 100 },
            { label: 'Total SKU Qty', key: 'Total SKU Qty', type: 'number', w: 120 },
            { label: 'Report Date', key: 'Report Date', type: 'date', w: 110 },
            { label: 'Source', key: 'Source', w: 100 },
          ]}
          data={items}
          renderRow={r => {
            const bbd = r.BBD ? new Date(r.BBD) : null;
            const daysLeft = bbd ? Math.round((bbd - today) / (1000 * 60 * 60 * 24)) : null;
            const isExpiring = daysLeft !== null && daysLeft >= 0 && daysLeft <= 90;
            return (
              <tr key={r.id} style={isExpiring ? { background: 'rgba(214,92,44,0.06)' } : undefined}>
                <td className="os-mono" style={{ fontSize: 11 }}>{fmt(r['SKU Code'])}</td>
                <td><strong>{fmt(r['Product Description'])}</strong></td>
                <td className="os-mono">{fmt(r['Batch Number'])}</td>
                <td className="os-mono" style={isExpiring ? { color: 'var(--amber)', fontWeight: 600 } : undefined}>
                  {fmt(r.BBD)}{isExpiring && <span className="os-pill pill-blocked" style={{ marginLeft: 6, fontSize: 10 }}>{daysLeft}d</span>}
                </td>
                <td className="os-mono">{fmt(r['Batch Qty'])}</td>
                <td className="os-mono">{fmt(r['Total SKU Qty'])}</td>
                <td className="os-mono">{fmt(r['Report Date'])}</td>
                <td className="os-muted">{fmt(r.Source)}</td>
              </tr>
            );
          }}
          emptyMsg="No batch records."
        />
      </div>
    </>
  );
}

/* ── Amazon Reviews ───────────────────────────── */
function AmazonReviewsTab({ reviews = [] }) {
  const flagged = reviews.filter(r => r['Flagged—QC/Complaint'] === true || r['Flagged—QC/Complaint'] === 'checked');
  if (!reviews.length) return <div className="os-empty">No Amazon review records. Add entries to the Amazon UK Reviews table in Airtable.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card"><div className="os-stat-num">{reviews.length}</div><div className="os-stat-label">Reviews Logged</div></div>
        {flagged.length > 0 && <div className="os-stat-card os-stat-red"><div className="os-stat-num">{flagged.length}</div><div className="os-stat-label">QC / Complaint Flagged</div></div>}
      </div>
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Date', key: 'Review Date', type: 'date', w: 110 },
            { label: 'Reviewer', key: 'Reviewer', w: 130 },
            { label: 'Title', key: 'Review Title' },
            { label: 'Product', key: 'Product', w: 180 },
            { label: 'QC Flag', key: 'Flagged—QC/Complaint', w: 100 },
            { label: 'Notes', key: 'Notes' },
          ]}
          data={reviews}
          renderRow={r => {
            const isFlagged = r['Flagged—QC/Complaint'] === true || r['Flagged—QC/Complaint'] === 'checked';
            return (
              <tr key={r.id} style={isFlagged ? { background: 'rgba(214,92,44,0.06)' } : undefined}>
                <td className="os-mono">{fmt(r['Review Date'])}</td>
                <td className="os-muted">{fmt(r.Reviewer)}</td>
                <td><strong>{fmt(r['Review Title'])}</strong>{r.Notes && <p className="os-table-note">{r.Notes}</p>}</td>
                <td className="os-muted" style={{ fontSize: 12 }}>{fmt(r.Product)}</td>
                <td>{isFlagged ? <span className="os-pill pill-blocked">Flagged</span> : '—'}</td>
                <td className="os-muted" style={{ fontSize: 12 }}>{fmt(r.Notes)}</td>
              </tr>
            );
          }}
          emptyMsg="No reviews."
        />
      </div>
    </>
  );
}

/* ── B2B ──────────────────────────────────────── */
function B2BTab({ items }) {
  const editor = useStatusEditor(items, 'Account Status');
  const b2bStatuses = useMemo(() => [...new Set(['Active', 'Inactive', 'Prospect', 'On Hold', ...items.map(i => i['Account Status']).filter(Boolean)])], [items]);
  const active = editor.dataWithStatus.filter(i => i['Account Status'] === 'Active').length;
  if (!items.length) return <div className="os-empty">No B2B accounts.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{active}</div><div className="os-stat-label">Active Accounts</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total</div></div>
      </div>
      {editor.updateError && <div className="os-alert-error" style={{ marginTop: 8 }}>{editor.updateError}</div>}
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Business', key: 'Business Name' },
            { label: 'Type', key: 'Business Type', w: 130 },
            { label: 'Contact', key: 'Contact Name', w: 130 },
            { label: 'Status', key: 'Account Status', w: 120 },
            { label: 'Monthly Value', key: 'Monthly Order Value (£)', type: 'number', w: 140 },
          ]}
          data={editor.dataWithStatus}
          renderRow={b => (
            <tr key={b.id}>
              <td><strong>{fmt(b['Business Name'])}</strong>{b.Email && <p className="os-table-note">{b.Email}</p>}</td>
              <td className="os-muted">{fmt(b['Business Type'])}</td>
              <td className="os-muted">{fmt(b['Contact Name'])}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={b} allStatuses={b2bStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} fieldName="Account Status" />
              </td>
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
  const editor = useStatusEditor(items);
  const custStatuses = useMemo(() => [...new Set([...BASE_STATUSES, ...items.map(c => c.Status).filter(Boolean)])], [items]);
  return (
    <SortableTable
      cols={[
        { label: 'Customer', key: 'Customer Name' },
        { label: 'Source', key: 'Source', w: 120 },
        { label: 'Type', key: 'Customer Type', w: 120 },
        { label: 'Status', key: 'Status', w: 120 },
        { label: 'LTV', key: 'LTV (£)', type: 'number', w: 90 },
        { label: 'Orders', key: 'Total Orders', type: 'number', w: 80 },
      ]}
      data={editor.dataWithStatus}
      renderRow={c => (
        <tr key={c.id}>
          <td><strong>{fmt(c['Customer Name'])}</strong>{c.Email && <p className="os-table-note">{c.Email}</p>}</td>
          <td className="os-muted">{fmt(c.Source)}</td>
          <td className="os-muted">{fmt(c['Customer Type'])}</td>
          <td onClick={e => e.stopPropagation()}>
            <StatusSelect record={c} allStatuses={custStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
          </td>
          <td className="os-mono">{gbp(c['LTV (£)'])}</td>
          <td className="os-mono">{fmt(c['Total Orders'])}</td>
        </tr>
      )}
      emptyMsg="No customer records."
    />
  );
}

/* ── Affiliates ───────────────────────────────── */
const AFF_SUBS = ['Programme', 'Performance', 'Sales', 'Payouts', 'Traffic', 'Products', 'Tasks'];

/* Programme — UK base CRM/onboarding records */
function AffProgrammeTab({ items }) {
  const editor = useStatusEditor(items, 'Onboarding Status');
  const affStatuses = useMemo(() => [...new Set(['Invited', 'Applied', 'Approved', 'Active', 'Inactive', 'Rejected', ...items.map(a => a['Onboarding Status']).filter(Boolean)])], [items]);
  if (!items.length) return <div className="os-empty">No programme records.</div>;
  const signed = items.filter(i => i['Agreement Signed'] === true || i['Agreement Signed'] === 'true').length;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{signed}</div><div className="os-stat-label">Agreements Signed</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total</div></div>
      </div>
      {editor.updateError && <div className="os-alert-error" style={{ marginTop: 8 }}>{editor.updateError}</div>}
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Name', key: 'Name' },
            { label: 'Type', key: 'Type', w: 120 },
            { label: 'Platform', key: 'Platform', w: 120 },
            { label: 'Market', key: 'Market', w: 130 },
            { label: 'Commission Tier', key: 'Commission Tier', w: 140 },
            { label: 'Status', key: 'Onboarding Status', w: 150 },
          ]}
          data={editor.dataWithStatus}
          renderRow={a => (
            <tr key={a.id}>
              <td><strong>{fmt(a.Name)}</strong>{a.Email && <p className="os-table-note">{a.Email}</p>}</td>
              <td className="os-muted">{fmt(a.Type)}</td>
              <td className="os-muted">{fmt(a.Platform)}</td>
              <td className="os-muted">{Array.isArray(a.Market) ? a.Market.join(', ') : fmt(a.Market)}</td>
              <td>{a['Commission Tier'] ? <span className="os-pill pill-default">{a['Commission Tier']}</span> : '—'}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={a} allStatuses={affStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} fieldName="Onboarding Status" />
              </td>
            </tr>
          )}
          emptyMsg="No programme records."
        />
      </div>
    </>
  );
}

/* Performance — GoAffPro individual affiliate stats */
const AFF_SC = { 'Active': 'pill-done', 'Approved': 'pill-done', 'Paid': 'pill-done', 'Pending': 'pill-todo', 'Inactive': 'pill-todo', 'In Review': 'pill-progress', 'Suspended': 'pill-blocked', 'Rejected': 'pill-blocked' };
function affSc(s) { return AFF_SC[s] || 'pill-default'; }

function AffPerformanceTab({ items }) {
  const [srch, setSrch] = useState('');
  const [stFilter, setStFilter] = useState('');
  const statuses = [...new Set(items.map(i => i.Status).filter(Boolean))];
  const filtered = useMemo(() => {
    const q = srch.toLowerCase();
    return items.filter(i => {
      const mQ = !q || (i.Name || '').toLowerCase().includes(q) || (i.Email || '').toLowerCase().includes(q);
      const mS = !stFilter || i.Status === stFilter;
      return mQ && mS;
    });
  }, [items, srch, stFilter]);
  const active  = items.filter(i => i.Status === 'Active').length;
  const totRev  = items.reduce((s, i) => s + (Number(i['Total Revenue']) || 0), 0);
  const totComm = items.reduce((s, i) => s + (Number(i['Total Commission']) || 0), 0);
  const totOut  = items.reduce((s, i) => s + (Number(i['Outstanding Balance']) || 0), 0);
  if (!items.length) return <div className="os-empty">No GoAffPro performance data yet. Add records to the Affiliates table in the Affiliate Ops base.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{active}</div><div className="os-stat-label">Active Affiliates</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{gbp(totRev)}</div><div className="os-stat-label">Total Revenue</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{gbp(totComm)}</div><div className="os-stat-label">Commission Earned</div></div>
        {totOut > 0 && <div className="os-stat-card os-stat-amber"><div className="os-stat-num">{gbp(totOut)}</div><div className="os-stat-label">Outstanding</div></div>}
      </div>
      <div className="os-toolbar" style={{ marginTop: 16 }}>
        <input className="os-search" placeholder="Search affiliates…" value={srch} onChange={e => setSrch(e.target.value)} />
        {statuses.length > 0 && (
          <select className="os-select" value={stFilter} onChange={e => setStFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <span className="os-count">{filtered.length} affiliates</span>
      </div>
      <SortableTable
        cols={[
          { label: 'Name', key: 'Name' },
          { label: 'Country', key: 'Country', w: 90 },
          { label: 'Tier', key: 'Tier', w: 90 },
          { label: 'Status', key: 'Status', w: 110 },
          { label: 'Revenue', key: 'Total Revenue', type: 'number', w: 110 },
          { label: 'Commission', key: 'Total Commission', type: 'number', w: 120 },
          { label: 'Paid', key: 'Total Paid', type: 'number', w: 100 },
          { label: 'Outstanding', key: 'Outstanding Balance', type: 'number', w: 120 },
          { label: 'Orders', key: 'Orders Count', type: 'number', w: 80 },
          { label: 'Conv Rate', key: 'Conversion Rate', type: 'number', w: 100 },
          { label: 'Risk Score', key: 'Risk Score', w: 100 },
        ]}
        data={filtered}
        renderRow={a => (
          <tr key={a.id}>
            <td>
              <strong>{fmt(a.Name)}</strong>
              {a.Email && <p className="os-table-note">{a.Email}</p>}
              {a['Referral Code'] && <p className="os-table-note os-mono" style={{ fontSize: 10 }}>Code: {a['Referral Code']}</p>}
            </td>
            <td className="os-muted">{fmt(a.Country)}</td>
            <td className="os-muted">{fmt(a.Tier)}</td>
            <td>{a.Status ? <span className={`os-pill ${affSc(a.Status)}`}>{a.Status}</span> : '—'}</td>
            <td className="os-mono">{gbp(a['Total Revenue'])}</td>
            <td className="os-mono">{gbp(a['Total Commission'])}</td>
            <td className="os-mono">{gbp(a['Total Paid'])}</td>
            <td className="os-mono">{a['Outstanding Balance'] > 0 ? <strong style={{ color: 'var(--amber)' }}>{gbp(a['Outstanding Balance'])}</strong> : gbp(a['Outstanding Balance'])}</td>
            <td className="os-mono">{fmt(a['Orders Count'])}</td>
            <td className="os-mono">{a['Conversion Rate'] ? `${a['Conversion Rate']}%` : '—'}</td>
            <td>{a['Risk Score'] ? <span className={`os-pill ${a['Risk Score'] === 'High' ? 'pill-blocked' : a['Risk Score'] === 'Medium' ? 'pill-progress' : 'pill-done'}`}>{a['Risk Score']}</span> : '—'}</td>
          </tr>
        )}
        emptyMsg="No affiliates found."
      />
    </>
  );
}

/* Sales */
function AffSalesTab({ items }) {
  const [srch, setSrch] = useState('');
  const filtered = useMemo(() => { const q = srch.toLowerCase(); return !q ? items : items.filter(i => (i['Order Number'] || '').toLowerCase().includes(q) || (i.Customer || '').toLowerCase().includes(q) || (i.Affiliate || '').toLowerCase().includes(q)); }, [items, srch]);
  const totRev  = items.reduce((s, i) => s + (Number(i.Revenue) || 0), 0);
  const totComm = items.reduce((s, i) => s + (Number(i.Commission) || 0), 0);
  const newCust = items.filter(i => i['New Customer'] === true || i['New Customer'] === 'checked').length;
  if (!items.length) return <div className="os-empty">No sales records yet.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{gbp(totRev)}</div><div className="os-stat-label">Total Revenue</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{gbp(totComm)}</div><div className="os-stat-label">Total Commission</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Orders</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{newCust}</div><div className="os-stat-label">New Customers</div></div>
      </div>
      <div className="os-toolbar" style={{ marginTop: 16 }}>
        <input className="os-search" placeholder="Search orders…" value={srch} onChange={e => setSrch(e.target.value)} />
        <span className="os-count">{filtered.length} orders</span>
      </div>
      <SortableTable
        cols={[
          { label: 'Order #', key: 'Order Number', w: 120 },
          { label: 'Date', key: 'Date', type: 'date', w: 110 },
          { label: 'Affiliate', key: 'Affiliate', w: 140 },
          { label: 'Customer', key: 'Customer', w: 140 },
          { label: 'Revenue', key: 'Revenue', type: 'number', w: 110 },
          { label: 'Commission', key: 'Commission', type: 'number', w: 120 },
          { label: 'Status', key: 'Status', w: 110 },
          { label: 'New Cust?', key: 'New Customer', w: 90 },
          { label: 'Subscription?', key: 'Subscription', w: 110 },
        ]}
        data={filtered.slice(0, 300)}
        renderRow={r => (
          <tr key={r.id}>
            <td className="os-mono" style={{ fontSize: 11 }}>{fmt(r['Order Number'])}</td>
            <td className="os-mono">{fmt(r.Date)}</td>
            <td className="os-muted">{fmt(r.Affiliate)}</td>
            <td className="os-muted">{fmt(r.Customer)}</td>
            <td className="os-mono">{gbp(r.Revenue)}</td>
            <td className="os-mono">{gbp(r.Commission)}</td>
            <td>{r.Status ? <span className={`os-pill ${affSc(r.Status)}`}>{r.Status}</span> : '—'}</td>
            <td>{(r['New Customer'] === true || r['New Customer'] === 'checked') ? <span className="os-pill pill-done">Yes</span> : '—'}</td>
            <td>{(r.Subscription === true || r.Subscription === 'checked') ? <span className="os-pill pill-progress">Sub</span> : '—'}</td>
          </tr>
        )}
        emptyMsg="No sales records."
      />
      {filtered.length > 300 && <p className="os-muted" style={{ marginTop: 8, fontSize: 12 }}>Showing 300 of {filtered.length} — use search to narrow.</p>}
    </>
  );
}

/* Payouts */
function AffPayoutsTab({ items }) {
  const editor = useStatusEditor(items, 'Payment Status');
  const payStatuses = useMemo(() => [...new Set(['Pending', 'Processing', 'Paid', 'On Hold', ...items.map(i => i['Payment Status']).filter(Boolean)])], [items]);
  const totDue  = items.reduce((s, i) => s + (Number(i['Amount Due']) || 0), 0);
  const totPaid = items.reduce((s, i) => s + (Number(i['Amount Paid']) || 0), 0);
  const pending = items.filter(i => (i['Payment Status'] || '').toLowerCase() === 'pending').length;
  if (!items.length) return <div className="os-empty">No payout records yet.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card"><div className="os-stat-num">{gbp(totDue)}</div><div className="os-stat-label">Total Due</div></div>
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{gbp(totPaid)}</div><div className="os-stat-label">Total Paid</div></div>
        {pending > 0 && <div className="os-stat-card os-stat-amber"><div className="os-stat-num">{pending}</div><div className="os-stat-label">Pending</div></div>}
      </div>
      {editor.updateError && <div className="os-alert-error" style={{ marginTop: 8 }}>{editor.updateError}</div>}
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Payout Ref', key: 'Payout Ref', w: 130 },
            { label: 'Affiliate', key: 'Affiliate', w: 140 },
            { label: 'Amount Due', key: 'Amount Due', type: 'number', w: 120 },
            { label: 'Amount Paid', key: 'Amount Paid', type: 'number', w: 120 },
            { label: 'Payment Date', key: 'Payment Date', type: 'date', w: 120 },
            { label: 'Method', key: 'Method', w: 110 },
            { label: 'Status', key: 'Payment Status', w: 120 },
            { label: 'Notes', key: 'Notes' },
          ]}
          data={editor.dataWithStatus}
          renderRow={p => (
            <tr key={p.id}>
              <td className="os-mono" style={{ fontSize: 11 }}>{fmt(p['Payout Ref'])}</td>
              <td className="os-muted">{fmt(p.Affiliate)}</td>
              <td className="os-mono">{gbp(p['Amount Due'])}</td>
              <td className="os-mono"><strong>{gbp(p['Amount Paid'])}</strong></td>
              <td className="os-mono">{fmt(p['Payment Date'])}</td>
              <td className="os-muted">{fmt(p.Method)}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={p} allStatuses={payStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} fieldName="Payment Status" />
              </td>
              <td className="os-muted" style={{ fontSize: 12 }}>{fmt(p.Notes)}</td>
            </tr>
          )}
          emptyMsg="No payouts."
        />
      </div>
    </>
  );
}

/* Traffic */
function AffTrafficTab({ items }) {
  if (!items.length) return <div className="os-empty">No traffic data yet.</div>;
  const totSessions = items.reduce((s, i) => s + (Number(i.Sessions) || 0), 0);
  const totOrders   = items.reduce((s, i) => s + (Number(i.Orders) || 0), 0);
  const totRev      = items.reduce((s, i) => s + (Number(i.Revenue) || 0), 0);
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card"><div className="os-stat-num">{totSessions.toLocaleString()}</div><div className="os-stat-label">Total Sessions</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{totOrders.toLocaleString()}</div><div className="os-stat-label">Total Orders</div></div>
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{gbp(totRev)}</div><div className="os-stat-label">Revenue Driven</div></div>
      </div>
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Affiliate', key: 'Affiliate Name' },
            { label: 'Sessions', key: 'Sessions', type: 'number', w: 100 },
            { label: 'Page Views', key: 'Page Views', type: 'number', w: 100 },
            { label: 'Orders', key: 'Orders', type: 'number', w: 80 },
            { label: 'Conv Rate', key: 'Conversion Rate', type: 'number', w: 100 },
            { label: 'Revenue', key: 'Revenue', type: 'number', w: 110 },
            { label: 'Last Session', key: 'Last Session', type: 'date', w: 120 },
          ]}
          data={items}
          renderRow={r => (
            <tr key={r.id}>
              <td><strong>{fmt(r['Affiliate Name'])}</strong></td>
              <td className="os-mono">{(r.Sessions || 0).toLocaleString()}</td>
              <td className="os-mono">{(r['Page Views'] || 0).toLocaleString()}</td>
              <td className="os-mono">{fmt(r.Orders)}</td>
              <td className="os-mono">{r['Conversion Rate'] ? `${r['Conversion Rate']}%` : '—'}</td>
              <td className="os-mono">{gbp(r.Revenue)}</td>
              <td className="os-mono">{fmt(r['Last Session'])}</td>
            </tr>
          )}
          emptyMsg="No traffic data."
        />
      </div>
    </>
  );
}

/* Products */
function AffProductsInnerTab({ items }) {
  if (!items.length) return <div className="os-empty">No affiliate product data yet.</div>;
  const totRev    = items.reduce((s, i) => s + (Number(i['Affiliate Revenue']) || 0), 0);
  const totOrders = items.reduce((s, i) => s + (Number(i['Affiliate Orders']) || 0), 0);
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{gbp(totRev)}</div><div className="os-stat-label">Affiliate Revenue</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{totOrders.toLocaleString()}</div><div className="os-stat-label">Affiliate Orders</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Products</div></div>
      </div>
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Product', key: 'Product' },
            { label: 'SKU', key: 'SKU', w: 110 },
            { label: 'Revenue', key: 'Affiliate Revenue', type: 'number', w: 120 },
            { label: 'Orders', key: 'Affiliate Orders', type: 'number', w: 90 },
            { label: 'Units', key: 'Units', type: 'number', w: 80 },
            { label: '# Affiliates', key: 'Affiliates Selling', type: 'number', w: 110 },
            { label: 'Concentration %', key: 'Concentration %', type: 'number', w: 130 },
            { label: 'Flag', key: 'Flag', w: 100 },
          ]}
          data={items}
          renderRow={r => (
            <tr key={r.id}>
              <td><strong>{fmt(r.Product)}</strong></td>
              <td className="os-mono" style={{ fontSize: 11 }}>{fmt(r.SKU)}</td>
              <td className="os-mono">{gbp(r['Affiliate Revenue'])}</td>
              <td className="os-mono">{fmt(r['Affiliate Orders'])}</td>
              <td className="os-mono">{fmt(r.Units)}</td>
              <td className="os-mono">{fmt(r['Affiliates Selling'])}</td>
              <td className="os-mono">{r['Concentration %'] ? `${r['Concentration %']}%` : '—'}</td>
              <td>{r.Flag ? <span className="os-pill pill-blocked">{r.Flag}</span> : '—'}</td>
            </tr>
          )}
          emptyMsg="No product data."
        />
      </div>
    </>
  );
}

/* Tasks */
function AffTasksInnerTab({ items }) {
  const editor = useStatusEditor(items);
  const taskStatuses = useMemo(() => [...new Set(['To Do', 'In Progress', 'Done', 'Blocked', ...items.map(i => i.Status).filter(Boolean)])], [items]);
  const open = editor.dataWithStatus.filter(i => !['Done', 'Complete', 'Completed', 'Closed'].includes(i.Status));
  if (!items.length) return <div className="os-empty">No affiliate tasks yet.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className={`os-stat-card${open.length > 0 ? ' os-stat-amber' : ' os-stat-green'}`}><div className="os-stat-num">{open.length}</div><div className="os-stat-label">Open Tasks</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Total</div></div>
      </div>
      {editor.updateError && <div className="os-alert-error" style={{ marginTop: 8 }}>{editor.updateError}</div>}
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Task', key: 'Task' },
            { label: 'Priority', key: 'Priority', w: 100 },
            { label: 'Category', key: 'Category', w: 130 },
            { label: 'Affiliate', key: 'Affiliate', w: 140 },
            { label: 'Status', key: 'Status', w: 120 },
          ]}
          data={editor.dataWithStatus}
          sinkCompleted="Status"
          renderRow={t => (
            <tr key={t.id}>
              <td><strong>{fmt(t.Task)}</strong>{t.Details && <p className="os-table-note">{t.Details}</p>}</td>
              <td>{t.Priority ? <span className={`os-pill ${t.Priority === 'High' ? 'pill-blocked' : t.Priority === 'Medium' ? 'pill-progress' : 'pill-todo'}`}>{t.Priority}</span> : '—'}</td>
              <td className="os-muted">{fmt(t.Category)}</td>
              <td className="os-muted">{fmt(t.Affiliate)}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={t} allStatuses={taskStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
              </td>
            </tr>
          )}
          emptyMsg="No tasks."
        />
      </div>
    </>
  );
}

/* Outer wrapper — manages inner sub-tabs */
function AffiliatesTab({ items, affPerformance = [], affSales = [], affPayouts = [], affTraffic = [], affTasks = [], affProducts = [] }) {
  const [sub, setSub] = useState('Programme');
  return (
    <>
      <div className="os-subnav-inner" style={{ marginBottom: 20, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {AFF_SUBS.map(s => (
          <button key={s} className={`os-subnav-btn${sub === s ? ' active' : ''}`} onClick={() => setSub(s)} style={{ fontSize: 12, padding: '4px 12px' }}>{s}</button>
        ))}
      </div>
      {sub === 'Programme'   && <AffProgrammeTab items={items} />}
      {sub === 'Performance' && <AffPerformanceTab items={affPerformance} />}
      {sub === 'Sales'       && <AffSalesTab items={affSales} />}
      {sub === 'Payouts'     && <AffPayoutsTab items={affPayouts} />}
      {sub === 'Traffic'     && <AffTrafficTab items={affTraffic} />}
      {sub === 'Products'    && <AffProductsInnerTab items={affProducts} />}
      {sub === 'Tasks'       && <AffTasksInnerTab items={affTasks} />}
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
  const editor = useStatusEditor(items);
  const mktStatuses = useMemo(() => [...new Set([...BASE_STATUSES, ...items.map(m => m.Status).filter(Boolean)])], [items]);
  return (
    <SortableTable
      cols={[
        { label: 'Campaign', key: 'Campaign / Launch Name' },
        { label: 'Type', key: 'Type', w: 110 },
        { label: 'Status', key: 'Status', w: 120 },
        { label: 'Owner', key: 'Owner', w: 110 },
        { label: 'Start', key: 'Start Date', type: 'date', w: 100 },
        { label: 'End', key: 'End Date', type: 'date', w: 100 },
        { label: 'Budget', key: 'Budget (£)', type: 'number', w: 100 },
        { label: 'Revenue', key: 'Revenue Generated (£)', type: 'number', w: 110 },
      ]}
      data={editor.dataWithStatus}
      renderRow={m => (
        <tr key={m.id}>
          <td><strong>{fmt(m['Campaign / Launch Name'])}</strong></td>
          <td className="os-muted">{fmt(m.Type)}</td>
          <td onClick={e => e.stopPropagation()}>
            <StatusSelect record={m} allStatuses={mktStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
          </td>
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
function SubscriptionsTab({ items, subscribers = [] }) {
  const [subTab, setSubTab] = useState('Subscribers');
  const editor = useStatusEditor(items);
  const subStatuses = useMemo(() => [...new Set([...BASE_STATUSES, ...items.map(s => s.Status).filter(Boolean)])], [items]);
  const totalSubs = items.reduce((s, i) => s + (Number(i['Active Subscribers']) || 0), 0);
  const mrr = items.reduce((s, i) => s + (Number(i['Monthly Revenue £']) || 0), 0);
  const activeCount = subscribers.filter(s => s.Status === 'Active').length;

  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{activeCount || totalSubs}</div><div className="os-stat-label">Active Subscribers</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{items.length}</div><div className="os-stat-label">Plans</div></div>
        <div className="os-stat-card"><div className="os-stat-num">{gbp(mrr)}</div><div className="os-stat-label">Monthly Revenue</div></div>
      </div>
      <div className="os-subtab-row" style={{ marginTop: 20, marginBottom: 16, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {['Subscribers', 'Plans'].map(t => (
          <button key={t} className={`os-subtab-btn${subTab === t ? ' active' : ''}`} onClick={() => setSubTab(t)}>{t}</button>
        ))}
      </div>

      {subTab === 'Subscribers' && (
        subscribers.length === 0
          ? <div className="os-empty">No individual subscribers logged yet. Add them via the <strong>🔄 Subscribers UK</strong> table in Airtable, or wait for the email capture scheduler to populate from Recharge emails.</div>
          : <SortableTable
              cols={[
                { label: 'Name', key: 'Subscriber Name' },
                { label: 'Email', key: 'Email' },
                { label: 'Product', key: 'Product', w: 160 },
                { label: 'Plan', key: 'Plan Name', w: 150 },
                { label: 'Billing', key: 'Billing Frequency', w: 130 },
                { label: 'Monthly £', key: 'Monthly Value £', type: 'number', w: 110 },
                { label: 'Next Bill', key: 'Next Billing Date', w: 110 },
                { label: 'Orders', key: 'Total Orders', type: 'number', w: 80 },
                { label: 'Status', key: 'Status', w: 120 },
              ]}
              data={subscribers}
              renderRow={s => (
                <tr key={s.id}>
                  <td><strong>{fmt(s['Subscriber Name'])}</strong></td>
                  <td className="os-muted os-mono" style={{ fontSize: 12 }}>{fmt(s.Email)}</td>
                  <td className="os-muted">{fmt(s.Product)}{s.SKU ? ` · ${s.SKU}` : ''}</td>
                  <td className="os-muted">{fmt(s['Plan Name'])}</td>
                  <td className="os-muted">{fmt(s['Billing Frequency'])}</td>
                  <td className="os-mono">{gbp(s['Monthly Value £'])}</td>
                  <td className="os-mono os-muted">{fmt(s['Next Billing Date'])}</td>
                  <td className="os-mono">{fmt(s['Total Orders'])}</td>
                  <td>
                    {s.Status === 'Active' && <span className="os-pill pill-done">Active</span>}
                    {s.Status === 'Paused' && <span className="os-pill pill-review">Paused</span>}
                    {s.Status === 'Cancelled' && <span className="os-pill pill-risk">Cancelled</span>}
                    {s.Status === 'Failed Payment' && <span className="os-pill pill-risk">Failed Payment</span>}
                    {!s.Status && <span className="os-muted">—</span>}
                  </td>
                </tr>
              )}
              emptyMsg="No subscribers found."
            />
      )}

      {subTab === 'Plans' && (
        items.length === 0
          ? <div className="os-empty">No subscription plans yet.</div>
          : <SortableTable
              cols={[
                { label: 'Plan', key: 'Plan Name' },
                { label: 'Product / SKU', key: 'Product', w: 160 },
                { label: 'Subscribers', key: 'Active Subscribers', type: 'number', w: 120 },
                { label: 'Monthly Rev', key: 'Monthly Revenue £', type: 'number', w: 130 },
                { label: 'Status', key: 'Status', w: 120 },
              ]}
              data={editor.dataWithStatus}
              renderRow={s => (
                <tr key={s.id}>
                  <td><strong>{fmt(s['Plan Name'])}</strong></td>
                  <td className="os-muted">{fmt(s.Product)}{s.SKU ? ` · ${s.SKU}` : ''}</td>
                  <td className="os-mono">{fmt(s['Active Subscribers'])}</td>
                  <td className="os-mono">{gbp(s['Monthly Revenue £'])}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <StatusSelect record={s} allStatuses={subStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
                  </td>
                </tr>
              )}
              emptyMsg="No subscription plans yet."
            />
      )}
    </>
  );
}

/* ── Customer Service ─────────────────────────── */
function CSTab({ items }) {
  const editor = useStatusEditor(items);
  const csStatuses = useMemo(() => [...new Set(['Open', 'In Progress', 'Resolved', 'Closed', ...BASE_STATUSES, ...items.map(i => i.Status).filter(Boolean)])], [items]);
  const open = editor.dataWithStatus.filter(i => !['Resolved', 'Closed', 'Done'].includes(i.Status));
  if (!items.length) return <div className="os-empty">No CS tickets.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card os-stat-red"><div className="os-stat-num">{open.length}</div><div className="os-stat-label">Open</div></div>
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{editor.dataWithStatus.length - open.length}</div><div className="os-stat-label">Resolved</div></div>
      </div>
      {editor.updateError && <div className="os-alert-error" style={{ marginTop: 8 }}>{editor.updateError}</div>}
      <div style={{ marginTop: 24 }}>
        <SortableTable
          cols={[
            { label: 'Reference', key: 'Issue Reference' },
            { label: 'Customer', key: 'Customer Name', w: 130 },
            { label: 'Category', key: 'Category', w: 130 },
            { label: 'Status', key: 'Status', w: 120 },
            { label: 'Owner', key: 'Owner', w: 110 },
            { label: 'Raised', key: 'Date Raised', type: 'date', w: 100 },
          ]}
          data={editor.dataWithStatus}
          renderRow={t => (
            <tr key={t.id}>
              <td><strong>{fmt(t['Issue Reference'])}</strong></td>
              <td className="os-muted">{fmt(t['Customer Name'])}</td>
              <td className="os-muted">{fmt(t.Category)}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={t} allStatuses={csStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
              </td>
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

/* ── Amazon Finance ───────────────────────────── */
function AmazonFinanceTab({ reconcile, disbursements = [] }) {
  const [sub, setSub] = useState('Disbursements');
  const reconcileEditor = useStatusEditor(reconcile);
  const finStatuses = useMemo(() => [...new Set(['Pending', 'Reconciled', 'Paid', 'Under Review', ...BASE_STATUSES])], []);

  const amazonRecon = useMemo(
    () => reconcileEditor.dataWithStatus.filter(r => r.Channel === 'Amazon UK'),
    [reconcileEditor.dataWithStatus]
  );

  // KPIs from disbursements
  const disbKpis = useMemo(() => {
    const complete  = disbursements.filter(d => (d.Status || '').includes('Complete'));
    const pending   = disbursements.filter(d => (d.Status || '').includes('Pending'));
    const totPaid   = complete.reduce((s, d) => s + (Number(d['Amount (£)']) || 0), 0);
    const totPend   = pending.reduce((s, d) => s + (Number(d['Amount (£)']) || 0), 0);
    return { totPaid, totPend, completeCount: complete.length, pendingCount: pending.length };
  }, [disbursements]);

  return (
    <>
      {/* KPI tiles */}
      <div className="orders-kpi-row" style={{ marginTop: 12 }}>
        <div className="orders-kpi-card">
          <div className="orders-kpi-num">{gbp(disbKpis.totPaid)}</div>
          <div className="orders-kpi-label">DISBURSED</div>
          <div className="orders-kpi-sub">{disbKpis.completeCount} payment{disbKpis.completeCount !== 1 ? 's' : ''}</div>
        </div>
        {disbKpis.totPend > 0 && (
          <div className="orders-kpi-card" style={{ borderColor: 'var(--amber)' }}>
            <div className="orders-kpi-num" style={{ color: 'var(--amber)' }}>{gbp(disbKpis.totPend)}</div>
            <div className="orders-kpi-label">PENDING</div>
            <div className="orders-kpi-sub">{disbKpis.pendingCount} payment{disbKpis.pendingCount !== 1 ? 's' : ''}</div>
          </div>
        )}
      </div>

      <div className="os-sub-tabs" style={{ marginTop: 16, overflowX: 'auto', display: 'flex', flexWrap: 'nowrap', gap: 4 }}>
        {['Disbursements', 'Reconciliation'].map(s => (
          <button key={s} className={`os-sub-tab${sub === s ? ' active' : ''}`} onClick={() => setSub(s)}>{s}</button>
        ))}
      </div>

      {/* ── Disbursements ── */}
      {sub === 'Disbursements' && (
        disbursements.length === 0
          ? <div className="os-empty" style={{ marginTop: 16 }}>No disbursement records yet. Add Amazon payout events to the Amazon UK — Finance / Disbursements table in Airtable.</div>
          : (
            <SortableTable
              cols={[
                { label: 'Date', key: 'Disbursement Date', type: 'date', w: 110 },
                { label: 'Amount (£)', key: 'Amount (£)', type: 'number', w: 130 },
                { label: 'MTD Total (£)', key: 'Running MTD Total (£)', type: 'number', w: 140 },
                { label: 'Bank Account', key: 'Bank Account', w: 120 },
                { label: 'Expected Arrival', key: 'Expected Arrival', w: 130 },
                { label: 'Month', key: 'Month', w: 100 },
                { label: 'Status', key: 'Status', w: 130 },
                { label: 'Notes', key: 'Notes' },
              ]}
              data={disbursements}
              renderRow={d => (
                <tr key={d.id}>
                  <td className="os-mono">{fmt(d['Disbursement Date'])}</td>
                  <td className="os-mono"><strong>{gbp(d['Amount (£)'])}</strong></td>
                  <td className="os-mono">{gbp(d['Running MTD Total (£)'])}</td>
                  <td className="os-muted">···{fmt(d['Bank Account'])}</td>
                  <td className="os-mono">{fmt(d['Expected Arrival'])}</td>
                  <td className="os-muted">{fmt(d.Month)}</td>
                  <td>
                    {d.Status
                      ? <span className={`os-pill ${d.Status.includes('Complete') ? 'pill-done' : 'pill-todo'}`}>{d.Status}</span>
                      : '—'}
                  </td>
                  <td className="os-muted" style={{ fontSize: 12 }}>{fmt(d.Notes)}</td>
                </tr>
              )}
              emptyMsg="No disbursements."
            />
          )
      )}

      {/* ── Reconciliation (Amazon UK channel only) ── */}
      {sub === 'Reconciliation' && (
        amazonRecon.length === 0
          ? <div className="os-empty" style={{ marginTop: 16 }}>No Amazon UK reconciliation records. Add records with Channel = "Amazon UK" to the Reconciliation table in Airtable.</div>
          : (
            <SortableTable
              cols={[
                { label: 'Period', key: 'Period' },
                { label: 'Gross', key: 'Gross Revenue (£)', type: 'number', w: 100 },
                { label: 'Discounts', key: 'Discounts (£)', type: 'number', w: 90 },
                { label: 'Refunds', key: 'Refunds (£)', type: 'number', w: 90 },
                { label: 'Fees', key: 'Platform Fees (£)', type: 'number', w: 90 },
                { label: 'Net', key: 'Net Revenue (£)', type: 'number', w: 100 },
                { label: 'Variance', key: 'Variance (£)', type: 'number', w: 90 },
                { label: 'Status', key: 'Status', w: 120 },
              ]}
              data={amazonRecon}
              renderRow={r => (
                <tr key={r.id}>
                  <td><strong>{fmt(r.Period)}</strong></td>
                  <td className="os-mono">{gbp(r['Gross Revenue (£)'])}</td>
                  <td className="os-mono">{gbp(r['Discounts (£)'])}</td>
                  <td className="os-mono">{gbp(r['Refunds (£)'])}</td>
                  <td className="os-mono">{gbp(r['Platform Fees (£)'])}</td>
                  <td className="os-mono"><strong>{gbp(r['Net Revenue (£)'])}</strong></td>
                  <td className="os-mono">{gbp(r['Variance (£)'])}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <StatusSelect record={r} allStatuses={finStatuses} handleStatusChange={reconcileEditor.handleStatusChange} saving={reconcileEditor.saving} />
                  </td>
                </tr>
              )}
              emptyMsg="No reconciliation records."
            />
          )
      )}
    </>
  );
}

/* ── Finance ──────────────────────────────────── */
function FinanceTab({ reconcile, software, payouts, payoutsCsv = [], serverTime, billing = [], atSalesByProduct = [] }) {
  const [sub, setSub] = useState('Shopify Payments');
  const reconcileEditor = useStatusEditor(reconcile);
  const payoutsEditor   = useStatusEditor(payouts);
  const softwareEditor  = useStatusEditor(software);
  const finStatuses = useMemo(() => [...new Set(['Pending', 'Reconciled', 'Paid', 'Under Review', 'Active', 'Cancelled', ...BASE_STATUSES])], []);

  // MTD + 7-day computed from payoutsCsv
  const payoutKpis = useMemo(() => {
    const today = new Date(serverTime || Date.now());
    const mtdStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const d7Start  = new Date(today); d7Start.setDate(today.getDate() - 6);
    const inRange  = (d, from) => { const dt = new Date(d); return dt >= from && dt <= today; };
    const sum      = (rows, from) => rows.filter(r => inRange(r.date, from) && r.status === 'paid')
      .reduce((a, r) => ({ charges: a.charges + r.charges, fees: a.fees + r.fees, net: a.net + Math.abs(r.total) }), { charges: 0, fees: 0, net: 0 });
    const mtd = sum(payoutsCsv, mtdStart);
    const d7  = sum(payoutsCsv, d7Start);
    const transit = payoutsCsv.filter(r => r.status === 'in_transit').reduce((s, r) => s + Math.abs(r.total), 0);
    const feeRate = mtd.charges > 0 ? ((mtd.fees / mtd.charges) * 100).toFixed(1) : '—';
    return { mtd, d7, transit, feeRate };
  }, [payoutsCsv]);

  const anyError = reconcileEditor.updateError || payoutsEditor.updateError || softwareEditor.updateError;
  return (
    <>
      <div className="os-sub-tabs" style={{ overflowX: 'auto', display: 'flex', flexWrap: 'nowrap', gap: 4 }}>
        {['Shopify Payments', 'Reconciliation', 'Payouts', 'Software', 'Billing & Fees', 'Sales by Product'].map(s => (
          <button key={s} className={`os-sub-tab${sub === s ? ' active' : ''}`} onClick={() => setSub(s)}>{s}</button>
        ))}
      </div>
      {anyError && <div className="os-alert-error" style={{ marginTop: 8 }}>{anyError}</div>}

      {/* ── Shopify Payments (CSV export) ── */}
      {sub === 'Shopify Payments' && (
        payoutsCsv.length === 0
          ? <div className="wh-banner" style={{ marginTop: 12 }}><div className="wh-banner-inner"><span className="wh-banner-label">No payout data</span><span className="wh-banner-sub">Replace data/shopify-payouts.csv and redeploy.</span></div></div>
          : (
            <>
              {/* KPI tiles */}
              <div className="orders-kpi-row" style={{ marginTop: 12 }}>
                <div className="orders-kpi-card">
                  <div className="orders-kpi-num">{gbp0(payoutKpis.mtd.charges)}</div>
                  <div className="orders-kpi-label">MTD CHARGES</div>
                </div>
                <div className="orders-kpi-card">
                  <div className="orders-kpi-num" style={{ color: 'var(--red)' }}>{gbp(payoutKpis.mtd.fees)}</div>
                  <div className="orders-kpi-label">MTD FEES</div>
                  <div className="orders-kpi-sub">{payoutKpis.feeRate}% rate</div>
                </div>
                <div className="orders-kpi-card">
                  <div className="orders-kpi-num">{gbp0(payoutKpis.mtd.net)}</div>
                  <div className="orders-kpi-label">MTD NET TO BANK</div>
                </div>
                <div className="orders-kpi-card">
                  <div className="orders-kpi-num">{gbp0(payoutKpis.d7.charges)}</div>
                  <div className="orders-kpi-label">7-DAY CHARGES</div>
                </div>
                <div className="orders-kpi-card">
                  <div className="orders-kpi-num">{gbp0(payoutKpis.d7.net)}</div>
                  <div className="orders-kpi-label">7-DAY NET</div>
                </div>
                {payoutKpis.transit > 0 && (
                  <div className="orders-kpi-card" style={{ borderColor: 'var(--amber)' }}>
                    <div className="orders-kpi-num" style={{ color: 'var(--amber)' }}>{gbp0(payoutKpis.transit)}</div>
                    <div className="orders-kpi-label">IN TRANSIT</div>
                  </div>
                )}
              </div>

              {/* Payout history table */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <button className="os-sub-tab" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => downloadCSV(payoutsCsv, 'shopify-payouts-export')}>↓ CSV</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
              <table className="os-table" style={{ marginTop: 0 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{ width: 100 }}>Status</th>
                    <th style={{ textAlign: 'right', width: 110 }}>Charges</th>
                    <th style={{ textAlign: 'right', width: 90 }}>Refunds</th>
                    <th style={{ textAlign: 'right', width: 90 }}>Fees</th>
                    <th style={{ textAlign: 'right', width: 110 }}>Net Payout</th>
                    <th>Bank Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutsCsv.map(p => (
                    <tr key={p.id}>
                      <td className="os-mono">{p.date}</td>
                      <td><span className={`os-pill ${p.status === 'paid' ? 'sc-green' : p.status === 'in_transit' ? 'sc-amber' : 'sc-grey'}`}>{p.status.replace('_', ' ').toUpperCase()}</span></td>
                      <td className="os-mono" style={{ textAlign: 'right' }}>{gbp(p.charges)}</td>
                      <td className="os-mono" style={{ textAlign: 'right' }}>{p.refunds > 0 ? <span style={{ color: 'var(--red)' }}>-{gbp(p.refunds)}</span> : '—'}</td>
                      <td className="os-mono" style={{ textAlign: 'right' }}><span style={{ color: 'var(--red)' }}>{gbp(p.fees)}</span></td>
                      <td className="os-mono" style={{ textAlign: 'right' }}><strong style={{ color: p.total < 0 ? 'var(--red)' : undefined }}>{gbp(Math.abs(p.total))}</strong></td>
                      <td className="os-muted" style={{ fontSize: '0.78rem' }}>{p.bankRef || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )
      )}

      {sub === 'Reconciliation' && (() => {
        const recData = reconcileEditor.dataWithStatus.filter(r => r.Channel === 'Shopify UK' || !r.Channel);
        return (<>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button className="os-sub-tab" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => downloadCSV(recData, 'shopify-reconciliation')}>↓ CSV</button>
          </div>
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
            { label: 'Status', key: 'Status', w: 120 },
          ]}
          data={recData}
          renderRow={r => (
            <tr key={r.id}>
              <td><strong>{fmt(r.Period)}</strong></td>
              <td className="os-muted">{fmt(r.Channel)}</td>
              <td className="os-mono">{gbp(r['Gross Revenue (£)'])}</td>
              <td className="os-mono">{gbp(r['Discounts (£)'])}</td>
              <td className="os-mono">{gbp(r['Refunds (£)'])}</td>
              <td className="os-mono">{gbp(r['Platform Fees (£)'])}</td>
              <td className="os-mono"><strong>{gbp(r['Net Revenue (£)'])}</strong></td>
              <td className="os-mono" style={{ color: Number(r['Variance (£)']) < 0 ? '#dc2626' : Number(r['Variance (£)']) > 0 ? '#16a34a' : undefined }}>{gbp(r['Variance (£)'])}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={r} allStatuses={finStatuses} handleStatusChange={reconcileEditor.handleStatusChange} saving={reconcileEditor.saving} />
              </td>
            </tr>
          )}
          emptyMsg="No reconciliation records."
        />
        </>);
      })()}

      {sub === 'Payouts' && (() => {
        const payData = payoutsEditor.dataWithStatus;
        return (<>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button className="os-sub-tab" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => downloadCSV(payData, 'shopify-payouts-airtable')}>&#8595; CSV</button>
          </div>
          <SortableTable
          cols={[
            { label: 'Reference', key: 'Payout Reference' },
            { label: 'Date', key: 'Payout Date', type: 'date', w: 110 },
            { label: 'Gross', key: 'Gross Amount (£)', type: 'number', w: 100 },
            { label: 'Fees', key: 'Fees Deducted (£)', type: 'number', w: 90 },
            { label: 'Net Payout', key: 'Net Payout (£)', type: 'number', w: 110 },
            { label: 'Status', key: 'Status', w: 120 },
          ]}
          data={payData}
          renderRow={p => (
            <tr key={p.id}>
              <td><strong>{fmt(p['Payout Reference'])}</strong></td>
              <td className="os-mono">{fmt(p['Payout Date'])}</td>
              <td className="os-mono">{gbp(p['Gross Amount (£)'])}</td>
              <td className="os-mono" style={{ color: '#dc2626' }}>{gbp(p['Fees Deducted (£)'])}</td>
              <td className="os-mono"><strong style={{ color: '#16a34a' }}>{gbp(p['Net Payout (£)'])}</strong></td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={p} allStatuses={finStatuses} handleStatusChange={payoutsEditor.handleStatusChange} saving={payoutsEditor.saving} />
              </td>
            </tr>
          )}
          emptyMsg="No payouts."
        />
        </>);
      })()}

      {sub === 'Software' && (
        <SortableTable
          cols={[
            { label: 'Platform', key: 'Platform' },
            { label: 'Cost/mo', key: 'Cost (£)', type: 'number', w: 90 },
            { label: 'Annual', key: 'Annual Cost (£)', type: 'number', w: 100 },
            { label: 'Billing', key: 'Billing Frequency', w: 110 },
            { label: 'Renewal', key: 'Renewal Date', type: 'date', w: 110 },
            { label: 'Department', key: 'Department', w: 120 },
            { label: 'Status', key: 'Status', w: 120 },
          ]}
          data={softwareEditor.dataWithStatus}
          renderRow={s => (
            <tr key={s.id}>
              <td><strong>{fmt(s.Platform)}</strong></td>
              <td className="os-mono">{gbp(s['Cost (£)'])}</td>
              <td className="os-mono">{gbp(s['Annual Cost (£)'])}</td>
              <td className="os-muted">{fmt(s['Billing Frequency'])}</td>
              <td className="os-mono">{fmt(s['Renewal Date'])}</td>
              <td className="os-muted">{fmt(s.Department)}</td>
              <td onClick={e => e.stopPropagation()}>
                <StatusSelect record={s} allStatuses={finStatuses} handleStatusChange={softwareEditor.handleStatusChange} saving={softwareEditor.saving} />
              </td>
            </tr>
          )}
          emptyMsg="No software costs logged."
        />
      )}

      {/* ── Billing & Fees ── */}
      {sub === 'Billing & Fees' && (
        billing.length === 0
          ? <div className="os-empty" style={{ marginTop: 16 }}>No billing records yet. Add invoices to the Shopify Billing &amp; Fees table in Airtable.</div>
          : (
            <>
              <div className="os-stat-row" style={{ marginTop: 16 }}>
                <div className="os-stat-card"><div className="os-stat-num">{gbp(billing.reduce((s,r) => s + (Number(r['Total Cost']) || 0), 0))}</div><div className="os-stat-label">Total Billed</div></div>
                <div className="os-stat-card"><div className="os-stat-num">{gbp(billing.reduce((s,r) => s + (Number(r['Plan Charges']) || 0), 0))}</div><div className="os-stat-label">Plan Charges</div></div>
                <div className="os-stat-card"><div className="os-stat-num">{gbp(billing.reduce((s,r) => s + (Number(r['App Charges']) || 0), 0))}</div><div className="os-stat-label">App Charges</div></div>
              </div>
              <SortableTable
                cols={[
                  { label: 'Invoice #', key: 'Invoice Number', w: 130 },
                  { label: 'Date', key: 'Invoice Date', type: 'date', w: 110 },
                  { label: 'Plan (£)', key: 'Plan Charges', type: 'number', w: 100 },
                  { label: 'Apps (£)', key: 'App Charges', type: 'number', w: 100 },
                  { label: 'Usage (£)', key: 'Usage Charges', type: 'number', w: 100 },
                  { label: 'VAT (£)', key: 'VAT', type: 'number', w: 80 },
                  { label: 'Total (£)', key: 'Total Cost', type: 'number', w: 100 },
                  { label: 'Status', key: 'Status', w: 110 },
                  { label: 'Link', key: 'Invoice Link', w: 80 },
                ]}
                data={billing}
                renderRow={r => (
                  <tr key={r.id}>
                    <td className="os-mono" style={{ fontSize: 11 }}>{fmt(r['Invoice Number'])}</td>
                    <td className="os-mono">{fmt(r['Invoice Date'])}</td>
                    <td className="os-mono">{gbp(r['Plan Charges'])}</td>
                    <td className="os-mono">{gbp(r['App Charges'])}</td>
                    <td className="os-mono">{gbp(r['Usage Charges'])}</td>
                    <td className="os-mono">{gbp(r.VAT)}</td>
                    <td className="os-mono"><strong>{gbp(r['Total Cost'])}</strong></td>
                    <td>{r.Status ? <span className={`os-pill ${scShared(r.Status)}`}>{r.Status}</span> : '—'}</td>
                    <td>{r['Invoice Link'] ? <a href={r['Invoice Link']} target="_blank" rel="noopener" style={{ color: 'var(--forest-600)', fontSize: 12 }}>View</a> : '—'}</td>
                  </tr>
                )}
                emptyMsg="No billing records."
              />
            </>
          )
      )}

      {/* ── Sales by Product ── */}
      {sub === 'Sales by Product' && (
        atSalesByProduct.length === 0
          ? <div className="os-empty" style={{ marginTop: 16 }}>No sales by product records yet. Add entries to the Shopify Sales by Product table in Airtable.</div>
          : (
            <>
              <div className="os-stat-row" style={{ marginTop: 16 }}>
                <div className="os-stat-card"><div className="os-stat-num">{gbp(atSalesByProduct.reduce((s,r) => s + (Number(r['Net Sales (£)']) || 0), 0))}</div><div className="os-stat-label">Net Sales</div></div>
                <div className="os-stat-card"><div className="os-stat-num">{atSalesByProduct.reduce((s,r) => s + (Number(r['Units Sold']) || 0), 0).toLocaleString()}</div><div className="os-stat-label">Units Sold</div></div>
              </div>
              <SortableTable
                cols={[
                  { label: 'SKU', key: 'SKU', w: 110 },
                  { label: 'Product', key: 'Product' },
                  { label: 'Period', key: 'Period', w: 110 },
                  { label: 'Units', key: 'Units Sold', type: 'number', w: 80 },
                  { label: 'Gross (£)', key: 'Gross Sales (£)', type: 'number', w: 110 },
                  { label: 'Discounts', key: 'Discounts (£)', type: 'number', w: 110 },
                  { label: 'Refunds', key: 'Refunds (£)', type: 'number', w: 100 },
                  { label: 'Net (£)', key: 'Net Sales (£)', type: 'number', w: 110 },
                  { label: '% Total', key: '% of Total Revenue', type: 'number', w: 80 },
                  { label: 'Status', key: 'Status', w: 110 },
                ]}
                data={atSalesByProduct}
                renderRow={r => (
                  <tr key={r.id}>
                    <td className="os-mono" style={{ fontSize: 11 }}>{fmt(r.SKU)}</td>
                    <td><strong>{fmt(r.Product)}</strong></td>
                    <td className="os-mono">{fmt(r.Period)}</td>
                    <td className="os-mono">{fmt(r['Units Sold'])}</td>
                    <td className="os-mono">{gbp(r['Gross Sales (£)'])}</td>
                    <td className="os-mono">{gbp(r['Discounts (£)'])}</td>
                    <td className="os-mono">{gbp(r['Refunds (£)'])}</td>
                    <td className="os-mono"><strong>{gbp(r['Net Sales (£)'])}</strong></td>
                    <td className="os-mono">{r['% of Total Revenue'] ? `${r['% of Total Revenue']}%` : '—'}</td>
                    <td>{r.Status ? <span className={`os-pill ${scShared(r.Status)}`}>{r.Status}</span> : '—'}</td>
                  </tr>
                )}
                emptyMsg="No sales by product data."
              />
            </>
          )
      )}
    </>
  );
}

/* ── Reporting ────────────────────────────────── */
function ReportingTab({ items }) {
  const editor = useStatusEditor(items);
  const rptStatuses = useMemo(() => [...new Set(['Draft', 'In Review', 'Approved', 'Done', ...BASE_STATUSES, ...items.map(r => r.Status).filter(Boolean)])], [items]);
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
        { label: 'Status', key: 'Status', w: 120 },
      ]}
      data={editor.dataWithStatus}
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
          <td onClick={e => e.stopPropagation()}>
            <StatusSelect record={r} allStatuses={rptStatuses} handleStatusChange={editor.handleStatusChange} saving={editor.saving} />
          </td>
        </tr>
      )}
      emptyMsg="No reporting data yet."
    />
  );
}

/* ── Page ─────────────────────────────────────── */
export default function UKPage({ tasks, priorities, risks, amazon, catalogue, shopifyProducts, orders, ordersSource, salesByProduct, dailySales, discounts, refunds, payouts, payoutsCsv, soh, sohSource = 'airtable', inbound, b2b, customers, affiliates, emailList, marketing, subscriptions, subscribers = [], cs, reconcile, software, reporting, products, ppc = [], disbursements = [], reviews = [], bionature = [], billing = [], atSalesByProduct = [], affPerformance = [], affSales = [], affPayouts = [], affTraffic = [], affTasks = [], affProducts = [], error, serverTime }) {
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
          {tab === 'Orders'           && <OrdersTab orders={orders} ordersSource={ordersSource} discounts={discounts} refunds={refunds} salesByProduct={salesByProduct} dailySales={dailySales || []} />}
          {tab === 'Shopify'          && <ShopifyTab products={shopifyProducts} />}
          {tab === 'Customers'        && <CustomersTab items={customers} />}
          {tab === 'B2B'              && <B2BTab items={b2b} />}
          {tab === 'Affiliates'       && <AffiliatesTab items={affiliates} affPerformance={affPerformance} affSales={affSales} affPayouts={affPayouts} affTraffic={affTraffic} affTasks={affTasks} affProducts={affProducts} />}
          {tab === 'Email / Klaviyo'  && <EmailTab items={emailList} />}
          {tab === 'Marketing'        && <MarketingTab items={marketing} />}
          {tab === 'Subscriptions'    && <SubscriptionsTab items={subscriptions} subscribers={subscribers} />}
          {tab === 'Customer Service' && <CSTab items={cs} />}
          {tab === 'Finance' && section === 'Shopify UK' && <FinanceTab reconcile={reconcile} software={software} payouts={payouts} payoutsCsv={payoutsCsv || []} serverTime={serverTime} billing={billing} atSalesByProduct={atSalesByProduct} />}
          {tab === 'Finance' && section === 'Amazon UK'  && <AmazonFinanceTab reconcile={reconcile} disbursements={disbursements} />}
          {tab === 'Amazon UK'        && <AmazonTab fba={amazon} catalogue={catalogue} tasks={tasks} priorities={priorities} marketing={marketing} inbound={inbound} reporting={reporting} ppc={ppc} reviews={reviews} />}
          {tab === 'Google'           && <GoogleTab section={section} />}
          {tab === 'Stock on Hand'    && <SOHTab soh={soh} sohSource={sohSource} />}
          {tab === 'Inbound Stock'    && <InboundTab inbound={inbound} />}
          {tab === 'Bionature Batch'  && <BionatureTab items={bionature} />}
        </div>
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  const safe = p => p.catch(e => { console.warn('[uk] fetch partial fail:', e.message); return []; });

  const [tasks, priorities, risks, amazon, catalogue, shopifyProducts, airtableOrders, discounts, refunds, payouts, soh, inbound, b2b, customers, affiliates, emailList, marketing, subscriptions, cs, reconcile, software, reporting, products, ppc, disbursements, reviews, bionature, billing, atSalesByProduct, affPerformance, affSales, affPayouts, affTraffic, affTasks, affProducts, subscribers] = await Promise.all([
    safe(getUKTasks()), safe(getUKPriorities()), safe(getUKRisks()),
    safe(getUKAmazon()), safe(getUKAmazonCat()),
    safe(getUKShopify()), safe(getUKOrders()), safe(getUKDiscounts()), safe(getUKRefunds()), safe(getUKPayouts()),
    safe(getUKStock()), safe(getUKInbound()),
    safe(getUKB2B()), safe(getUKCustomers()), safe(getUKAffiliates()), safe(getUKEmailList()),
    safe(getUKMarketing()), safe(getUKSubscriptions()), safe(getUKCS()),
    safe(getUKReconcile()), safe(getUKSoftware()), safe(getUKReporting()),
    safe(getProducts()), safe(getUKPPC()),
    safe(getUKAmazonDisbursements()),
    safe(getUKAmazonReviews()), safe(getUKBionature()), safe(getUKBilling()), safe(getUKSalesByProduct()),
    safe(getAffiliates()), safe(getAffiliateSales()), safe(getAffiliatePayouts()),
    safe(getAffiliateTraffic()), safe(getAffiliateTasks()), safe(getAffiliateProducts()),
    safe(getUKSubscribers()),
  ]);

  // Orders — Airtable is source of truth (populated by email capture scheduler)
  let orders = airtableOrders;
  let ordersSource = 'airtable';

  // Sales by product — local CSV
  let salesByProduct = [];
  try {
    const sbp = getLocalSalesByProduct();
    if (sbp) salesByProduct = sbp;
  } catch (e) { console.warn('getLocalSalesByProduct failed:', e.message); }

  // Daily sales — local CSV
  let dailySales = [];
  try {
    const ds = getLocalDailySales();
    if (ds) dailySales = ds;
  } catch (e) { console.warn('getLocalDailySales failed:', e.message); }

  // Payouts CSV — local file
  let payoutsCsv = [];
  try {
    const pc = getLocalPayouts();
    if (pc) payoutsCsv = pc;
  } catch (e) { console.warn('getLocalPayouts failed:', e.message); }

  // SOH — Airtable only
  const sohData = soh;
  const sohSource = 'airtable';

  return { props: { tasks, priorities, risks, amazon, catalogue, shopifyProducts, orders, ordersSource, salesByProduct, dailySales, discounts, refunds, payouts, payoutsCsv, soh: sohData, sohSource, inbound, b2b, customers, affiliates, emailList, marketing, subscriptions, subscribers: subscribers || [], cs, reconcile, software, reporting, products, ppc, disbursements, reviews, bionature, billing, atSalesByProduct, affPerformance, affSales, affPayouts, affTraffic, affTasks, affProducts, error: null, serverTime: new Date().toISOString() } };
}
