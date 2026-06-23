import Link from 'next/link';
import OsLayout from '../components/OsLayout';

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
    icon: '🌍',
    name: 'Global',
    desc: 'United Kingdom and Middle East operations — Shopify, Amazon, affiliates, launch, registrations.',
  },
  {
    href: '/kb',
    eyebrow: 'Company-Wide',
    icon: '📋',
    name: 'Knowledge Base',
    desc: 'Products, SOPs, contacts, platforms, and regulatory reference across all markets.',
  },
  {
    href: '/partner-brands',
    eyebrow: 'Company-Wide',
    icon: '🤝',
    name: 'Partner Brands',
    desc: 'Third-party brands, therapeutic categories, distributor data, and pricing reference.',
  },
  {
    href: '/affiliates',
    eyebrow: 'Company-Wide',
    icon: '📊',
    name: 'Affiliate Ops',
    desc: 'Affiliate performance, sales, payouts, traffic, product concentration, and programme tasks.',
  },
];

export default function Home() {
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
