/**
 * GLOBAL HUB — UK and Middle East summary tiles.
 * Click through to /uk or /me for the full module.
 */
import Link from 'next/link';
import OsLayout from '../components/OsLayout';
import {
  getUKTasks, getUKRisks, getUKAmazon, getUKEmailList, getUKAffiliates,
  getMETasks, getMERisks, getMERegistrations, getMEPartners,
} from '../lib/airtable';

function fmt(v){ return (v===null||v===undefined||v==='')?'—':v; }

export default function GlobalPage({ uk, me, error }) {
  const ukOpenRisks = uk.risks.filter(r=>!['Resolved','Closed','Done'].includes(r.Status)).length;
  const ukReorder = uk.amazon.filter(p=>p.Reorder==='Yes'||p.Reorder===true).length;
  const meOpenRisks = me.risks.filter(r=>!['Resolved','Closed','Done'].includes(r.Status)).length;
  const meRegistered = me.registrations.filter(r=>['Approved','Registered','Done','Complete'].includes(r['Registration Status'])).length;
  const meEligible = me.registrations.filter(r=>r['Eligible for ME Launch']===true||r['Eligible for ME Launch']==='true').length;

  return (
    <OsLayout title="Global">
      <section className="os-hero">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Global Operations</p>
          <h1 className="os-hero-title">🌍 Global</h1>
          <p className="os-hero-sub">Select a regional module to view full operations.</p>
        </div>
      </section>

      <div className="os-page-wrap">
        {error && <div className="os-alert-error">{error}</div>}

        <div className="global-hub-grid">

          {/* ── UK Card ── */}
          <div className="ghub-card">
            <div className="ghub-card-head">
              <div>
                <p className="ghub-card-eyebrow">Regional Module</p>
                <h2 className="ghub-card-title">🇬🇧 United Kingdom</h2>
              </div>
              <Link href="/uk" className="ghub-card-btn">Open full module →</Link>
            </div>

            <div className="ghub-stat-row">
              <div className="ghub-stat"><span className="ghub-stat-num">{uk.tasks.length}</span><span className="ghub-stat-label">Open Tasks</span></div>
              <div className="ghub-stat"><span className="ghub-stat-num">{uk.amazon.length}</span><span className="ghub-stat-label">Amazon SKUs</span></div>
              {ukReorder>0&&<div className="ghub-stat ghub-stat-alert"><span className="ghub-stat-num">{ukReorder}</span><span className="ghub-stat-label">Reorder Required</span></div>}
              <div className="ghub-stat"><span className="ghub-stat-num">{uk.emailList.length}</span><span className="ghub-stat-label">Email Subscribers</span></div>
              <div className="ghub-stat"><span className="ghub-stat-num">{uk.affiliates.length}</span><span className="ghub-stat-label">Affiliates</span></div>
              {ukOpenRisks>0&&<div className="ghub-stat ghub-stat-alert"><span className="ghub-stat-num">{ukOpenRisks}</span><span className="ghub-stat-label">Open Risks</span></div>}
            </div>

            <div className="ghub-quick-links">
              <span className="ghub-ql-label">Quick access</span>
              {['Tasks','Amazon UK','Shopify','Stock','Affiliates','Email / Klaviyo','Finance'].map(t=>(
                <Link key={t} href={`/uk?tab=${encodeURIComponent(t)}`} className="ghub-ql-pill">{t}</Link>
              ))}
            </div>
          </div>

          {/* ── ME Card ── */}
          <div className="ghub-card">
            <div className="ghub-card-head">
              <div>
                <p className="ghub-card-eyebrow">Regional Module · Launch Stage</p>
                <h2 className="ghub-card-title">🇦🇪 Middle East</h2>
              </div>
              <Link href="/me" className="ghub-card-btn">Open full module →</Link>
            </div>

            <div className="ghub-stat-row">
              <div className="ghub-stat"><span className="ghub-stat-num">{me.tasks.length}</span><span className="ghub-stat-label">Launch Tasks</span></div>
              <div className="ghub-stat"><span className="ghub-stat-num">{meRegistered}/{me.registrations.length}</span><span className="ghub-stat-label">Registrations</span></div>
              <div className="ghub-stat"><span className="ghub-stat-num">{meEligible}</span><span className="ghub-stat-label">ME Launch Ready</span></div>
              <div className="ghub-stat"><span className="ghub-stat-num">{me.partners.length}</span><span className="ghub-stat-label">Partners</span></div>
              {meOpenRisks>0&&<div className="ghub-stat ghub-stat-alert"><span className="ghub-stat-num">{meOpenRisks}</span><span className="ghub-stat-label">Open Risks</span></div>}
            </div>

            <div className="ghub-quick-links">
              <span className="ghub-ql-label">Quick access</span>
              {['Tasks','Registrations','Inventory','Affiliates','B2B','Partners','Finance','Subscriptions','Email / Klaviyo'].map(t=>(
                <Link key={t} href={`/me?tab=${encodeURIComponent(t)}`} className="ghub-ql-pill">{t}</Link>
              ))}
            </div>
          </div>

        </div>

        {/* ── Distribution Markets ── */}
        <div className="ghub-section-label">Distribution Markets</div>
        <div className="global-hub-grid global-hub-grid--3col">

          {/* Ireland */}
          <div className="ghub-card ghub-card--stub">
            <div className="ghub-card-head">
              <div>
                <p className="ghub-card-eyebrow">Distribution Market</p>
                <h2 className="ghub-card-title">🇮🇪 Ireland</h2>
              </div>
              <Link href="/ireland" className="ghub-card-btn ghub-card-btn--stub">Set up module →</Link>
            </div>
            <p className="ghub-stub-note">Module scaffolded. Connect an Airtable base to activate tasks, inventory, finance, customers, and reporting.</p>
            <div className="ghub-quick-links">
              <span className="ghub-ql-label">When active</span>
              {['Tasks','Inventory','Customers','Finance','Reporting'].map(t=>(
                <span key={t} className="ghub-ql-pill ghub-ql-pill--stub">{t}</span>
              ))}
            </div>
          </div>

          {/* New Zealand */}
          <div className="ghub-card ghub-card--stub">
            <div className="ghub-card-head">
              <div>
                <p className="ghub-card-eyebrow">Distribution Market</p>
                <h2 className="ghub-card-title">🇳🇿 New Zealand</h2>
              </div>
              <Link href="/nz" className="ghub-card-btn ghub-card-btn--stub">Set up module →</Link>
            </div>
            <p className="ghub-stub-note">Module scaffolded. Connect an Airtable base to activate tasks, inventory, finance, customers, and reporting.</p>
            <div className="ghub-quick-links">
              <span className="ghub-ql-label">When active</span>
              {['Tasks','Inventory','Customers','Finance','Reporting'].map(t=>(
                <span key={t} className="ghub-ql-pill ghub-ql-pill--stub">{t}</span>
              ))}
            </div>
          </div>

          {/* Bulgaria */}
          <div className="ghub-card ghub-card--stub">
            <div className="ghub-card-head">
              <div>
                <p className="ghub-card-eyebrow">Distribution Market</p>
                <h2 className="ghub-card-title">🇧🇬 Bulgaria</h2>
              </div>
              <Link href="/bulgaria" className="ghub-card-btn ghub-card-btn--stub">Set up module →</Link>
            </div>
            <p className="ghub-stub-note">Module scaffolded. Connect an Airtable base to activate tasks, inventory, finance, customers, and reporting.</p>
            <div className="ghub-quick-links">
              <span className="ghub-ql-label">When active</span>
              {['Tasks','Inventory','Customers','Finance','Reporting'].map(t=>(
                <span key={t} className="ghub-ql-pill ghub-ql-pill--stub">{t}</span>
              ))}
            </div>
          </div>

        </div>

        {/* ── Company-Wide Programmes ── */}
        <div className="ghub-section-label">Company-Wide Programmes</div>
        <div className="global-hub-grid global-hub-grid--3col">
          <div className="ghub-card">
            <div className="ghub-card-head">
              <div>
                <p className="ghub-card-eyebrow">Affiliate Programme</p>
                <h2 className="ghub-card-title">📊 Affiliate Ops</h2>
              </div>
              <Link href="/affiliates" className="ghub-card-btn">Open module →</Link>
            </div>
            <p className="ghub-stub-note">Affiliate performance, sales attribution, payouts, traffic, and programme tasks across all markets.</p>
            <div className="ghub-quick-links">
              <span className="ghub-ql-label">Quick access</span>
              {['Affiliates','Sales','Payouts','Traffic','Products','Tasks'].map(t=>(
                <Link key={t} href={`/affiliates`} className="ghub-ql-pill">{t}</Link>
              ))}
            </div>
          </div>
        </div>

      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  try {
    const [ukTasks, ukRisks, ukAmazon, ukEmailList, ukAffiliates, meTasks, meRisks, meRegistrations, mePartners] = await Promise.all([
      getUKTasks(), getUKRisks(), getUKAmazon(), getUKEmailList(), getUKAffiliates(),
      getMETasks(), getMERisks(), getMERegistrations(), getMEPartners(),
    ]);
    return { props: { uk: { tasks:ukTasks, risks:ukRisks, amazon:ukAmazon, emailList:ukEmailList, affiliates:ukAffiliates }, me: { tasks:meTasks, risks:meRisks, registrations:meRegistrations, partners:mePartners }, error: null } };
  } catch(e) {
    return { props: { uk: { tasks:[], risks:[], amazon:[], emailList:[], affiliates:[] }, me: { tasks:[], risks:[], registrations:[], partners:[] }, error: e.message } };
  }
}
