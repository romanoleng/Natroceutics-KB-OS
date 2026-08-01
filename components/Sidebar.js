import Link from 'next/link';
import { useRouter } from 'next/router';
import { COMPANY, REGIONS, TOOLS } from './nav-tree';

/**
 * Desktop left rail — the desktop expression of the same tree the mobile
 * bottom bar + /menu page render. Renders from components/nav-tree.js so the
 * two surfaces cannot drift.
 *
 * Desktop-only by CSS: shown at (min-width: 1024px) and (pointer: fine).
 * Coarse pointers (iPad landscape included) keep the bottom bar instead —
 * see the .bottom-nav media rule this complements.
 *
 * The active region's <details> is open on load (keyed remount when the
 * route's region changes); others start closed but stay freely toggleable.
 */

/** Active when pathname matches and, if the href carries a query, it matches too. */
function isActive(router, href) {
  const [path, qs] = href.split('?');
  if (router.pathname !== path) return false;
  if (!qs) return true;
  const want = Object.fromEntries(new URLSearchParams(qs));
  return Object.entries(want).every(
    ([k, v]) => String(router.query[k] ?? '').toLowerCase() === v.toLowerCase()
  );
}

/** True when the current route lives anywhere inside this region. */
function inRegion(router, region) {
  if (router.pathname === region.href) return true;
  return region.subs.some(s => router.pathname === s.href.split('?')[0]);
}

function Item({ href, icon, name, active, sub }) {
  return (
    <Link href={href} className={`sb-item${sub ? ' sb-item--sub' : ''}${active ? ' sb-item--active' : ''}`}>
      <span className="sb-item-icon">{icon}</span>
      <span className="sb-item-name">{name}</span>
    </Link>
  );
}

export default function Sidebar() {
  const router = useRouter();

  return (
    <aside className="os-sidebar" aria-label="Primary">
      {/* The header wordmark is hidden on desktop (the rail carries the brand),
          so this has to be the way home or there isn't one. */}
      <Link href="/" className="sb-brand">
        <span className="sb-brand-mark">Natroceutics<sup>®</sup></span>
        <span className="sb-brand-os">OS</span>
      </Link>

      <nav className="sb-scroll">
        <p className="sb-eyebrow">Company-wide</p>
        {COMPANY.map(it => (
          <Item key={it.href} {...it} active={isActive(router, it.href)} />
        ))}

        <p className="sb-eyebrow">Regions</p>
        {REGIONS.map(r => {
          const open = inRegion(router, r);
          if (!r.subs.length) {
            return <Item key={r.href} {...r} active={isActive(router, r.href)} />;
          }
          return (
            /* key includes `open` so route changes re-assert the default state */
            <details key={`${r.href}-${open}`} className="sb-region" open={open}>
              <summary className={`sb-item sb-region-summary${open ? ' sb-item--current' : ''}`}>
                <span className="sb-item-icon">{r.icon}</span>
                <span className="sb-item-name">{r.name}</span>
                <span className="sb-chevron" aria-hidden>▾</span>
              </summary>
              <div className="sb-region-body">
                <Item
                  href={r.overview || r.href} icon={r.icon} name="Overview" sub
                  active={
                    isActive(router, r.overview || r.href) ||
                    (router.pathname === r.href && !router.query.s && !router.query.t)
                  }
                />
                {r.subs.map(s => {
                  const active = isActive(router, s.href);
                  return (
                    <div key={s.href}>
                      <Item {...s} sub active={active} />
                      {/* Third level — inner tabs, shown only for the ACTIVE
                          desk so the rail stays compact. A tab lights up only
                          when ?tab= says so: we do not guess the page's
                          default tab from here. */}
                      {active && s.tabs && (
                        <div className="sb-tabs">
                          {s.tabs.map(t => (
                            <Link
                              key={t}
                              href={`${s.href}&tab=${encodeURIComponent(t)}`}
                              className={`sb-tab${router.query.tab === t ? ' sb-tab--active' : ''}`}
                            >
                              {t}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}

        <p className="sb-eyebrow">Tools</p>
        {TOOLS.map(it => (
          <Item key={it.href} {...it} active={isActive(router, it.href)} />
        ))}
      </nav>

      <div className="sb-foot">We are efficacy first.</div>
    </aside>
  );
}
