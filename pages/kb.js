/**
 * KNOWLEDGE BASE — All global KB tables:
 * Products · SOPs · Contacts · Platforms · Regulatory
 */
import { useState, useMemo } from 'react';
import OsLayout from '../components/OsLayout';
import ProductsSection from '../components/ProductsSection';
import SortableTable from '../components/SortableTable';
import { getProducts, getSOPs, getContacts, getPlatforms, getRegulatory, getBrandAssets, getCompanyInfo, getTemplates, getTraining } from '../lib/airtable';
import { sc } from '../components/StatusSelect';

function fmt(v){ return (v===null||v===undefined||v==='')?'—':v; }

function downloadCSV(rows, filename) {
  if (!rows || !rows.length) return;
  const keys = Object.keys(rows[0]).filter(k => !k.startsWith('_'));
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = filename + '.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
const csvBtnStyle = { fontSize: 11, fontWeight: 600, padding: '4px 10px', border: '1px solid var(--cream-dark)', borderRadius: 6, background: 'transparent', color: 'var(--forest-600)', cursor: 'pointer', whiteSpace: 'nowrap' };
const csvRowStyle = { display: 'flex', justifyContent: 'flex-end', margin: '12px 0 6px' };

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
        <button style={csvBtnStyle} onClick={() => downloadCSV(filtered, 'kb-sops')}>↓ CSV</button>
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
        <button style={csvBtnStyle} onClick={() => downloadCSV(filtered, 'kb-contacts')}>↓ CSV</button>
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
    <>
    <div style={csvRowStyle}>
      <button style={csvBtnStyle} onClick={() => downloadCSV(items, 'kb-platforms')}>↓ CSV</button>
    </div>
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
    </>
  );
}

/* ── Regulatory ─────────────────────────────────── */
function RegulatoryTab({ items }) {
  if(!items.length) return <div className="os-empty">No regulatory items.</div>;
  return (
    <>
    <div style={csvRowStyle}>
      <button style={csvBtnStyle} onClick={() => downloadCSV(items, 'kb-regulatory')}>↓ CSV</button>
    </div>
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
    </>
  );
}

/* ── Brand Assets ──────────────────────────────── */
function BrandAssetsTab({ items }) {
  const [srch, setSrch] = useState('');
  const cats = [...new Set(items.map(i => i.Category).filter(Boolean))];
  const [cat, setCat] = useState('');
  const filtered = useMemo(() => {
    const q = srch.toLowerCase();
    return items.filter(i => {
      const mQ = !q || (i['Asset Name']||'').toLowerCase().includes(q) || (i['Value/Detail']||'').toLowerCase().includes(q);
      const mC = !cat || i.Category === cat;
      return mQ && mC;
    });
  }, [items, srch, cat]);
  if (!items.length) return <div className="os-empty">No brand assets logged.</div>;
  return (
    <>
      <div className="os-toolbar">
        <input className="os-search" placeholder="Search assets…" value={srch} onChange={e=>setSrch(e.target.value)}/>
        {cats.length>0&&<select className="os-select" value={cat} onChange={e=>setCat(e.target.value)}><option value="">All Categories</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select>}
        <span className="os-count">{filtered.length} assets</span>
        <button style={csvBtnStyle} onClick={() => downloadCSV(filtered, 'kb-brand-assets')}>↓ CSV</button>
      </div>
      <SortableTable
        cols={[
          { label: 'Asset', key: 'Asset Name' },
          { label: 'Category', key: 'Category', w: 130 },
          { label: 'Value / Detail', key: 'Value/Detail' },
          { label: 'Usage Rules', key: 'Usage Rules' },
          { label: 'Status', key: 'Status', w: 110 },
          { label: 'File / Link', key: 'File/Link', w: 120 },
        ]}
        data={filtered}
        renderRow={r => (
          <tr key={r.id}>
            <td><strong>{fmt(r['Asset Name'])}</strong></td>
            <td className="os-muted">{fmt(r.Category)}</td>
            <td style={{fontSize:12}}>{fmt(r['Value/Detail'])}</td>
            <td className="os-muted" style={{fontSize:12}}>{fmt(r['Usage Rules'])}</td>
            <td>{r.Status?<span className={`os-pill ${sc(r.Status)}`}>{r.Status}</span>:'—'}</td>
            <td>{r['File/Link']?<a href={r['File/Link']} target="_blank" rel="noopener" style={{color:'var(--forest-600)',fontSize:12}}>Open</a>:'—'}</td>
          </tr>
        )}
        emptyMsg="No brand assets."
      />
    </>
  );
}

