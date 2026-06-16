import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Layout({ children, title = 'Natroceutics OS' }) {
  const router = useRouter();
  const isActive = (path) => router.pathname === path;

  return (
    <>
      <Head>
        <title>{title} · Natroceutics OS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </Head>
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="nav-brand">N® OS</Link>
          <div className="nav-links">
            <Link href="/knowledge" style={isActive('/knowledge') ? { color: '#eeebe1' } : {}}>
              Knowledge Base
            </Link>
            <Link href="/admin" style={isActive('/admin') ? { color: '#eeebe1' } : {}}>
              Add Entry
            </Link>
          </div>
        </div>
      </nav>
      {children}
      <footer className="footer">
        NATROCEUTICS® · KNOWLEDGE BASE OS · WE ARE EFFICACY FIRST.
      </footer>
    </>
  );
}
