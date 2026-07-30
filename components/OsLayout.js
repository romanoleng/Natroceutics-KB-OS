import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

/* ── Brand SVG icons — forest green, stroke-based ── */
function IconGlobe() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="7" cy="7" r="5.5"/>
      <path d="M7 1.5c-1.8 1.8-2.8 3.3-2.8 5.5s1 3.7 2.8 5.5"/>
      <path d="M7 1.5c1.8 1.8 2.8 3.3 2.8 5.5s-1 3.7-2.8 5.5"/>
      <line x1="1.5" y1="7" x2="12.5" y2="7"/>
    </svg>
  );
}

function IconBook() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="2" y="2" width="10" height="10" rx="1.5"/>
      <line x1="5" y1="2" x2="5" y2="12"/>
      <line x1="7" y1="5.5" x2="10" y2="5.5"/>
      <line x1="7" y1="8" x2="10" y2="8"/>
    </svg>
  );
}

function IconPartners() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="4.5" cy="7" r="2.5"/>
      <circle cx="9.5" cy="7" r="2.5"/>
      <line x1="7" y1="7" x2="7" y2="7" strokeWidth="2.5"/>
    </svg>
  );
}

function IconTasks() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="10" height="10" rx="1.5"/>
      <polyline points="5,7 6.5,8.5 9.5,5.5"/>
    </svg>
  );
}

function IconGuide() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="7" cy="7" r="5.5"/>
      <path d="M5.4 5.3a1.7 1.7 0 1 1 1.9 2.3v.9"/>
      <line x1="7.2" y1="10.3" x2="7.2" y2="10.3" strokeWidth="2"/>
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 9.5V2.5"/>
      <polyline points="4,5 7,2 10,5"/>
      <path d="M2 9.5v2A1.5 1.5 0 0 0 3.5 13h7a1.5 1.5 0 0 0 1.5-1.5v-2"/>
    </svg>
  );
}

const MODULES = [
  { href: '/sa',             code: 'SA',       icon: <span className="os-flag">🇿🇦</span>, label: 'South Africa' },
  { href: '/global',         code: 'GLOBAL',   icon: <IconGlobe />,                         label: 'Global' },
  { href: '/kb',             code: 'KB',        icon: <IconBook />,                          label: 'Knowledge Base' },
  { href: '/partner-brands', code: 'PARTNERS',  icon: <IconPartners />,                      label: 'Partner Brands' },
  { href: '/all-tasks',      code: 'TASKS',     icon: <IconTasks />,                         label: 'All Tasks' },
  { href: '/upload',         code: 'UPLOAD',    icon: <IconUpload />,                        label: 'Upload Data' },
  { href: '/guide',          code: 'GUIDE',     icon: <IconGuide />,                         label: 'How the OS Works' },
];

function fmtServerTime(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return null; }
}

export default function OsLayout({ children, title = 'Natroceutics OS', airtableUrl, serverTime }) {
  const router = useRouter();
  const isHome = router.pathname === '/';

  function isActive(href) {
    return router.pathname === href || router.pathname.startsWith(href + '/');
  }

  const updatedLabel = fmtServerTime(serverTime);

  return (
    <>
      <Head>
        <title>{title} · Natroceutics OS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <header className="os-header">
        <div className="os-header-inner">
          <Link href="/" className="os-wordmark">
            Natroceutics<sup>®</sup><span className="os-wordmark-sub">OS</span>
          </Link>

          {!isHome && (
            <nav className="os-region-switcher">
              {MODULES.map(m => (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`os-region-pill${isActive(m.href) ? ' active' : ''}`}
                  title={m.label}
                >
                  <span className="os-region-pill-flag">{m.icon}</span>
                  <span className="os-region-pill-code">{m.code}</span>
                </Link>
              ))}
            </nav>
          )}

          <div className="os-header-actions">
            {updatedLabel && (
              <span className="os-last-updated" title={`Data fetched: ${serverTime}`}>
                ↻ {updatedLabel}
              </span>
            )}
            {airtableUrl && (
              <a href={airtableUrl} target="_blank" rel="noopener noreferrer" className="os-airtable-btn">
                Airtable
              </a>
            )}
            <a href="/api/logout" className="os-logout">Logout</a>
          </div>
        </div>
      </header>

      <main className="os-main">
        {children}
      </main>

      <footer className="os-footer">
        <div className="os-footer-inner">
          <span>Natroceutics<sup>®</sup> OS · Internal · Confidential</span>
          <span className="os-footer-tag">We are efficacy first.</span>
        </div>
      </footer>
    </>
  );
}
