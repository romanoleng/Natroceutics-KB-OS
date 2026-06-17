import { useState, useMemo } from 'react';
import Link from 'next/link';
import OsLayout from '../components/OsLayout';
import ProductsSection from '../components/ProductsSection';
import SortableTable from '../components/SortableTable';
import {
  getSATasks, getSAPriorities, getSARisks,
  getSAInventory, getSAFinance, getSAB2B,
  getSACustomers, getSAMarketing, getSACS, getSAReporting,
  getProducts,
} from '../lib/airtable';

const TABS = ['Tasks', 'Priorities', 'Risks', 'Inventory', 'Finance', 'B2B', 'Customers', 'Marketing', 'Customer Service', 'Reporting', 'Products'];

const STATUS_CLASS = {
  'Done': 'pill-done', 'Complete': 'pill-done', 'Completed': 'pill-done',
  'In Progress': 'pill-progress', 'Active': 'pill-progress',
  'To Do': 'pill-todo', 'Not Started': 'pill-todo', 'Pending': 'pill-todo',
  'Blocked': 'pill-blocked', 'At Risk': 'pill-blocked',
};
function statusClass(s) { return STATUS_CLASS[s] || 'pill-default'; }
function fmt(v) { return (v === null || v === undefined || v === '') ? '—' : v; }

