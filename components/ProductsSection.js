import { useState, useMemo } from 'react';

export default function ProductsSection({ products = [] }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [mkt, setMkt] = useState('');

  const categories = useMemo(() => [...new Set(products.map(p => p['Category']).filter(Boolean))].sort(), [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      const matchQ = !q || (p['Product Name'] || '').toLowerCase().includes(q) ||
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
    <div className="os-products-wrap">
      <div className="os-toolbar">
        <input
          className="os-search"
          type="text"
          placeholder="Search products, indications, ingredients…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="os-count">{filtered.length} product{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="os-filter-row">
        <button className={`os-fpill${!cat ? ' active' : ''}`} onClick={() => setCat('')}>All Categories</button>
        {categories.map(c => (
          <button key={c} className={`os-fpill${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>

      <div className="os-filter-row">
        <button className={`os-fpill${!mkt ? ' active' : ''}`} onClick={() => setMkt('')}>All Markets</button>
        {[['UK','UK'], ['AMZN','Amazon UK'], ['SA','South Africa'], ['ME','Middle East']].map(([code, label]) => (
          <button key={code} className={`os-fpill${mkt === code ? ' active' : ''}`} onClick={() => setMkt(code)}>{label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="os-empty">No products found — try adjusting your search or filters.</div>
      ) : (
        <div className="os-product-grid">
          {filtered.map(p => (
            <div key={p.id} className="os-product-card">
              <div className="os-product-header">
                <span className="os-product-name">{p['Product Name'] || 'Unnamed'}</span>
                {p['Category'] && <span className="os-pill pill-default">{p['Category']}</span>}
              </div>
              {p['Short Description'] && <p className="os-product-desc">{p['Short Description']}</p>}
              {p['Indication'] && (
                <p className="os-product-field"><strong>Indication:</strong> {p['Indication']}</p>
              )}
              {p['Mechanisms of Action'] && (
                <p className="os-product-field">
                  <strong>MoA:</strong> {p['Mechanisms of Action'].length > 120 ? p['Mechanisms of Action'].substring(0, 120) + '…' : p['Mechanisms of Action']}
                </p>
              )}
              <div className="os-product-footer">
                <span className="os-muted">{p['Pack Size'] || ''}</span>
                <div className="os-mkt-flags">
                  {p['UK Shopify']   && <span className="os-mkt-flag mkt-uk">UK</span>}
                  {p['Amazon UK']    && <span className="os-mkt-flag mkt-amz">AMZN</span>}
                  {p['SA Available'] && <span className="os-mkt-flag mkt-sa">SA</span>}
                  {p['Middle East']  && <span className="os-mkt-flag mkt-me">ME</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
