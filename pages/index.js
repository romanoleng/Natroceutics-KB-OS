import Link from 'next/link';
import OsLayout from '../components/OsLayout';
import { IconGlobe, IconBook, IconHandshake, IconUpload, IconLeaf } from '../components/Icons';
import { fetchFromMirror } from '../lib/mirror';
import { BASES, resolveBaseId } from '../lib/airtable-tables';
import { normaliseTask, buildToday, waitingBy } from '../lib/tasks';

const MODULES = [
  {
    href: '/sa',
    eyebrow: 'Regional Operations',
    icon: '🇿🇦',
    name: 'South Africa',
    desc: 'Tasks, priorities, risks, inventory, finance, B2B, customers, marketing, CS, and reporting.',
  },
  {
    href: '/global',
    eyebrow: 'Regional Operations',
    icon: <IconGlobe />,
    name: 'Global',
    desc: 'United Kingdom and Middle East operations — Shopify, Amazon, affiliates, launch, registrations.',
  },
  {
    href: '/kb',
    eyebrow: 'Company-Wide',
    icon: <IconBook />,
    name: 'Knowledge Base',
    desc: 'Products, SOPs, contacts, platforms, and regulatory reference across all markets.',
  },
  {
    href: '/partner-brands',
    eyebrow: 'Company-Wide',
    icon: <IconHandshake />,
    name: 'Partner Brands',
    desc: 'Third-party brands, therapeutic categories, distributor data, and pricing reference.',
  },
  {
    href: '/capture',
    eyebrow: 'Capture',
    icon: <IconUpload />,
    name: 'Capture',
    desc: 'Files, pastes and emails into the OS — sellerboard, stock takes, pricing, tasks.',
  },
  {
    href: '/guide',
    eyebrow: 'Reference',
    icon: <IconLeaf />,
    name: 'How the OS Works',
    desc: 'Where the data comes from, how current it is, and what to do when something looks off.',
  },
];

export default function Home({ day }) {
  return (
    <OsLayout title="Natroceutics OS">
      <section className="os-hero">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Internal Operations Platform</p>
          <h1 className="os-hero-title">Natroceutics<sup>®</sup> OS</h1>
          <p className="os-hero-sub">Select a module to continue.</p>
        </div>
      </section>

      <div className="os-page-wrap">
        {/* The day, before the modules. The bottom bar is fixed at five tabs by
            design, so Home is where the morning starts: one line, one tap. */}
        {day && (
          <Link href="/all-tasks" className="day-strip">
            <span className="day-strip-label">Today</span>
            <span className="day-strip-figs">
              {day.overdue > 0 && <b className="day-od">{day.overdue} overdue</b>}
              <span>{day.today} to work on</span>
              {day.waiting > 0 && <span>{day.waiting} waiting</span>}
              {day.blockers.length > 0 && (
                <span className="day-who">on {day.blockers.map(b => b.who).join(', ')}</span>
              )}
            </span>
            <span className="day-strip-go">→</span>
          </Link>
        )}

        <div className="module-grid">
          {MODULES.map(m => (
            <Link key={m.href} href={m.href} className="module-card">
              <span className="module-card-eyebrow">{m.eyebrow}</span>
              <span className="module-card-icon">{m.icon}</span>
              <span className="module-card-name">{m.name}</span>
              <p className="module-card-desc">{m.desc}</p>
              <span className="module-card-cta">Open module →</span>
            </Link>
          ))}
        </div>
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  // Cheap: reads the same mirror Today does, counts only. Never blocks the
  // page — a failure here just hides the strip.
  try {
    const regions = [['UK','United Kingdom','🇬🇧'],['ME','Middle East','🇦🇪'],
                     ['SA','South Africa','🇿🇦'],['PT','Portugal','🇵🇹'],['AFF','Affiliate Ops','🤝']];
    const all = [];
    for (const [key, label, flag] of regions) {
      const base = BASES[key];
      if (!base?.tables?.TASKS) continue;
      const baseId = resolveBaseId(base.envVar);
      const rows = (await fetchFromMirror(baseId, base.tables.TASKS)) || [];
      for (const r of rows) {
        all.push(normaliseTask({ ...r, _baseId: baseId, _tableId: base.tables.TASKS }, key, label, flag, 'TASKS'));
      }
    }
    const v = buildToday(all);
    return { props: { day: {
      overdue: v.counts.overdue, today: v.counts.today, waiting: v.counts.waiting,
      blockers: waitingBy(all).slice(0, 2),
    } } };
  } catch (e) {
    console.warn('[home] day strip failed:', e.message);
    return { props: { day: null } };
  }
}
