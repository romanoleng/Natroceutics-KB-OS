import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { getAllItems } from '../lib/airtable';

export default function KnowledgePage({ items, error }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('');

  const cats = useMemo(() => [...new Set(items.map(i => i.category).filter(Boolean))].sort(), [items]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return items.filter(item => {
      const matchQ =
        !q ||
        (item.title || '').toLowerCase().includes(q) ||
        (item.content || '').toLowerCase().includes(q) ||
        (item.tags || '').toLowerCase().includes(q);
      return matchQ && (!cat || item.category === cat);
    });
  }, [items, query, cat]);

  return (
    <Layout title="Knowledge Base">
      <div className="page-wrap">
        <p className="section-eyebrow">Knowledge</p>
        <h1 className="section-title">Knowledge Items</h1>
        {!error && (
          <p className="section-sub">{items.length} entries across {cats.length} categories.</p>
        )}
        <hr className="section-rule" />

        {error && <div className="alert alert-error">{error}</div>}

        {!error && (
          <>
            <div className="toolbar">
              <div className="search-box">
                <input
                  className="search-input"
                  type="text"
                  placeholder="Search knowledge, tags…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
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

            <p className="results-label">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>

            {filtered.length === 0 ? (
              <div className="empty-state">
                <h3>No results</h3>
                <p>Try a different search or clear the filter.</p>
              </div>
            ) : (
              <div className="k-grid">
                {filtered.map(item => {
                  const tags = typeof item.tags === 'string'
                    ? item.tags.split(',').map(t => t.trim()).filter(Boolean)
                    : [];
                  const dateStr = item.last_updated
                    ? new Date(item.last_updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : null;
                  return (
                    <div key={item.id} className="k-card">
                      <div className="k-card-top">
                        <div className="k-card-title">{item.title || 'Untitled'}</div>
                        {item.category && <span className="badge badge-cat">{item.category}</span>}
                      </div>
                      {item.content && (
                        <p className="k-card-body">{item.content}</p>
                      )}
                      {tags.length > 0 && (
                        <div className="k-tags">
                          {tags.map(t => <span key={t} className="k-tag">{t}</span>)}
                        </div>
                      )}
                      {dateStr && (
                        <div className="k-meta"><span>{dateStr}</span></div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

export async function getServerSideProps() {
  try {
    const items = await getAllItems();
    return { props: { items, error: null } };
  } catch (e) {
    return { props: { items: [], error: e.message } };
  }
}
