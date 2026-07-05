/**
 * PARTNER BRANDS — Product catalogue across all brands.
 * Fields: Product, Brand, Category, Format, Qty / Size,
 *         mg / l, Price incl VAT (R), Patient price (R),
 *         Channel, Nappi Code, Barcode, Notes
 */
import { useState, useMemo } from 'react';
import OsLayout from '../components/OsLayout';
import { getPartnerBrands } from '../lib/airtable';

function fmt(v) { return (v === null || v === undefined || v === '') ? '—' : v; }
function zar(v) { return v ? `R ${Number(v).toFixed(2)}` : '—'; }

function downloadCSV(rows, filename) {
  if (!rows || !rows.length) return;
  const keys = Object.keys(rows[0]).filter(k => !k.startsWith('_'));
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = filename + '.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
const csvBtnStyle = { fontSize: 11, fontWeight: 600, padding: '4px 10px', border: '1px solid var(--cream-dark)', borderRadius: 6, background: 'transparent', color: 'var(--forest-600)', cursor: 'pointer', whiteSpace: 'nowrap' };

const CHANNEL_CLASS = {
  'Practitioner': 'pill-done',
  'Doctor only':  'pill-blocked',
  'Public':       'pill-progress',
};

export default function PartnerBrandsPage({ products, error }) {
  const [search,      setSearch]   = useState('');
  const [brandFilter, setBrand]    = useState('');
  const [catFilter,   setCat]      = useState('');
  const [chanFilter,  setChan]     = useState('');

  /* ── Derived filter options ───────────────────── */
  const brands = useMemo(() =>
    [...new Set(products.map(p => p.Brand).filter(Boolean))].sort(),
  [products]);

  const categories = useMemo(() =>
    [...new Set(products.map(p => p.Category).filter(Boolean))].sort(),
  [products]);

  const channels = useMemo(() =>
    [...new Set(products.map(p => p.Channel).filter(Boolean))].sort(),
  [products]);

  /* ── Brand card counts ────────────────────────── */
  const brandCounts = useMemo(() => {
    const counts = {};
    products.forEach(p => { if (p.Brand) counts[p.Brand] = (counts[p.Brand] || 0) + 1; });
    return counts;
  }, [products]);

  /* ── Filtered list ────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      const mQ = !q ||
        (p.Product || '').toLowerCase().includes(q) ||
        (p.Brand   || '').toLowerCase().includes(q) ||
        (p.Category|| '').toLowerCase().includes(q) ||
        (p.Notes   || '').toLowerCase().includes(q);
      const mB = !brandFilter || p.Brand    === brandFilter;
      const mC = !catFilter   || p.Category === catFilter;
      const mCh= !chanFilter  || p.Channel  === chanFilter;
      return mQ && mB && mC && mCh;
    });
  }, [products, search, brandFilter, catFilter, chanFilter]);

  return (
    <OsLayout title="Partner Brands" airtableUrl="https://airtable.com/app6jWt9MuLq42Y5s">
      <section className="region-hero" style={{ background: 'var(--charcoal)' }}>
        <div className="os-hero-inner">
          <p className="os-eyebrow">Company-Wide</p>
          <h1 className="os-region-title">🤝 Partner Brands</h1>
          <div className="region-hero-stats">
            <div className="rhs"><span className="rhs-num">{products.length}</span><span className="rhs-label">Products</span></div>
            <div className="rhs"><span className="rhs-num">{brands.length}</span><span className="rhs-label">Brands</span></div>
            <div className="rhs"><span className="rhs-num">{categories.length}</span><span className="rhs-label">Categories</span></div>
          </div>
        </div>
      </section>

      <div className="os-page-wrap">
        {error && <div className="os-alert-error">{error}</div>}

        {/* ── Search ── */}
        <div className="os-toolbar" style={{ marginBottom: 24 }}>
          <input
            className="os-search"
            placeholder="Search products, brands, categories…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className="os-count">{filtered.length} products</span>
          <button style={csvBtnStyle} onClick={() => downloadCSV(filtered, 'partner-brands-products')}>↓ CSV</button>
        </div>

        {/* ── Brand cards ── */}
        <div className="pb-brand-grid">
          <button
            className={`pb-brand-card${!brandFilter ? ' active' : ''}`}
            onClick={() => setBrand('')}
          >
            <span className="pb-brand-name">All Brands</span>
            <span className="pb-brand-count">{products.length} products</span>
          </button>
          {brands.map(b => (
            <button
              key={b}
              className={`pb-brand-card${brandFilter === b ? ' active' : ''}`}
              onClick={() => setBrand(brandFilter === b ? '' : b)}
            >
              <span className="pb-brand-name">{b}</span>
              <span className="pb-brand-count">{brandCounts[b]} products</span>
            </button>
          ))}
        </div>

        {/* ── Channel + Category filters ── */}
        <div className="pb-filter-row">
          <div className="pb-chan-group">
            <button className={`pb-chan-btn${!chanFilter ? ' active' : ''}`} onClick={() => setChan('')}>All Channels</button>
            {channels.map(c => (
              <button key={c} className={`pb-chan-btn${chanFilter === c ? ' active' : ''}`} onClick={() => setChan(chanFilter === c ? '' : c)}>{c}</button>
            ))}
          </div>
          {categories.length > 0 && (
            <select className="os-select" value={catFilter} onChange={e => setCat(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {/* ── Product grid ── */}
        {!filtered.length ? (
          <div className="os-empty">No products found.</div>
        ) : (
          <div className="pb-product-grid">
            {filtered.map(p => (
              <div key={p.id} className="pb-product-card">
                <div className="pb-product-top">
                  <h3 className="pb-product-name">{fmt(p.Product)}</h3>
                  {p.Channel && (
                    <span className={`os-pill ${CHANNEL_CLASS[p.Channel] || 'pill-default'}`} style={{ fontSize: 9, flexShrink: 0 }}>
                      {p.Channel}
                    </span>
                  )}
                </div>
                <p className="pb-product-sub">
                  {[p.Brand, p.Format, p['Qty / Size'] ? `${p['Qty / Size']}` : null].filter(Boolean).join(' · ')}
                  {p['mg / l'] ? ` · ${p['mg / l']}` : ''}
                </p>
                <div className="pb-product-footer">
                  <div className="pb-price-group">
                    {p['Price incl VAT (R)'] && (
                      <span className="pb-price">{zar(p['Price incl VAT (R)'])}</span>
                    )}
                    {p['Patient price (R)'] && (
                      <span className="pb-price-patient">Patient {zar(p['Patient price (R)'])}</span>
                    )}
                  </div>
                  {p.Category && <span className="pb-cat-tag">{p.Category}</span>}
                </div>
                {p.Notes && <p className="pb-product-notes">{p.Notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  try {
    const products = await getPartnerBrands();
    return { props: { products, error: null } };
  } catch (e) {
    return { props: { products: [], error: e.message } };
  }
}
