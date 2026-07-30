import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

/* Minimal stroke icons, Apple-tab-bar sized. */
const HomeIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/></svg>;
const MenuIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>;

/**
 * App-style bottom tab bar — touch devices (hidden for mouse pointers by CSS).
 * Fixed set per Romano's spec: Home · UK · ME · SA · Menu.
 *
 * Positioning: iOS Safari's LAYOUT viewport drifts from the VISUAL one under
 * zoom and dynamic-toolbar transitions, which repeatedly stranded a
 * bottom-anchored fixed bar off-screen on the real device. So the bar tracks
 * window.visualViewport directly — the same technique native-feeling web apps
 * use — with plain `bottom: 0` as the fallback where the API is missing.
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
  const ref = useRef(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;

    let raf = 0;
    const place = () => {
      raf = 0;
      // Anchor the bar's bottom edge to the visual viewport's bottom edge,
      // regardless of zoom level or toolbar state.
      const bottomGap = window.innerHeight - (vv.offsetTop + vv.height);
      el.style.bottom = `${Math.max(0, bottomGap)}px`;
      // Under pinch-zoom the visual viewport narrows/offsets — keep the bar
      // spanning exactly what the user can see.
      el.style.left = `${vv.offsetLeft}px`;
      el.style.width = `${vv.width}px`;
      el.style.right = 'auto';
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(place); };

    place();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      window.removeEventListener('orientationchange', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (router.pathname === '/login') return null;

  const isActive = href => (href === '/' ? router.pathname === '/' : router.pathname.startsWith(href));

  return (
    <nav className="bottom-nav" aria-label="Primary" ref={ref}>
      {TABS.map(t => (
        <Link key={t.href} href={t.href} className={`bottom-nav-item${isActive(t.href) ? ' bottom-nav-item--active' : ''}`}>
          <span className="bottom-nav-icon">{t.icon}</span>
          <span className="bottom-nav-label">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
