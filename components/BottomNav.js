import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { NAV_MODULES, loadPins } from '../lib/nav-modules';

/* Minimal stroke icons, Apple-tab-bar sized. */
const ICONS = {
  HOME: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/></svg>,
  GLOBAL: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c-2.8 2.8-4.2 5.6-4.2 8.5s1.4 5.7 4.2 8.5M12 3.5c2.8 2.8 4.2 5.6 4.2 8.5s-1.4 5.7-4.2 8.5"/><path d="M3.5 12h17"/></svg>,
  SA: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5v17"/></svg>,
  KB: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M9 4v16M12.5 9.5H17M12.5 13H17"/></svg>,
  PARTNERS: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8.5" cy="12" r="4.2"/><circle cx="15.5" cy="12" r="4.2"/></svg>,
  TASKS: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="m8.5 12 2.5 2.5 5-5"/></svg>,
  UPLOAD: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4.5M8 8l4-3.5L16 8"/><path d="M4.5 15.5v3A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-3"/></svg>,
  GUIDE: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.2a2.6 2.6 0 1 1 3 3.5v1.4"/><path d="M12.3 17.2h.01" strokeWidth="2.4"/></svg>,
  SETTINGS: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"/></svg>,
};

const SHORT = { GLOBAL: 'Global', SA: 'SA', KB: 'KB', PARTNERS: 'Partners', TASKS: 'Tasks', UPLOAD: 'Upload', GUIDE: 'Guide' };

/**
 * App-style bottom tab bar — mobile only (hidden ≥768px by CSS).
 * Home and Settings are fixed; the middle slots are the user's pinned modules
 * (Settings → Navigation).
 */
export default function BottomNav() {
  const router = useRouter();
  const [pins, setPins] = useState(null);   // null until mounted — avoids hydration mismatch

  useEffect(() => {
    const refresh = () => setPins(loadPins());
    refresh();
    window.addEventListener('natro:navpins', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('natro:navpins', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (router.pathname === '/login') return null;

  const middle = (pins || []).map(code => NAV_MODULES.find(m => m.code === code)).filter(Boolean);
  const items = [
    { href: '/', code: 'HOME', short: 'Home' },
    ...middle.map(m => ({ href: m.href, code: m.code, short: SHORT[m.code] || m.label })),
    { href: '/settings', code: 'SETTINGS', short: 'Settings' },
  ];

  const isActive = href => (href === '/' ? router.pathname === '/' : router.pathname.startsWith(href));

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map(it => (
        <Link key={it.code} href={it.href} className={`bottom-nav-item${isActive(it.href) ? ' bottom-nav-item--active' : ''}`}>
          <span className="bottom-nav-icon">{ICONS[it.code] || ICONS.GLOBAL}</span>
          <span className="bottom-nav-label">{it.short}</span>
        </Link>
      ))}
    </nav>
  );
}
