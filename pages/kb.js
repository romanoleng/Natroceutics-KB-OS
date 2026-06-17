/**
 * KNOWLEDGE BASE — All global KB tables:
 * Products · SOPs · Contacts · Platforms · Regulatory
 */
import { useState, useMemo } from 'react';
import OsLayout from '../components/OsLayout';
import ProductsSection from '../components/ProductsSection';
import SortableTable from '../components/SortableTable';
import { getProducts, getSOPs, getContacts, getPlatforms, getRegulatory } from '../lib/airtable';

function fmt(v){ return (v===null||v===undefined||v==='')?'—':v; }

const SC = {
  'Active':'pill-done','Approved':'pill-done','Live':'pill-done','Current':'pill-done','Published':'pill-done',
  'In Progress':'pill-progress','Under Review':'pill-progress','Draft':'pill-progress',
  'Pending':'pill-todo','Planned':'pill-todo',
  'Archived':'pill-blocked','Inactive':'pill-blocked','Discontinued':'pill-blocked',
};
function sc(s){ return SC[s]||'pill-default'; }

/* ── SOPs ─────────────────────────────────────── */
function SOPsTab({ items }) {
  const [srch,setSrch] = useState('');
  const filtered = useMemo(()=>{
    const q=srch.toLowerCase();
    return !q?items:items.filter(s=>(s['SOP ID']||'').toLowerCase().includes(q)||(s.Title||'').toLowerCase().includes(q)||(s.Department||'').toLowerCase().includes(q));
  },[items,srch]);
  return (
    <>
      <div className="os-toolbar">
        <input className="os-search" placeholder="Search SOPs…" value={srch} onChange={e=>setSrch(e.target.value)}/>
        <span className="os-count">{filtered.length} SOPs</span>
      </div>
      <SortableTable
        cols={[
          { label: 'SOP ID', key: 'SOP ID', w: 110 },
          { label: 'Title', key: 'Title' },
          { label: 'Department', key: 'Department', w: 130 },
          { label: 'Version', key: 'Version', w: 80 },
          { label: 'Owner', key: 'Owner', w: 120 },
          { label: 'Status', key: 'Status', w: 110 },
          { label: 'Last Reviewed', key: 'Last Reviewed', type: 'date', w: 130 },
        ]}
        data={filtered}
        renderRow={s => (
          <tr key={s.id}>
            <td className="os-mono" style={{fontSize:11}}>{fmt(s['SOP ID'])}</td>
            <td><strong>{fmt(s.Title)}</strong>{s.Description&&<p className="os-table-note">{s.Description}</p>}</td>
            <td className="os-muted">{fmt(s.Department)}</td>
            <td className="os-mono">{fmt(s.Version)}</td>
            <td className="os-muted">{fmt(s.Owner)}</td>
            <td>{s.Status?<span className={`os-pill ${sc(s.Status)}`}>{s.Status}</span>:'—'}</td>
            <td className="os-mono">{fmt(s['Last Reviewed'])}</td>
          </tr>
        )}
        emptyMsg="No SOPs found."
      />
    </>
  );
}

/* ── Contacts ─────────────────────────────────── */
function ContactsTab({ items }) {
  const [srch,setSrch] = useState('');
  const [roleFilter,setRoleFilter] = useState('');
  const roles = [...new Set(items.map(c=>c.Role||c.Type).filter(Boolean))];
  const filtered = useMemo(()=>{
    const q=srch.toLowerCase();
    return items.filter(c=>{
      const mQ = !q||(c.Name||'').toLowerCase().includes(q)||(c.Company||c.Organisation||'').toLowerCase().includes(q)||(c.Email||'').toLowerCase().includes(q);
      const mR = !roleFilter||(c.Role||c.Type)===roleFilter;
      return mQ && mR;
    });
  },[items,srch,roleFilter]);
  return (
    <>
      <div className="os-toolbar">
        <input className="os-search" placeholder="Search contacts…" value={srch} onChange={e=>setSrch(e.target.value)}/>
        {roles.length>0&&<select className="os-select" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="">All Roles</option>{roles.map(r=><option key={r} value={r}>{r}</option>)}</select>}
        <span className="os-count">{filtered.length} contacts</span>
      </div>
      <SortableTable
        cols={[
          { label: 'Name', key: 'Name' },
          { label: 'Role / Type', key: 'Role', w: 140 },
          { label: 'Company', key: 'Company', w: 150 },
          { label: 'Email', key: 'Email', w: 180 },
          { label: 'Country', key: 'Country', w: 100 },
          { label: 'Notes', key: 'Notes' },
        ]}
        data={filtered}
        renderRow={c => (
          <tr key={c.id}>
            <td><strong>{fmt(c.Name)}</strong></td>
            <td className="os-muted">{fmt(c.Role||c.Type)}</td>
            <td className="os-muted">{fmt(c.Company||c.Organisation)}</td>
            <td className="os-mono" style={{fontSize:11}}>{fmt(c.Email)}</td>
            <td className="os-muted">{fmt(c.Country)}</td>
            <td className="os-muted" style={{fontSize:12}}>{fmt(c.Notes)}</td>
          </tr>
        )}
        emptyMsg="No contacts found."
      />
    </>
  );
}

