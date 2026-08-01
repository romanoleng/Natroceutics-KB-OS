import { useState, useMemo } from 'react';
import { normaliseProduct, hasMarketData, searchText } from '../lib/product-fields';
import Layout from '../components/Layout';
import { getProducts } from '../lib/airtable';

export default function ProductsPage({ products, error }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [mkt, setMkt] = useState('');

  // Field names are resolved rather than hardcoded: this table's schema
  // changed under the UI and every product rendered as "Unnamed".
  const rows = useMemo(() => products.map(normaliseProduct), [products]);
  const showMarkets = useMemo(() => hasMarketData(products), [products]);

  const categories = useMemo(
    () => [...new Set(rows.map(p => p.category).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(p => {
      const matchQ = !q || searchText(p).includes(q);
      const matchCat = !cat || p.category === cat;
      const matchMkt = !mkt || p.markets.includes(mkt);
      return matchQ && matchCat && matchMkt;
    });
  }, [rows, search, cat, mkt]);

  return (
    <Layout title="Products">
      <div className="page-wrap">
        <p className="section-eyebrow">Product Range</p>
        <h1 className="section-title">Product Catalogue</h1>
        <p className="section-sub">
          {products.length} nature-based therapeutics and nutritional support products.
          We are efficacy first.
        </p>
        <hr className="section-rule" />

        {error && <div className="alert alert-error">{error}</div>}

        <div className="toolbar">
          <div className="search-box">
            <input
              className="search-input"
              type="text"
              placeholder="Search products, indications, ingredients…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="filter-row">
          <button className={`filter-pill${!cat ? ' active' : ''}`} onClick={() => setCat('')}>All Categories</button>
          {categories.map(c => (
            <button key={c} className={`filter-pill${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>

        <div className="filter-row">
          <button className={`filter-pill${!mkt ? ' active' : ''}`} onClick={() => setMkt('')}>All Markets</button>
          {[['UK','UK Shopify'],['AMZN','Amazon UK'],['SA','SA Available'],['ME','Middle East']].map(([code]) => (
            <button key={code} className={`filter-pill${mkt === code ? ' active' : ''}`} onClick={() => setMkt(code)}>{code}</button>
          ))}
        </div>

        <p className="results-label">{filtered.length} product{filtered.length !== 1 ? 's' : ''}</p>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No products found</h3>
            <p>Adjust your search or filters.</p>
          </div>
        ) : (
          <div className="product-grid">
            {filtered.map(p => (
              <div key={p.id} className="product-card">
                <div className="product-card-img">
                  <span className="product-card-img-placeholder">Product Image</span>
                  {p.category && (
                    <span className="badge badge-cat" style={{ position: 'absolute', top: 10, left: 10 }}>
                      {p.category}
                    </span>
                  )}
                </div>
                <div className="product-card-body">
                  <p className="product-name">{p.name}</p>
                  {p.brand && <p className="product-desc">{p.brand}</p>}
                  {p.description && <p className="product-desc">{p.description}</p>}
                  {p.indication && <p className="product-indic">Indication: {p.indication}</p>}
                  {p.prices.length > 0 && (
                    <p style={{ fontSize: 11.5, color: 'var(--charcoal-70)', lineHeight: 1.5 }}>
                      {p.prices.map(pr => (
                        <span key={pr.label} style={{ marginRight: 10 }}>
                          <strong style={{ fontWeight: 600 }}>{pr.label}:</strong> {pr.sym}{pr.value.toLocaleString('en-GB')}
                        </span>
                      ))}
                    </p>
                  )}
                  <div className="product-footer">
                    <span className="product-pack">{p.spec}</span>
                    <div className="mkt-flags">
                      {p.channel && <span className="mkt-flag">{p.channel}</span>}
                      {p.markets.map(m => <span key={m} className={`mkt-flag mkt-${m.toLowerCase()}`}>{m}</span>)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export async function getServerSideProps() {
  try {
    const products = await getProducts();
    return { props: { products, error: null } };
  } catch (e) {
    return { props: { products: [], error: e.message } };
  }
}
