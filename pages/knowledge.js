import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import KnowledgeCard from '../components/KnowledgeCard';
import SearchBar from '../components/SearchBar';
import FilterBar from '../components/FilterBar';
import { getAllItems } from '../lib/airtable';

export default function Knowledge({ items, error }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  const categories = useMemo(() => {
    const cats = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
    return cats;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return items.filter(item => {
      const matchesQuery = !q ||
        (item.title || '').toLowerCase().includes(q) ||
        (item.content || '').toLowerCase().includes(q) ||
        (item.tags || '').toLowerCase().includes(q);
      const matchesCat = !category || item.category === category;
      return matchesQuery && matchesCat;
    });
  }, [items, query, category]);

  return (
    <Layout title="Knowledge Base">
      <div className="page">
        <div className="page-header">
          <p className="page-eyebrow">Internal · Natroceutics</p>
          <h1 className="page-title">Knowledge Base</h1>
          {!error && <p className="page-sub">{items.length} entries across {categories.length} categories</p>}
        </div>

        {error && (
          <div className="alert alert-error">{error}</div>
        )}

        {!error && (
          <>
            <div className="toolbar">
              <SearchBar value={query} onChange={setQuery} count={filtered.length} total={items.length} />
              {categories.length > 0 && (
                <FilterBar categories={categories} active={category} onChange={setCategory} />
              )}
            </div>

            {filtered.length > 0 ? (
              <div className="knowledge-grid">
                {filtered.map(item => <KnowledgeCard key={item.id} item={item} />)}
              </div>
            ) : (
              <div className="empty-state">
                <h3>No results</h3>
                <p>Try a different search or clear the filter.</p>
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
