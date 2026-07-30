import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import QuickAdd from './QuickAdd';
import BottomNav from './BottomNav';

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
  const updatedLabel = fmtServerTime(serverTime);

  return (
    <>
      <Head>
        <title>{title} · Natroceutics OS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <header className="os-header">
        <div className="os-header-inner">
          <Link href="/" className="os-wordmark">
            Natroceutics<sup>®</sup><span className="os-wordmark-sub">OS</span>
          </Link>


          <div className="os-header-actions">
            {updatedLabel && (
              <span className="os-last-updated" title={`Data fetched: ${serverTime}`}>
                ↻ {updatedLabel}
              </span>
            )}
            {/* Airtable button retired — the database is the data home now. */}
            <Link href="/settings" className="os-settings-link" title="Settings" aria-label="Settings">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"/></svg>
            </Link>
            <a href="/api/logout" className="os-logout">Logout</a>
          </div>
        </div>
      </header>

      <main className="os-main os-main--with-tabbar">
        {children}
      </main>

      <QuickAdd />
      <BottomNav />

      <footer className="os-footer">
        <div className="os-footer-inner">
          <span>Natroceutics<sup>®</sup> OS · Internal · Confidential</span>
          <span className="os-footer-tag">We are efficacy first.</span>
        </div>
      </footer>
    </>
  );
}