/* ── Company Info ──────────────────────────────── */
function CompanyInfoTab({ items }) {
  const cats = [...new Set(items.map(i => i.Category).filter(Boolean))];
  const [cat, setCat] = useState('');
  const filtered = useMemo(() => !cat ? items : items.filter(i => i.Category === cat), [items, cat]);
  if (!items.length) return <div className="os-empty">No company info records.</div>;
  return (
    <>
      <div className="os-toolbar">
        {cats.length>0&&<select className="os-select" value={cat} onChange={e=>setCat(e.target.value)}><option value="">All Categories</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select>}
        <span className="os-count">{filtered.length} records</span>
        <button style={csvBtnStyle} onClick={() => downloadCSV(filtered, 'kb-company-info')}>↓ CSV</button>
      </div>
      <SortableTable
        cols={[
          { label: 'Item', key: 'Item' },
          { label: 'Entity', key: 'Entity', w: 130 },
          { label: 'Category', key: 'Category', w: 130 },
          { label: 'Value', key: 'Value' },
          { label: 'Last Verified', key: 'Last Verified', type: 'date', w: 120 },
          { label: 'Notes', key: 'Notes' },
        ]}
        data={filtered}
        renderRow={r => (
          <tr key={r.id}>
            <td><strong>{fmt(r.Item)}</strong></td>
            <td className="os-muted">{fmt(r.Entity)}</td>
            <td className="os-muted">{fmt(r.Category)}</td>
            <td style={{fontSize:12}}>{fmt(r.Value)}</td>
            <td className="os-mono">{fmt(r['Last Verified'])}</td>
            <td className="os-muted" style={{fontSize:12}}>{fmt(r.Notes)}</td>
          </tr>
        )}
        emptyMsg="No company info records."
      />
    </>
  );
}

/* ── Templates ─────────────────────────────────── */
function TemplatesTab({ items }) {
  const [srch, setSrch] = useState('');
  const cats = [...new Set(items.map(i => i.Category).filter(Boolean))];
  const [cat, setCat] = useState('');
  const filtered = useMemo(() => {
    const q = srch.toLowerCase();
    return items.filter(i => {
      const mQ = !q || (i['Template Name']||'').toLowerCase().includes(q) || (i.Category||'').toLowerCase().includes(q);
      const mC = !cat || i.Category === cat;
      return mQ && mC;
    });
  }, [items, srch, cat]);
  if (!items.length) return <div className="os-empty">No templates logged.</div>;
  return (
    <>
      <div className="os-toolbar">
        <input className="os-search" placeholder="Search templates…" value={srch} onChange={e=>setSrch(e.target.value)}/>
        {cats.length>0&&<select className="os-select" value={cat} onChange={e=>setCat(e.target.value)}><option value="">All Categories</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select>}
        <span className="os-count">{filtered.length} templates</span>
        <button style={csvBtnStyle} onClick={() => downloadCSV(filtered, 'kb-templates')}>↓ CSV</button>
      </div>
      <SortableTable
        cols={[
          { label: 'Template', key: 'Template Name' },
          { label: 'Category', key: 'Category', w: 130 },
          { label: 'Status', key: 'Status', w: 110 },
          { label: 'Owner', key: 'Owner', w: 120 },
          { label: 'Last Updated', key: 'Last Updated', type: 'date', w: 120 },
          { label: 'Usage Notes', key: 'Usage Notes' },
        ]}
        data={filtered}
        renderRow={t => (
          <tr key={t.id}>
            <td><strong>{fmt(t['Template Name'])}</strong></td>
            <td className="os-muted">{fmt(t.Category)}</td>
            <td>{t.Status?<span className={`os-pill ${sc(t.Status)}`}>{t.Status}</span>:'—'}</td>
            <td className="os-muted">{fmt(t.Owner)}</td>
            <td className="os-mono">{fmt(t['Last Updated'])}</td>
            <td className="os-muted" style={{fontSize:12}}>{fmt(t['Usage Notes'])}</td>
          </tr>
        )}
        emptyMsg="No templates."
      />
    </>
  );
}

