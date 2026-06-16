import Link from 'next/link';
import Layout from '../components/Layout';
import { getStats } from '../lib/airtable';

export default function Home({ stats, error }) {
  const catList = stats ? Object.entries(stats.categories) : [];

  return (
    <Layout title="Home">
      <div className="page">
        <div className="page-header">
          <p className="page-eyebrow">Internal · Confidential</p>
          <h1 className="page-title">Natroceutics<br />Knowledge Base OS</h1>
          <p className="page-sub">Enhancing health through nature-based therapeutics and nutrition.</p>
        </div>

        {!error && stats && (
          <div className="stats-grid" style={{ marginBottom: 32 }}>
            <div className="stat-tile">
              <span className="stat-num">{stats.total}</span>
              <span className="stat-label">Total Entries</span>
            </div>
            {catList.map(([cat, count]) => (
              <div className="stat-tile" key={cat}>
                <span className="stat-num">{count}</span>
                <span className="stat-label">{cat}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 32 }}>
            Could not connect to Airtable. Check your environment variables.
          </div>
        )}

        <div className="nav-cards">
          <Link href="/knowledge" className="nav-card">
            <p className="nav-card-eyebrow">Browse</p>
            <p className="nav-card-title">Knowledge Base</p>
            <p className="nav-card-desc">Search, filter, and explore all entries across categories.</p>
          </Link>
          <Link href="/admin" className="nav-card">
            <p className="nav-card-eyebrow">Admin</p>
            <p className="nav-card-title">Add Entry</p>
            <p className="nav-card-desc">Create a new knowledge item and publish it to the base.</p>
          </Link>
        </div>
      </div>
    </Layout>
  );
}

export async function getServerSideProps() {
  try {
    const stats = await getStats();
    return { props: { stats, error: null } };
  } catch (e) {
    return { props: { stats: null, error: e.message } };
  }
}