/* ── Platforms ─────────────────────────────────── */
function PlatformsTab({ items }) {
  if(!items.length) return <div className="os-empty">No platforms logged.</div>;
  return (
    <SortableTable
      cols={[
        { label: 'Platform', key: 'Platform' },
        { label: 'Category', key: 'Category', w: 130 },
        { label: 'Purpose', key: 'Purpose' },
        { label: 'Owner', key: 'Owner', w: 120 },
        { label: 'Cost', key: 'Monthly Cost', type: 'number', w: 90 },
        { label: 'Status', key: 'Status', w: 110 },
      ]}
      data={items}
      renderRow={p => (
        <tr key={p.id}>
          <td><strong>{fmt(p.Platform)}</strong>{p.Website&&<p className="os-table-note"><a href={p.Website} target="_blank" rel="noopener" style={{color:'var(--forest-600)'}}>{p.Website}</a></p>}</td>
          <td className="os-muted">{fmt(p.Category)}</td>
          <td className="os-muted" style={{fontSize:12}}>{fmt(p.Purpose||p.Description)}</td>
          <td className="os-muted">{fmt(p.Owner)}</td>
          <td className="os-mono">{fmt(p['Monthly Cost']||p.Cost)}</td>
          <td>{p.Status?<span className={`os-pill ${sc(p.Status)}`}>{p.Status}</span>:'—'}</td>
        </tr>
      )}
      emptyMsg="No platforms logged."
    />
  );
}

/* ── Regulatory ─────────────────────────────────── */
function RegulatoryTab({ items }) {
  if(!items.length) return <div className="os-empty">No regulatory items.</div>;
  return (
    <SortableTable
      cols={[
        { label: 'Item', key: 'Item' },
        { label: 'Market', key: 'Market', w: 100 },
        { label: 'Category', key: 'Category', w: 130 },
        { label: 'Status', key: 'Status', w: 110 },
        { label: 'Deadline', key: 'Deadline', type: 'date', w: 110 },
        { label: 'Owner', key: 'Owner', w: 120 },
        { label: 'Notes', key: 'Notes' },
      ]}
      data={items}
      renderRow={r => (
        <tr key={r.id}>
          <td><strong>{fmt(r.Item||r.Name)}</strong></td>
          <td className="os-muted">{fmt(r.Market)}</td>
          <td className="os-muted">{fmt(r.Category)}</td>
          <td>{r.Status?<span className={`os-pill ${sc(r.Status)}`}>{r.Status}</span>:'—'}</td>
          <td className="os-mono">{fmt(r.Deadline||r['Due Date'])}</td>
          <td className="os-muted">{fmt(r.Owner)}</td>
          <td className="os-muted" style={{fontSize:12}}>{fmt(r.Notes)}</td>
        </tr>
      )}
      emptyMsg="No regulatory items."
    />
  );
}

/* ── Page ──────────────────────────────────────── */
const TABS = ['Products','SOPs','Contacts','Platforms','Regulatory'];

export default function KBPage({ products, sops, contacts, platforms, regulatory, error }) {
  const [tab, setTab] = useState('Products');

  return (
    <OsLayout title="Knowledge Base">
      <section className="os-hero" style={{background:'var(--forest-900)'}}>
        <div className="os-hero-inner">
          <p className="os-eyebrow">Company-Wide</p>
          <h1 className="os-hero-title">📋 Knowledge Base</h1>
          <div className="region-hero-stats" style={{marginTop:20}}>
            <div className="rhs"><span className="rhs-num">{products.length}</span><span className="rhs-label">Products</span></div>
            <div className="rhs"><span className="rhs-num">{sops.length}</span><span className="rhs-label">SOPs</span></div>
            <div className="rhs"><span className="rhs-num">{contacts.length}</span><span className="rhs-label">Contacts</span></div>
            <div className="rhs"><span className="rhs-num">{platforms.length}</span><span className="rhs-label">Platforms</span></div>
            <div className="rhs"><span className="rhs-num">{regulatory.length}</span><span className="rhs-label">Regulatory</span></div>
          </div>
        </div>
      </section>

      <div className="os-page-wrap">
        {error && <div className="os-alert-error">{error}</div>}

        <div className="os-subnav">
          {TABS.map(t=><button key={t} className={`os-subnav-btn${tab===t?' active':''}`} onClick={()=>setTab(t)}>{t}</button>)}
        </div>

        <div className="os-tab-content">
          {tab==='Products'  && <ProductsSection products={products}/>}
          {tab==='SOPs'       && <SOPsTab items={sops}/>}
          {tab==='Contacts'   && <ContactsTab items={contacts}/>}
          {tab==='Platforms'  && <PlatformsTab items={platforms}/>}
          {tab==='Regulatory' && <RegulatoryTab items={regulatory}/>}
        </div>
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  try {
    const [products, sops, contacts, platforms, regulatory] = await Promise.all([
      getProducts(), getSOPs(), getContacts(), getPlatforms(), getRegulatory(),
    ]);
    return { props: { products, sops, contacts, platforms, regulatory, error: null } };
  } catch(e) {
    return { props: { products:[], sops:[], contacts:[], platforms:[], regulatory:[], error: e.message } };
  }
}
