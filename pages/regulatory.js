import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { getRegulatory } from '../lib/airtable';

const STATUS_BADGE = { 'Compliant': 'badge-live', 'In Progress': 'badge-draft', 'Pending': 'badge-build', 'Not Started': 'badge-build' };

export default function RegulatoryPage({ items, error }) {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [cat, setCat] = useState('');

  const regions = useMemo(() => [...new Set(items.map(i => i['Region']).filter(Boolean))].sort(), [items]);
  const cats    = useMemo(() => [...new Set(items.map(i => i['Category']).filter(Boolean))].sort(), [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i => {
      const matchQ =
        !q ||
        (i['Item'] || '').toLowerCase().includes(q) ||
        (i['Details'] || '').toLowerCase().includes(q) ||
        (i['Reference'] || '').toLowerCase().includes(q);
      return matchQ && (!region || i['Region'] === region) && (!cat || i['Category'] === cat);
    });
  }, [items, search, region, cat]);

  return (
    <Layout title="Regulatory">
      <div className="page-wrap">
        <p className="section-eyebrow">Compliance</p>
        <h1 className="section-title">Regulatory Tracker</h1>
        <p className="section-sub">Requirements, status, and references across all markets.</p>
        <hr className="section-rule" />

        {error && <div className="alert alert-error">{error}</div>}

        <div className="toolbar">
          <div className="search-box">
            <input
              className="search-input"
              type="text"
              placeholder="Search requirements, references…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {regions.length > 0 && (
          <div className="filter-row">
            <button className={`filter-pill${!region ? ' active' : ''}`} onClick={() => setRegion('')}>All Regions</button>
            {regions.map(r => (
              <button key={r} className={`filter-pill${region === r ? ' active' : ''}`} onClick={() => setRegion(r)}>{r}</button>
            ))}
          </div>
        )}

        {cats.length > 0 && (
          <div className="filter-row">
            <button className={`filter-pill${!cat ? ' active' : ''}`} onClick={() => setCat('')}>All Categories</button>
            {cats.map(c => (
              <button key={c} className={`filter-pill${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
        )}

        <p className="results-label">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</p>

        {filtered.length === 0 ? (
          <div className="empty-state"><h3>No items found</h3><p>Try adjusting your filters.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ width: 90 }}>Region</th>
                  <th style={{ width: 120 }}>Category</th>
                  <th style={{ width: 110 }}>Status</th>
                  <th>Details</th>
                  <th style={{ width: 130 }}>Reference</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td><strong>{item['Item'] || '—'}</strong></td>
                    <td style={{ fontSize: 11 }}>{item['Region'] || '—'}</td>
                    <td>{item['Category'] ? <span className="badge badge-cat">{item['Category']}</span> : '—'}</td>
                    <td>
                      {item['Status']
                        ? <span className={`badge ${STATUS_BADGE[item['Status']] || 'badge-cat'}`}>{item['Status']}</span>
                        : '—'}
                    </td>
                    <td style={{ color: 'var(--charcoal-70)', maxWidth: 280 }}>
                      {item['Details']
                        ? item['Details'].length > 110 ? item['Details'].substring(0, 110) + '…' : item['Details']
                        : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--charcoal-45)' }}>
                      {item['Reference'] || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

export async function getServerSideProps() {
  try {
    const items = await getRegulatory();
    return { props: { items, error: null } };
  } catch (e) {
    return { props: { items: [], error: e.message } };
  }
}
