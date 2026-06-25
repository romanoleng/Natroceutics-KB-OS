import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

const NAV = [
  { href: '/',           label: 'Home' },
  { href: '/products',   label: 'Products' },
  { href: '/sops',       label: 'SOPs' },
  { href: '/platforms',  label: 'Platforms' },
  { href: '/contacts',   label: 'Contacts' },
  { href: '/regulatory', label: 'Regulatory' },
  { href: '/knowledge',  label: 'Knowledge' },
  { href: '/admin',      label: 'Add Entry' },
];

export default function Layout({ children, title = 'Natroceutics KB OS' }) {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>{title} · Natroceutics®</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <header className="site-header">
        <div className="header-bar">
          <Link href="/" className="header-brand">
            Natroceutics<sup>®</sup>
          </Link>
          <nav className="header-nav">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`nav-link${router.pathname === href ? ' active' : ''}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <span className="header-badge">Internal</span>
          <a href="/api/logout" className="logout-btn" title="Log out">↩ Logout</a>
        </div>
      </header>

      {children}

      <footer className="site-footer">
        <div className="footer-inner">
          <span className="footer-brand">Natroceutics<sup>®</sup></span>
          <span className="footer-tagline">We are efficacy first · Internal · Confidential</span>
        </div>
      </footer>
    </>
  );
}
