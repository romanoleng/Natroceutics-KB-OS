/**
 * IRELAND — Distribution Market Module
 * Scaffolded and ready for Airtable base connection.
 * Set env var AIRTABLE_IE_BASE_ID to activate live data.
 */
import { useState } from 'react';
import Link from 'next/link';
import OsLayout from '../components/OsLayout';

const TABS = ['Tasks', 'Priorities', 'Risks', 'Inventory', 'Customers', 'B2B', 'Finance', 'Marketing', 'Customer Service', 'Reporting', 'Documents'];

function ComingSoonTab({ tab }) {
  return (
    <div className="stub-tab-content">
      <div className="stub-tab-inner">
        <p className="stub-tab-icon">🔗</p>
        <h3 className="stub-tab-title">{tab}</h3>
        <p className="stub-tab-body">This section is ready to connect. Add an Airtable base for Ireland operations and set the <code>AIRTABLE_IE_BASE_ID</code> environment variable in Vercel to populate this tab with live data.</p>
        <Link href="/global" className="stub-tab-back">← Back to Global</Link>
      </div>
    </div>
  );
}

export default function IrelandPage() {
  const [tab, setTab] = useState('Tasks');

  return (
    <OsLayout title="Ireland">
      <section className="region-hero region-hero-stub">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Distribution Market · Module Scaffolded</p>
          <h1 className="os-region-title">🇮🇪 Ireland</h1>
          <div className="region-hero-stats">
            <div className="rhs"><span className="rhs-num">—</span><span className="rhs-label">Tasks</span></div>
            <div className="rhs"><span className="rhs-num">—</span><span className="rhs-label">Inventory SKUs</span></div>
            <div className="rhs"><span className="rhs-num">—</span><span className="rhs-label">Customers</span></div>
            <div className="rhs"><span className="rhs-num">—</span><span className="rhs-label">Open Risks</span></div>
          </div>
        </div>
      </section>

      <div className="os-page-wrap">
        <div className="stub-connect-banner">
          <div className="stub-connect-inner">
            <strong>Connect Airtable to activate this module.</strong>
            <span> Create an Ireland Operations base in Airtable, then add <code>AIRTABLE_IE_BASE_ID</code> to your Vercel environment variables and redeploy.</span>
          </div>
          <Link href="/global" className="stub-connect-back">← Global</Link>
        </div>

        <div className="os-subnav">
          {TABS.map(t => (
            <button key={t} className={`os-subnav-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        <div className="os-tab-content">
          <ComingSoonTab tab={tab} />
        </div>
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
