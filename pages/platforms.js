import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { getPlatforms } from '../lib/airtable';

export default function PlatformsPage({ platforms, error }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');

  const cats = useMemo(() => [...new Set(platforms.map(p => p['Category']).filter(Boolean))].sort(), [platforms]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return platforms.filter(p => {
      const matchQ =
        !q ||
        (p['Platform'] || '').toLowerCase().includes(q) ||
        (p['Summary'] || '').toLowerCase().includes(q) ||
        (p['Key Notes'] || '').toLowerCase().includes(q) ||
        (p['Owned By'] || '').toLowerCase().includes(q);
      return matchQ && (!cat || p['Category'] === cat);
    });
  }, [platforms, search, cat]);

  return (
    <Layout title="Platform Guides">
      <div className="page-wrap">
        <p className="section-eyebrow">Operations</p>
        <h1 className="section-title">Platform Guides</h1>
        <p className="section-sub">Access details, key notes, and ownership for every platform we operate.</p>
        <hr className="section-rule" />

        {error && <div className="alert alert-error">{error}</div>}

        <div className="toolbar">
          <div className="search-box">
            <input
              className="search-input"
              type="text"
              placeholder="Search platforms, notes, owners…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {cats.length > 0 && (
          <div className="filter-row">
            <button className={`filter-pill${!cat ? ' active' : ''}`} onClick={() => setCat('')}>All</button>
            {cats.map(c => (
              <button key={c} className={`filter-pill${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
        )}

        <p className="results-label">{filtered.length} platform{filtered.length !== 1 ? 's' : ''}</p>

        {filtered.length === 0 ? (
          <div className="empty-state"><h3>No platforms found</h3><p>Try a different search.</p></div>
        ) : (
          <div className="platform-grid">
            {filtered.map(p => (
              <div key={p.id} className="platform-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <strong style={{ fontSize: 14, fontWeight: 700, color: 'var(--charcoal)' }}>{p['Platform'] || 'Unnamed'}</strong>
                  <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                    {p['Status'] && (
                      <span className={`badge ${p['Status'] === 'Live' ? 'badge-live' : 'badge-draft'}`}>{p['Status']}</span>
                    )}
                    {p['Category'] && <span className="badge badge-cat">{p['Category']}</span>}
                  </div>
                </div>
                {p['Summary'] && (
                  <p style={{ fontSize: 12, color: 'var(--charcoal-70)', lineHeight: 1.55 }}>{p['Summary']}</p>
                )}
                {p['Key Notes'] && (
                  <div className="platform-notes-box">
                    <p className="platform-notes-label">Key Notes</p>
                    <p className="platform-notes-text">{p['Key Notes']}</p>
                  </div>
                )}
                {(p['Login / Access'] || p['Owned By']) && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--charcoal-45)', lineHeight: 1.6 }}>
                    {p['Login / Access'] && <div>Access: {p['Login / Access']}</div>}
                    {p['Owned By'] && <div>Owner: {p['Owned By']}</div>}
                  </div>
                )}
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
    const platforms = await getPlatforms();
    return { props: { platforms, error: null } };
  } catch (e) {
    return { props: { platforms: [], error: e.message } };
  }
}
