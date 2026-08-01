import { useState, useMemo } from 'react';
import { normaliseProduct, hasMarketData, searchText } from '../lib/product-fields';
import RecordDetailPanel from './RecordDetailPanel';

const ALL_MARKETS = [
  ['UK',   'Shopify UK'],
  ['AMZN', 'Amazon UK'],
  ['SA',   'South Africa'],
  ['ME',   'Middle East'],
];

const MARKET_FIELD = { UK: 'UK Shopify', AMZN: 'Amazon UK', SA: 'SA Available', ME: 'Middle East' };

export default function ProductsSection({ products = [], markets }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [mkt, setMkt] = useState('');
  const [detail, setDetail] = useState(null);

  // markets prop limits which market filter pills are shown (defaults to all 4)
  const visibleMarkets = markets || ALL_MARKETS;

  // Resolve field names once: the table's schema has changed under the UI
  // before, and hardcoding names is what made every product read "Unnamed".
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
    <>
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

        {showMarkets && (
          <div className="os-filter-row">
            <button className={`os-fpill${!mkt ? ' active' : ''}`} onClick={() => setMkt('')}>All Markets</button>
            {visibleMarkets.map(([code, label]) => (
              <button key={code} className={`os-fpill${mkt === code ? ' active' : ''}`} onClick={() => setMkt(code)}>{label}</button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="os-empty">No products found — try adjusting your search or filters.</div>
        ) : (
          <div className="os-product-grid">
            {filtered.map(p => (
              <div
                key={p.id}
                className="os-product-card"
                style={{ cursor: 'pointer' }}
                onClick={() => setDetail(p.raw)}
              >
                <div className="os-product-header">
                  <span className="os-product-name">{p.name}</span>
                  {p.category && <span className="os-pill pill-default">{p.category}</span>}
                </div>
                {p.brand && <p className="os-product-desc">{p.brand}</p>}
                {p.description && <p className="os-product-desc">{p.description}</p>}
                {p.indication && (
                  <p className="os-product-field"><strong>Indication:</strong> {p.indication}</p>
                )}
                {p.prices.length > 0 && (
                  <p className="os-product-field">
                    {p.prices.map(pr => (
                      <span key={pr.label} style={{ marginRight: 12 }}>
                        <strong>{pr.label}:</strong> {pr.sym}{pr.value.toLocaleString('en-GB')}
                      </span>
                    ))}
                  </p>
                )}
                <div className="os-product-footer">
                  <span className="os-muted">{p.spec}</span>
                  <div className="os-mkt-flags">
                    {p.channel && <span className="os-mkt-flag">{p.channel}</span>}
                    {p.markets.map(m => <span key={m} className={`os-mkt-flag mkt-${m.toLowerCase()}`}>{m}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {detail && (
        <RecordDetailPanel record={detail} onClose={() => setDetail(null)} />
      )}
    </>
  );
}
