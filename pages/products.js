import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { getProducts } from '../lib/airtable';

export default function ProductsPage({ products, error }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [mkt, setMkt] = useState('');

  const categories = useMemo(() => {
    return [...new Set(products.map(p => p['Category']).filter(Boolean))].sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      const matchQ =
        !q ||
        (p['Product Name'] || '').toLowerCase().includes(q) ||
        (p['Short Description'] || '').toLowerCase().includes(q) ||
        (p['Indication'] || '').toLowerCase().includes(q) ||
        (p['Key Ingredients'] || '').toLowerCase().includes(q);
      const matchCat = !cat || p['Category'] === cat;
      const matchMkt =
        !mkt ||
        (mkt === 'UK'   && p['UK Shopify']) ||
        (mkt === 'AMZN' && p['Amazon UK']) ||
        (mkt === 'SA'   && p['SA Available']) ||
        (mkt === 'ME'   && p['Middle East']);
      return matchQ && matchCat && matchMkt;
    });
  }, [products, search, cat, mkt]);

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
                  {p['Category'] && (
                    <span className="badge badge-cat" style={{ position: 'absolute', top: 10, left: 10 }}>
                      {p['Category']}
                    </span>
                  )}
                </div>
                <div className="product-card-body">
                  <p className="product-name">{p['Product Name'] || 'Unnamed'}</p>
                  {p['Short Description'] && (
                    <p className="product-desc">{p['Short Description']}</p>
                  )}
                  {p['Indication'] && (
                    <p className="product-indic">Indication: {p['Indication']}</p>
                  )}
                  {p['Mechanisms of Action'] && (
                    <p style={{ fontSize: 11, color: 'var(--charcoal-45)', lineHeight: 1.45 }}>
                      <strong style={{ fontWeight: 600, color: 'var(--charcoal-70)' }}>MoA: </strong>
                      {p['Mechanisms of Action'].length > 100
                        ? p['Mechanisms of Action'].substring(0, 100) + '…'
                        : p['Mechanisms of Action']}
                    </p>
                  )}
                  <div className="product-footer">
                    <span className="product-pack">{p['Pack Size'] || ''}</span>
                    <div className="mkt-flags">
                      {p['UK Shopify']  && <span className="mkt-flag mkt-uk">UK</span>}
                      {p['Amazon UK']   && <span className="mkt-flag mkt-amz">AMZN</span>}
                      {p['SA Available'] && <span className="mkt-flag mkt-sa">SA</span>}
                      {p['Middle East'] && <span className="mkt-flag mkt-me">ME</span>}
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