/* ── Training Resources ────────────────────────── */
function TrainingTab({ items }) {
  const [srch, setSrch] = useState('');
  const cats = [...new Set(items.map(i => i.Category).filter(Boolean))];
  const [cat, setCat] = useState('');
  const filtered = useMemo(() => {
    const q = srch.toLowerCase();
    return items.filter(i => {
      const mQ = !q || (i['Resource Title']||'').toLowerCase().includes(q) || (i.Category||'').toLowerCase().includes(q);
      const mC = !cat || i.Category === cat;
      return mQ && mC;
    });
  }, [items, srch, cat]);
  if (!items.length) return <div className="os-empty">No training resources logged.</div>;
  return (
    <>
      <div className="os-toolbar">
        <input className="os-search" placeholder="Search resources…" value={srch} onChange={e=>setSrch(e.target.value)}/>
        {cats.length>0&&<select className="os-select" value={cat} onChange={e=>setCat(e.target.value)}><option value="">All Categories</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select>}
        <span className="os-count">{filtered.length} resources</span>
        <button style={csvBtnStyle} onClick={() => downloadCSV(filtered, 'kb-training')}>↓ CSV</button>
      </div>
      <SortableTable
        cols={[
          { label: 'Resource', key: 'Resource Title' },
          { label: 'Audience', key: 'Audience', w: 130 },
          { label: 'Category', key: 'Category', w: 130 },
          { label: 'Status', key: 'Status', w: 110 },
          { label: 'Last Updated', key: 'Last Updated', type: 'date', w: 120 },
          { label: 'Description', key: 'Description' },
          { label: 'File Location', key: 'File Location', w: 130 },
        ]}
        data={filtered}
        renderRow={r => (
          <tr key={r.id}>
            <td><strong>{fmt(r['Resource Title'])}</strong></td>
            <td className="os-muted" style={{fontSize:12}}>{Array.isArray(r.Audience) ? r.Audience.join(', ') : fmt(r.Audience)}</td>
            <td className="os-muted">{fmt(r.Category)}</td>
            <td>{r.Status?<span className={`os-pill ${sc(r.Status)}`}>{r.Status}</span>:'—'}</td>
            <td className="os-mono">{fmt(r['Last Updated'])}</td>
            <td className="os-muted" style={{fontSize:12}}>{fmt(r.Description)}</td>
            <td className="os-muted" style={{fontSize:11}}>{fmt(r['File Location'])}</td>
          </tr>
        )}
        emptyMsg="No training resources."
      />
    </>
  );
}

/* ── Page ──────────────────────────────────────── */
const TABS = ['Products','SOPs','Contacts','Platforms','Regulatory','Brand Assets','Company Info','Templates','Training Resources'];

export default function KBPage({ products, sops, contacts, platforms, regulatory, brandAssets = [], companyInfo = [], templates = [], training = [], error }) {
  const [tab, setTab] = useState('Products');

  return (
    <OsLayout title="Knowledge Base" airtableUrl="https://airtable.com/appbbbPs9ngSR6fIK">
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
          {tab==='Products'          && <ProductsSection products={products}/>}
          {tab==='SOPs'              && <SOPsTab items={sops}/>}
          {tab==='Contacts'          && <ContactsTab items={contacts}/>}
          {tab==='Platforms'         && <PlatformsTab items={platforms}/>}
          {tab==='Regulatory'        && <RegulatoryTab items={regulatory}/>}
          {tab==='Brand Assets'      && <BrandAssetsTab items={brandAssets}/>}
          {tab==='Company Info'      && <CompanyInfoTab items={companyInfo}/>}
          {tab==='Templates'         && <TemplatesTab items={templates}/>}
          {tab==='Training Resources'&& <TrainingTab items={training}/>}
        </div>
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  try {
    const [products, sops, contacts, platforms, regulatory, brandAssets, companyInfo, templates, training] = await Promise.all([
      getProducts(), getSOPs(), getContacts(), getPlatforms(), getRegulatory(),
      getBrandAssets(), getCompanyInfo(), getTemplates(), getTraining(),
    ]);
    return { props: { products, sops, contacts, platforms, regulatory, brandAssets, companyInfo, templates, training, error: null } };
  } catch(e) {
    return { props: { products:[], sops:[], contacts:[], platforms:[], regulatory:[], brandAssets:[], companyInfo:[], templates:[], training:[], error: e.message } };
  }
}