/* ── Tasks ────────────────────────────────────────────────── */
function TaskTable({ tasks }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const statuses = [...new Set(tasks.map(t => t.Status).filter(Boolean))];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tasks.filter(t => {
      const matchQ = !q || (t.Task || '').toLowerCase().includes(q) || (t.Owner || '').toLowerCase().includes(q);
      const matchS = !statusFilter || t.Status === statusFilter;
      return matchQ && matchS;
    });
  }, [tasks, search, statusFilter]);

  return (
    <>
      <div className="os-toolbar">
        <input className="os-search" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} />
        {statuses.length > 0 && (
          <select className="os-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <span className="os-count">{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <SortableTable
        cols={[
          { label: 'Task', key: 'Task' },
          { label: 'Business Area', key: 'Business Area', w: 130 },
          { label: 'Status', key: 'Status', w: 120 },
          { label: 'Priority', key: 'Priority', w: 120 },
          { label: 'Owner', key: 'Owner', w: 120 },
          { label: 'Due', key: 'Due Date', type: 'date', w: 110 },
        ]}
        data={filtered}
        renderRow={t => (
          <tr key={t.id}>
            <td><strong>{fmt(t.Task)}</strong>
              {t.Notes && <p className="os-table-note">{t.Notes}</p>}
            </td>
            <td className="os-muted">{fmt(t['Business Area'])}</td>
            <td>{t.Status ? <span className={`os-pill ${statusClass(t.Status)}`}>{t.Status}</span> : '—'}</td>
            <td>{t.Priority ? <span className="os-pill pill-default">{t.Priority}</span> : '—'}</td>
            <td className="os-muted">{fmt(t.Owner)}</td>
            <td className="os-mono">{fmt(t['Due Date'])}</td>
          </tr>
        )}
        emptyMsg="No tasks found."
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
  if (!items.length) return <div className="os-empty">No inventory records.</div>;
  const lowStock = items.filter(i => ['Low Stock', 'Out of Stock', 'Critical'].includes(i.Status));
  return (
    <>
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
            { label: 'Status', key: 'Status', w: 110 },
            { label: 'BBD', key: 'BBD', type: 'date', w: 90 },
          ]}
          data={items}
          renderRow={i => (
            <tr key={i.id}>
              <td><strong>{fmt(i['Product Name'])}</strong></td>
              <td className="os-mono">{fmt(i.SKU)}</td>
              <td className="os-mono">{fmt(i.Quantity)}</td>
              <td className="os-muted">{fmt(i['Warehouse / Location'])}</td>
              <td>{i.Status ? <span className={`os-pill ${statusClass(i.Status)}`}>{i.Status}</span> : '—'}</td>
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
  if (!items.length) return <div className="os-empty">No finance records.</div>;
  return (
    <SortableTable
      cols={[
        { label: 'Period', key: 'Period' },
        { label: 'Channel', key: 'Channel', w: 120 },
        { label: 'Revenue (ZAR)', key: 'Revenue (ZAR)', type: 'number', w: 130 },
        { label: 'Revenue (GBP)', key: 'Revenue (GBP)', type: 'number', w: 120 },
        { label: 'Platform Fees', key: 'Platform Fees', type: 'number', w: 120 },
        { label: 'Net Revenue', key: 'Net Revenue', type: 'number', w: 120 },
        { label: 'Status', key: 'Status', w: 110 },
      ]}
      data={items}
      renderRow={r => (
        <tr key={r.id}>
          <td><strong>{fmt(r.Period)}</strong></td>
          <td className="os-muted">{fmt(r.Channel)}</td>
          <td className="os-mono">{r['Revenue (ZAR)'] ? `R${Number(r['Revenue (ZAR)']).toLocaleString()}` : '—'}</td>
          <td className="os-mono">{r['Revenue (GBP)'] ? `£${Number(r['Revenue (GBP)']).toLocaleString()}` : '—'}</td>
          <td className="os-mono">{r['Platform Fees'] ? `R${Number(r['Platform Fees']).toLocaleString()}` : '—'}</td>
          <td className="os-mono">{r['Net Revenue'] ? `R${Number(r['Net Revenue']).toLocaleString()}` : '—'}</td>
          <td>{r.Status ? <span className={`os-pill ${statusClass(r.Status)}`}>{r.Status}</span> : '—'}</td>
        </tr>
      )}
      emptyMsg="No finance records."
    />
  );
}

/* ── B2B ──────────────────────────────────────────────────── */
function B2BTab({ items }) {
  if (!items.length) return <div className="os-empty">No B2B accounts.</div>;
  const active = items.filter(i => i.Status === 'Active');
  return (
    <>
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
            { label: 'Status', key: 'Status', w: 110 },
            { label: 'Monthly Vol (ZAR)', key: 'Monthly Volume (ZAR)', type: 'number', w: 150 },
          ]}
          data={items}
          renderRow={b => (
            <tr key={b.id}>
              <td><strong>{fmt(b['Account Name'])}</strong>
                {b.Email && <p className="os-table-note">{b.Email}</p>}
              </td>
              <td className="os-muted">{fmt(b['Account Type'])}</td>
              <td className="os-muted">{fmt(b['Contact Name'])}</td>
              <td className="os-muted">{fmt(b.City)}</td>
              <td>{b.Status ? <span className={`os-pill ${statusClass(b.Status)}`}>{b.Status}</span> : '—'}</td>
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
  if (!items.length) return <div className="os-empty">No customer records.</div>;
  return (
    <SortableTable
      cols={[
        { label: 'Customer', key: 'Customer Name' },
        { label: 'Source', key: 'Source', w: 130 },
        { label: 'Type', key: 'Customer Type', w: 130 },
        { label: 'Status', key: 'Status', w: 110 },
        { label: 'LTV (ZAR)', key: 'LTV (ZAR)', type: 'number', w: 110 },
        { label: 'Orders', key: 'Total Orders', type: 'number', w: 90 },
      ]}
      data={items}
      renderRow={c => (
        <tr key={c.id}>
          <td><strong>{fmt(c['Customer Name'])}</strong>
            {c.Email && <p className="os-table-note">{c.Email}</p>}
          </td>
          <td className="os-muted">{fmt(c.Source)}</td>
          <td className="os-muted">{fmt(c['Customer Type'])}</td>
          <td>{c.Status ? <span className={`os-pill ${statusClass(c.Status)}`}>{c.Status}</span> : '—'}</td>
          <td className="os-mono">{c['LTV (ZAR)'] ? `R${Number(c['LTV (ZAR)']).toLocaleString()}` : '—'}</td>
          <td className="os-mono">{fmt(c['Total Orders'])}</td>
        </tr>
      )}
      emptyMsg="No customer records."
    />
  );
}

/* ── Marketing ────────────────────────────────────────────── */
function MarketingTab({ items }) {
  if (!items.length) return <div className="os-empty">No marketing campaigns.</div>;
  return (
    <SortableTable
      cols={[
        { label: 'Campaign', key: 'Campaign / Launch' },
        { label: 'Type', key: 'Type', w: 110 },
        { label: 'Status', key: 'Status', w: 110 },
        { label: 'Owner', key: 'Owner', w: 110 },
        { label: 'Start', key: 'Start Date', type: 'date', w: 100 },
        { label: 'End', key: 'End Date', type: 'date', w: 100 },
        { label: 'Budget (ZAR)', key: 'Budget (ZAR)', type: 'number', w: 120 },
      ]}
      data={items}
      renderRow={m => (
        <tr key={m.id}>
          <td><strong>{fmt(m['Campaign / Launch'])}</strong></td>
          <td className="os-muted">{fmt(m.Type)}</td>
          <td>{m.Status ? <span className={`os-pill ${statusClass(m.Status)}`}>{m.Status}</span> : '—'}</td>
          <td className="os-muted">{fmt(m.Owner)}</td>
          <td className="os-mono">{fmt(m['Start Date'])}</td>
          <td className="os-mono">{fmt(m['End Date'])}</td>
          <td className="os-mono">{m['Budget (ZAR)'] ? `R${Number(m['Budget (ZAR)']).toLocaleString()}` : '—'}</td>
        </tr>
      )}
      emptyMsg="No marketing campaigns."
    />
  );
}

/* ── Customer Service ─────────────────────────────────────── */
function CSTab({ items }) {
  const open = items.filter(i => !['Resolved', 'Closed', 'Done'].includes(i.Status));
  if (!items.length) return <div className="os-empty">No customer service tickets.</div>;
  return (
    <>
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
            { label: 'Status', key: 'Status', w: 110 },
            { label: 'Priority', key: 'Priority', w: 90 },
          ]}
          data={items}
          renderRow={t => (
            <tr key={t.id}>
              <td><strong>{fmt(t['Ticket ID / Reference'])}</strong></td>
              <td className="os-muted">{fmt(t['Customer Name'])}</td>
              <td className="os-muted">{fmt(t['Issue Type'])}</td>
              <td className="os-muted">{fmt(t.Channel)}</td>
              <td>{t.Status ? <span className={`os-pill ${statusClass(t.Status)}`}>{t.Status}</span> : '—'}</td>
              <td>{t.Priority ? <span className={`os-pill ${statusClass(t.Priority)}`}>{t.Priority}</span> : '—'}</td>
            </tr>
          )}
          emptyMsg="No customer service tickets."
        />
      </div>
    </>
  );
}

/* ── Reporting ────────────────────────────────────────────── */
function ReportingTab({ items }) {
  if (!items.length) return <div className="os-empty">No reporting data yet.</div>;
  return (
    <SortableTable
      cols={[
        { label: 'Period', key: 'Report Period' },
        { label: 'Report Type', key: 'Report Type', w: 130 },
        { label: 'Revenue (ZAR)', key: 'Revenue (ZAR)', type: 'number', w: 130 },
        { label: 'Orders', key: 'Orders', type: 'number', w: 80 },
        { label: 'New Customers', key: 'New Customers', type: 'number', w: 110 },
        { label: 'AOV (ZAR)', key: 'AOV (ZAR)', type: 'number', w: 110 },
        { label: 'Status', key: 'Status', w: 110 },
      ]}
      data={items}
      renderRow={r => (
        <tr key={r.id}>
          <td><strong>{fmt(r['Report Period'])}</strong></td>
          <td className="os-muted">{fmt(r['Report Type'])}</td>
          <td className="os-mono">{r['Revenue (ZAR)'] ? `R${Number(r['Revenue (ZAR)']).toLocaleString()}` : '—'}</td>
          <td className="os-mono">{fmt(r.Orders)}</td>
          <td className="os-mono">{fmt(r['New Customers'])}</td>
          <td className="os-mono">{r['AOV (ZAR)'] ? `R${Number(r['AOV (ZAR)']).toLocaleString()}` : '—'}</td>
          <td>{r.Status ? <span className={`os-pill ${statusClass(r.Status)}`}>{r.Status}</span> : '—'}</td>
        </tr>
      )}
      emptyMsg="No reporting data yet."
    />
  );
}

/* ── Page ─────────────────────────────────────────────────── */
export default function SAPage({ tasks, priorities, risks, inventory, finance, b2b, customers, marketing, cs, reporting, products, error }) {
  const [tab, setTab] = useState('Tasks');
  const openRisks = risks.filter(r => !['Resolved','Closed','Done'].includes(r.Status)).length;

  return (
    <OsLayout title="SA Dashboard" region="South Africa">
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
  try {
    const [tasks, priorities, risks, inventory, finance, b2b, customers, marketing, cs, reporting, products] = await Promise.all([
      getSATasks(), getSAPriorities(), getSARisks(),
      getSAInventory(), getSAFinance(), getSAB2B(),
      getSACustomers(), getSAMarketing(), getSACS(), getSAReporting(),
      getProducts(),
    ]);
    return { props: { tasks, priorities, risks, inventory, finance, b2b, customers, marketing, cs, reporting, products, error: null } };
  } catch (e) {
    return { props: { tasks: [], priorities: [], risks: [], inventory: [], finance: [], b2b: [], customers: [], marketing: [], cs: [], reporting: [], products: [], error: e.message } };
  }
}
