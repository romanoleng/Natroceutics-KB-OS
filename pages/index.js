import Link from 'next/link';
import OsLayout from '../components/OsLayout';
import { IconGlobe, IconBook, IconHandshake, IconUpload, IconLeaf } from '../components/Icons';

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
    href: '/upload',
    eyebrow: 'Data In',
    icon: <IconUpload />,
    name: 'Upload Data',
    desc: 'Drop sellerboard and pricing exports straight onto the dashboards — no tools needed.',
  },
  {
    href: '/guide',
    eyebrow: 'Reference',
    icon: <IconLeaf />,
    name: 'How the OS Works',
    desc: 'Where the data comes from, how current it is, and what to do when something looks off.',
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
