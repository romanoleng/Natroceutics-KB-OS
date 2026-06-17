import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { getSOPs } from '../lib/airtable';

const STATUS_BADGE = { 'Live': 'badge-live', 'Draft': 'badge-draft', 'To Build': 'badge-build' };

export default function SOPsPage({ sops, error }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [cat, setCat] = useState('');

  const statuses  = useMemo(() => [...new Set(sops.map(s => s['Status']).filter(Boolean))].sort(), [sops]);
  const cats      = useMemo(() => [...new Set(sops.map(s => s['Category']).filter(Boolean))].sort(), [sops]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sops.filter(s => {
      const matchQ =
        !q ||
        (s['Title'] || '').toLowerCase().includes(q) ||
        (s['SOP ID'] || '').toLowerCase().includes(q) ||
        (s['Summary'] || '').toLowerCase().includes(q) ||
        (s['Owner'] || '').toLowerCase().includes(q);
      const matchSt  = !status || s['Status'] === status;
      const matchCat = !cat    || s['Category'] === cat;
      return matchQ && matchSt && matchCat;
    });
  }, [sops, search, status, cat]);

  return (
    <Layout title="SOPs">
      <div className="page-wrap">
        <p className="section-eyebrow">Operations</p>
        <h1 className="section-title">SOP Library</h1>
        <p className="section-sub">Standard operating procedures — the way we work, documented.</p>
        <hr className="section-rule" />

        {error && <div className="alert alert-error">{error}</div>}

        <div className="toolbar">
          <div className="search-box">
            <input
              className="search-input"
              type="text"
              placeholder="Search SOPs, titles, owners…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {statuses.length > 0 && (
          <div className="filter-row">
            <button className={`filter-pill${!status ? ' active' : ''}`} onClick={() => setStatus('')}>All Statuses</button>
            {statuses.map(s => (
              <button key={s} className={`filter-pill${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>{s}</button>
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

        <p className="results-label">{filtered.length} SOP{filtered.length !== 1 ? 's' : ''}</p>

        {filtered.length === 0 ? (
          <div className="empty-state"><h3>No SOPs found</h3><p>Adjust your filters.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>ID</th>
                  <th>Title</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th style={{ width: 120 }}>Category</th>
                  <th style={{ width: 110 }}>Owner</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(sop => (
                  <tr key={sop.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--charcoal-45)' }}>
                      {sop['SOP ID'] || '—'}
                    </td>
                    <td><strong>{sop['Title'] || 'Untitled'}</strong></td>
                    <td>
                      {sop['Status']
                        ? <span className={`badge ${STATUS_BADGE[sop['Status']] || 'badge-cat'}`}>{sop['Status']}</span>
                        : '—'}
                    </td>
                    <td>{sop['Category'] || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--charcoal-70)' }}>{sop['Owner'] || '—'}</td>
                    <td style={{ color: 'var(--charcoal-70)', maxWidth: 300 }}>
                      {sop['Summary']
                        ? sop['Summary'].length > 120 ? sop['Summary'].substring(0, 120) + '…' : sop['Summary']
                        : '—'}
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
    const sops = await getSOPs();
    return { props: { sops, error: null } };
  } catch (e) {
    return { props: { sops: [], error: e.message } };
  }
}
