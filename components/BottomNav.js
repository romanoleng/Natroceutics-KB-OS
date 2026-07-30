import Link from 'next/link';
import { useRouter } from 'next/router';

/* Minimal stroke icons, Apple-tab-bar sized. */
const HomeIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/></svg>;
const MenuIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>;

/**
 * App-style bottom tab bar — touch devices only (hidden for mouse pointers).
 * Fixed set per Romano's spec: Home · UK · ME · SA · Menu.
 *
 * Deliberately containing NO positioning logic: inside the touch app-shell
 * (see OsLayout/globals.css) the document doesn't scroll, the shell is a
 * 100dvh flex column, and this bar is its last static child. Nothing scrolls,
 * so nothing can move or hide it. Hard-won lesson: every clever fixed/JS
 * positioning approach lost to iOS Safari eventually.
 */
const TABS = [
  { href: '/',     label: 'Home', icon: HomeIcon },
  { href: '/uk',   label: 'UK',   icon: <span className="bottom-nav-flag">🇬🇧</span> },
  { href: '/me',   label: 'ME',   icon: <span className="bottom-nav-flag">🇦🇪</span> },
  { href: '/sa',   label: 'SA',   icon: <span className="bottom-nav-flag">🇿🇦</span> },
  { href: '/menu', label: 'Menu', icon: MenuIcon },
];

export default function BottomNav() {
  const router = useRouter();
  if (router.pathname === '/login') return null;

  const isActive = href => (href === '/' ? router.pathname === '/' : router.pathname.startsWith(href));

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.map(t => (
        <Link key={t.href} href={t.href} className={`bottom-nav-item${isActive(t.href) ? ' bottom-nav-item--active' : ''}`}>
          <span className="bottom-nav-icon">{t.icon}</span>
          <span className="bottom-nav-label">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
