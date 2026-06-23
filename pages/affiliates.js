/**
 * AFFILIATE OPERATIONS — Natroceutics OS
 * Affiliate programme data from appKTwqP6KywdcIrp
 * Tabs: Affiliates · Sales · Payouts · Traffic · Products · Tasks
 */
import { useState, useMemo } from 'react';
import OsLayout from '../components/OsLayout';
import SortableTable from '../components/SortableTable';
import { useStatusEditor, StatusSelect, BASE_STATUSES as BASE_STATUSES_SHARED } from '../components/StatusSelect';
import {
  getAffiliates, getAffiliateSales, getAffiliatePayouts,
  getAffiliateTraffic, getAffiliateTasks, getAffiliateProducts,
} from '../lib/airtable';

const TABS = ['Affiliates', 'Sales', 'Payouts', 'Traffic', 'Products', 'Tasks'];

const STATUS_CLASS = {
  'Active': 'pill-done', 'Approved': 'pill-done', 'Paid': 'pill-done', 'Complete': 'pill-done', 'Enabled': 'pill-done',
  'Pending': 'pill-todo', 'Inactive': 'pill-todo', 'Paused': 'pill-todo',
  'In Review': 'pill-progress', 'Processing': 'pill-progress',
  'Suspended': 'pill-blocked', 'Rejected': 'pill-blocked', 'Refunded': 'pill-blocked',
};
function sc(s) { return STATUS_CLASS[s] || 'pill-default'; }
function fmt(v) { return (v === null || v === undefined || v === '') ? '—' : v; }
function gbp(v) { const n = Number(v); return isNaN(n) || v === '' || v === null ? '—' : `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

/* ── Affiliates ───────────────────────────────────────────── */
function AffiliatesTab({ items }) {
  const [srch, setSrch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const statuses = [...new Set(items.map(i => i.Status).filter(Boolean))];

  const filtered = useMemo(() => {
    const q = srch.toLowerCase();
    return items.filter(i => {
      const mQ = !q || (i.Name || '').toLowerCase().includes(q) || (i.Email || '').toLowerCase().includes(q) || (i.Country || '').toLowerCase().includes(q);
      const mS = !statusFilter || i.Status === statusFilter;
      return mQ && mS;
    });
  }, [items, srch, statusFilter]);

  const active   = items.filter(i => i.Status === 'Active').length;
  const totRev   = items.reduce((s, i) => s + (Number(i['Total Revenue']) || 0), 0);
  const totComm  = items.reduce((s, i) => s + (Number(i['Total Commission']) || 0), 0);
  const totOut   = items.reduce((s, i) => s + (Number(i['Outstanding Balance']) || 0), 0);

  if (!items.length) return <div className="os-empty">No affiliates yet. Add data to the Affiliates table in Airtable.</div>;
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
          <select className="os-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
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
            <td>{a.Status ? <span className={`os-pill ${sc(a.Status)}`}>{a.Status}</span> : '—'}</td>
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

/* ── Sales ────────────────────────────────────────────────── */
function SalesTab({ items }) {
  const [srch, setSrch] = useState('');
  const filtered = useMemo(() => {
    const q = srch.toLowerCase();
    return !q ? items : items.filter(i =>
      (i['Order Number'] || '').toLowerCase().includes(q) ||
      (i.Customer || '').toLowerCase().includes(q) ||
      (i.Affiliate || '').toLowerCase().includes(q)
    );
  }, [items, srch]);

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
          { label: 'Refund Status', key: 'Refund Status', w: 120 },
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
            <td>{r.Status ? <span className={`os-pill ${sc(r.Status)}`}>{r.Status}</span> : '—'}</td>
            <td className="os-muted">{fmt(r['Refund Status'])}</td>
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

/* ── Payouts ──────────────────────────────────────────────── */
function PayoutsTab({ items }) {
  const editor = useStatusEditor(items, 'Payment Status');
  const payStatuses = useMemo(() => [...new Set(['Pending', 'Processing', 'Paid', 'On Hold', ...BASE_STATUSES_SHARED, ...items.map(i => i['Payment Status']).filter(Boolean)])], [items]);

  const totDue  = items.reduce((s, i) => s + (Number(i['Amount Due']) || 0), 0);
  const totPaid = items.reduce((s, i) => s + (Number(i['Amount Paid']) || 0), 0);
  const pending = items.filter(i => (i['Payment Status'] || '').toLowerCase() === 'pending').length;

  if (!items.length) return <div className="os-empty">No payout records yet.</div>;
  return (
    <>
      <div className="os-stat-row">
        <div className="os-stat-card"><div className="os-stat-num">{gbp(totDue)}</div><div className="os-stat-label">Total Due</div></div>
        <div className="os-stat-card os-stat-green"><div className="os-stat-num">{gbp(totPaid)}</div><div className="os-stat-label">Total Paid</div></div>
        {pending > 0 && <div className="os-stat-card os-stat-amber"><div className="os-stat-num">{pending}</div><div className="os-stat-label">Pending Payouts</div></div>}
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

/* ── Traffic ──────────────────────────────────────────────── */
function TrafficTab({ items }) {
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
            { label: 'Top Referrers', key: 'Top Referrers' },
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
              <td className="os-muted" style={{ fontSize: 12 }}>{fmt(r['Top Referrers'])}</td>
            </tr>
          )}
          emptyMsg="No traffic data."
        />
      </div>
    </>
  );
}

/* ── Products ─────────────────────────────────────────────── */
function AffProductsTab({ items }) {
  if (!items.length) return <div className="os-empty">No affiliate product performance data yet.</div>;
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
            { label: 'Top Affiliates', key: 'Top Affiliates' },
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
              <td className="os-muted" style={{ fontSize: 12 }}>{fmt(r['Top Affiliates'])}</td>
              <td>{r.Flag ? <span className="os-pill pill-blocked">{r.Flag}</span> : '—'}</td>
            </tr>
          )}
          emptyMsg="No product data."
        />
      </div>
    </>
  );
}

/* ── Tasks ────────────────────────────────────────────────── */
function AffTasksTab({ items }) {
  const editor = useStatusEditor(items);
  const taskStatuses = useMemo(() => [...new Set(['To Do', 'In Progress', 'Done', 'Blocked', ...BASE_STATUSES_SHARED, ...items.map(i => i.Status).filter(Boolean)])], [items]);
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
            { label: 'Due Date', key: 'Due Date', type: 'date', w: 110 },
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
              <td className="os-mono">{fmt(t['Due Date'])}</td>
            </tr>
          )}
          emptyMsg="No tasks."
        />
      </div>
    </>
  );
}

/* ── Page ─────────────────────────────────────────────────── */
export default function AffiliatesPage({ affiliates = [], sales = [], payouts = [], traffic = [], products = [], tasks = [], error }) {
  const [tab, setTab] = useState('Affiliates');

  return (
    <OsLayout title="Affiliate Operations" airtableUrl="https://airtable.com/appKTwqP6KywdcIrp">
      <section className="os-hero" style={{ background: 'var(--forest-900)' }}>
        <div className="os-hero-inner">
          <p className="os-eyebrow">Company-Wide</p>
          <h1 className="os-hero-title">🤝 Affiliate Operations</h1>
          <div className="region-hero-stats" style={{ marginTop: 20 }}>
            <div className="rhs"><span className="rhs-num">{affiliates.filter(a => a.Status === 'Active').length}</span><span className="rhs-label">Active Affiliates</span></div>
            <div className="rhs"><span className="rhs-num">{sales.length}</span><span className="rhs-label">Sales</span></div>
            <div className="rhs"><span className="rhs-num">£{affiliates.reduce((s, a) => s + (Number(a['Total Revenue']) || 0), 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span><span className="rhs-label">Total Revenue</span></div>
            <div className="rhs"><span className="rhs-num">{payouts.filter(p => (p['Payment Status'] || '').toLowerCase() === 'pending').length}</span><span className="rhs-label">Pending Payouts</span></div>
          </div>
        </div>
      </section>

      <div className="os-page-wrap">
        {error && <div className="os-alert-error">{error}</div>}

        <div className="os-subnav">
          {TABS.map(t => <button key={t} className={`os-subnav-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>

        <div className="os-tab-content">
          {tab === 'Affiliates' && <AffiliatesTab items={affiliates} />}
          {tab === 'Sales'      && <SalesTab items={sales} />}
          {tab === 'Payouts'    && <PayoutsTab items={payouts} />}
          {tab === 'Traffic'    && <TrafficTab items={traffic} />}
          {tab === 'Products'   && <AffProductsTab items={products} />}
          {tab === 'Tasks'      && <AffTasksTab items={tasks} />}
        </div>
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  const safe = p => p.catch(e => { console.warn('[affiliates] fetch partial fail:', e.message); return []; });

  const [affiliates, sales, payouts, traffic, products, tasks] = await Promise.all([
    safe(getAffiliates()),
    safe(getAffiliateSales()),
    safe(getAffiliatePayouts()),
    safe(getAffiliateTraffic()),
    safe(getAffiliateProducts()),
    safe(getAffiliateTasks()),
  ]);

  return { props: { affiliates, sales, payouts, traffic, products, tasks, error: null } };
}
