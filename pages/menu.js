import Link from 'next/link';
import OsLayout from '../components/OsLayout';

/**
 * /menu — everything in the OS, one tap away. The bottom bar's fifth tab.
 *
 * Regions are collapsible (native <details>, same proven pattern as the +
 * sheet): tap a region to reveal its module link plus deep links into its
 * sections — UK's ?s= desks, and the ?t= tabs wired into ME/SA/PT.
 */
const COMPANY = [
  { href: '/kb',             icon: '📋', name: 'Knowledge Base' },
  { href: '/partner-brands', icon: '🤝', name: 'Partner Brands' },
  { href: '/all-tasks',      icon: '✅', name: 'All Tasks' },
];

const REGIONS = [
  {
    icon: '🇬🇧', name: 'United Kingdom', href: '/uk',
    subs: [
      { href: '/uk?s=amazon',    icon: '📦', name: 'Amazon' },
      { href: '/uk?s=shopify',   icon: '🛒', name: 'Shopify' },
      { href: '/uk?s=warehouse', icon: '🏭', name: 'Warehouse' },
    ],
  },
  {
    icon: '🇦🇪', name: 'Middle East', href: '/me',
    subs: [
      { href: '/me?t=registrations', icon: '📑', name: 'Registrations' },
      { href: '/me?t=inventory',     icon: '📦', name: 'Inventory' },
      { href: '/me?t=finance',       icon: '💷', name: 'Finance' },
      { href: '/me?t=partners',      icon: '🤝', name: 'Partners' },
      { href: '/me?t=reporting',     icon: '📊', name: 'Reporting' },
    ],
  },
  {
    icon: '🇿🇦', name: 'South Africa', href: '/sa',
    subs: [
      { href: '/sa?t=inventory', icon: '📦', name: 'Inventory' },
      { href: '/sa?t=finance',   icon: '💷', name: 'Finance' },
      { href: '/sa?t=customers', icon: '👥', name: 'Customers' },
      { href: '/sa?t=reporting', icon: '📊', name: 'Reporting' },
    ],
  },
  {
    icon: '🇵🇹', name: 'Portugal', href: '/pt',
    subs: [
      { href: '/pt?t=inventory', icon: '📦', name: 'Inventory' },
      { href: '/pt?t=finance',   icon: '💷', name: 'Finance' },
      { href: '/pt?t=customers', icon: '👥', name: 'Customers' },
      { href: '/pt?t=reporting', icon: '📊', name: 'Reporting' },
    ],
  },
  { icon: '🌍', name: 'Global Overview', href: '/global', subs: [] },
];

const TOOLS = [
  { href: '/upload',   icon: '⬆️', name: 'Upload Data' },
  { href: '/guide',    icon: '📖', name: 'How the OS Works' },
  { href: '/settings', icon: '⚙️', name: 'Settings' },
];

function Tile({ href, icon, name }) {
  return (
    <Link href={href} className="menu-tile">
      <span className="menu-tile-icon">{icon}</span>
      <span className="menu-tile-name">{name}</span>
      <span className="menu-tile-arrow">→</span>
    </Link>
  );
}

export default function Menu() {
  return (
    <OsLayout title="Menu">
      <section className="os-hero">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Natroceutics OS</p>
          <h1 className="os-hero-title">Menu</h1>
        </div>
      </section>

      <div className="os-page-wrap">

        <h2 className="guide-h2">Company-wide</h2>
        <div className="menu-grid">
          {COMPANY.map(it => <Tile key={it.href} {...it} />)}
        </div>

        <h2 className="guide-h2">Regions</h2>
        <div className="menu-acc-list">
          {REGIONS.map(r => (
            r.subs.length === 0 ? (
              <Tile key={r.href} href={r.href} icon={r.icon} name={r.name} />
            ) : (
              <details key={r.href} className="menu-acc">
                <summary className="menu-tile menu-acc-summary">
                  <span className="menu-tile-icon">{r.icon}</span>
                  <span className="menu-tile-name">{r.name}</span>
                  <span className="menu-acc-chevron">▾</span>
                </summary>
                <div className="menu-acc-body">
                  <Link href={r.href} className="menu-tile menu-tile--sub">
                    <span className="menu-tile-icon">{r.icon}</span>
                    <span className="menu-tile-name">Open {r.name}</span>
                    <span className="menu-tile-arrow">→</span>
                  </Link>
                  {r.subs.map(s => (
                    <Link key={s.href} href={s.href} className="menu-tile menu-tile--sub">
                      <span className="menu-tile-icon">{s.icon}</span>
                      <span className="menu-tile-name">{s.name}</span>
                      <span className="menu-tile-arrow">→</span>
                    </Link>
                  ))}
                </div>
              </details>
            )
          ))}
        </div>

        <h2 className="guide-h2">Tools</h2>
        <div className="menu-grid">
          {TOOLS.map(it => <Tile key={it.href} {...it} />)}
        </div>

      </div>
    </OsLayout>
  );
}
