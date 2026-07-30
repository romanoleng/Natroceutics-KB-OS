import Link from 'next/link';
import OsLayout from '../components/OsLayout';

/**
 * /menu — everything in the OS, one tap away. The bottom bar's fifth tab.
 * Regions the bar doesn't carry, company-wide modules, tools and settings.
 */
const GROUPS = [
  {
    title: 'Regions',
    items: [
      { href: '/uk',      icon: '🇬🇧', name: 'United Kingdom' },
      { href: '/me',      icon: '🇦🇪', name: 'Middle East' },
      { href: '/sa',      icon: '🇿🇦', name: 'South Africa' },
      { href: '/pt',      icon: '🇵🇹', name: 'Portugal' },
      { href: '/global',  icon: '🌍', name: 'Global Overview' },
    ],
  },
  {
    title: 'Company-wide',
    items: [
      { href: '/kb',             icon: '📋', name: 'Knowledge Base' },
      { href: '/partner-brands', icon: '🤝', name: 'Partner Brands' },
      { href: '/all-tasks',      icon: '✅', name: 'All Tasks' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { href: '/upload',   icon: '⬆️', name: 'Upload Data' },
      { href: '/guide',    icon: '📖', name: 'How the OS Works' },
      { href: '/settings', icon: '⚙️', name: 'Settings' },
    ],
  },
];

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
        {GROUPS.map(g => (
          <div key={g.title}>
            <h2 className="guide-h2">{g.title}</h2>
            <div className="menu-grid">
              {g.items.map(it => (
                <Link key={it.href} href={it.href} className="menu-tile">
                  <span className="menu-tile-icon">{it.icon}</span>
                  <span className="menu-tile-name">{it.name}</span>
                  <span className="menu-tile-arrow">→</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </OsLayout>
  );
}
