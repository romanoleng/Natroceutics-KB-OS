import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import SortableTable from '../components/SortableTable';
import { getContacts } from '../lib/airtable';

function downloadCSV(rows, filename) {
  if (!rows || !rows.length) return;
  const keys = Object.keys(rows[0]).filter(k => !k.startsWith('_'));
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = filename + '.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

const csvBtnStyle = { fontSize: 11, fontWeight: 600, padding: '4px 10px', border: '1px solid var(--cream-dark)', borderRadius: 6, background: 'transparent', color: 'var(--forest-600)', cursor: 'pointer' };

export default function ContactsPage({ contacts, error }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [region, setRegion] = useState('');

  const cats    = useMemo(() => [...new Set(contacts.map(c => c['Category']).filter(Boolean))].sort(), [contacts]);
  const regions = useMemo(() => [...new Set(contacts.map(c => c['Region']).filter(Boolean))].sort(), [contacts]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter(c => {
      const matchQ =
        !q ||
        (c['Name'] || '').toLowerCase().includes(q) ||
        (c['Company'] || '').toLowerCase().includes(q) ||
        (c['Role'] || '').toLowerCase().includes(q) ||
        (c['Email'] || '').toLowerCase().includes(q);
      return matchQ && (!cat || c['Category'] === cat) && (!region || c['Region'] === region);
    });
  }, [contacts, search, cat, region]);

  return (
    <Layout title="Vendor Contacts">
      <div className="page-wrap">
        <p className="section-eyebrow">Partners</p>
        <h1 className="section-title">Vendor Contacts</h1>
        <p className="section-sub">Suppliers, agencies, and partners across all regions.</p>
        <hr className="section-rule" />

        {error && <div className="alert alert-error">{error}</div>}

        <div className="toolbar">
          <div className="search-box">
            <input
              className="search-input"
              type="text"
              placeholder="Search names, companies, roles…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {cats.length > 0 && (
          <div className="filter-row">
            <button className={`filter-pill${!cat ? ' active' : ''}`} onClick={() => setCat('')}>All Categories</button>
            {cats.map(c => (
              <button key={c} className={`filter-pill${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
        )}

        {regions.length > 0 && (
          <div className="filter-row">
            <button className={`filter-pill${!region ? ' active' : ''}`} onClick={() => setRegion('')}>All Regions</button>
            {regions.map(r => (
              <button key={r} className={`filter-pill${region === r ? ' active' : ''}`} onClick={() => setRegion(r)}>{r}</button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p className="results-label">{filtered.length} contact{filtered.length !== 1 ? 's' : ''}</p>
          {filtered.length > 8 && (
            <button style={csvBtnStyle} onClick={() => downloadCSV(filtered, 'vendor-contacts')}>↓ CSV</button>
          )}
        </div>

        <SortableTable
          cols={[
            { label: 'Name', key: 'Name' },
            { label: 'Company', key: 'Company' },
            { label: 'Role', key: 'Role' },
            { label: 'Email', key: 'Email' },
            { label: 'Category', key: 'Category', w: 110 },
            { label: 'Region', key: 'Region', w: 90 },
          ]}
          data={filtered}
          renderRow={c => (
            <tr key={c.id}>
              <td><strong>{c['Name'] || '—'}</strong></td>
              <td>{c['Company'] || '—'}</td>
              <td style={{ color: 'var(--charcoal-70)' }}>{c['Role'] || '—'}</td>
              <td>
                {c['Email']
                  ? <a href={`mailto:${c['Email']}`} style={{ color: 'var(--forest-600)', fontSize: 12 }}>{c['Email']}</a>
                  : '—'}
              </td>
              <td>{c['Category'] ? <span className="badge badge-cat">{c['Category']}</span> : '—'}</td>
              <td style={{ fontSize: 11 }}>{c['Region'] || '—'}</td>
            </tr>
          )}
          emptyMsg="No contacts found."
        />
      </div>
    </Layout>
  );
}

export async function getServerSideProps() {
  try {
    const contacts = await getContacts();
    return { props: { contacts, error: null } };
  } catch (e) {
    return { props: { contacts: [], error: e.message } };
  }
}
