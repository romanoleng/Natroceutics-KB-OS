import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

const MODULES = [
  { href: '/sa',             code: 'SA',       flag: '🇿🇦', label: 'South Africa' },
  { href: '/global',         code: 'GLOBAL',   flag: '🌍',  label: 'Global (UK + ME)' },
  { href: '/kb',             code: 'KB',        flag: '📋',  label: 'Knowledge Base' },
  { href: '/partner-brands', code: 'PARTNERS',  flag: '🤝',  label: 'Partner Brands' },
  { href: '/all-tasks',      code: 'TASKS',     flag: '✅',  label: 'All Tasks' },
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
                  <span className="os-region-pill-flag">{m.flag}</span>
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
                ⊞ Airtable
              </a>
            )}
            <a href="/api/logout" className="os-logout">↩ Logout</a>
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
