import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { COMPANY, REGIONS, TOOLS } from './nav-tree';

/**
 * Search across the whole OS: pages first, then records.
 *
 * Pages resolve instantly from the nav tree already in the bundle, so the
 * common case (you know where you are going, you just do not want to tap
 * through three levels) needs no round trip. Records come from /api/search,
 * which matches the stored JSON document and therefore reaches every table
 * without knowing what any of them hold.
 *
 * Three characters minimum, and a short debounce, so typing does not fire a
 * query per keystroke.
 */

const PAGES = [
  ...COMPANY.map(i => ({ ...i, group: 'Company-wide' })),
  ...REGIONS.flatMap(r => [
    { href: r.href, icon: r.icon, name: r.name, group: 'Regions' },
    ...(r.subs || []).map(s => ({ ...s, group: r.name })),
  ]),
  ...TOOLS.map(i => ({ ...i, group: 'Tools' })),
];

const MIN = 3;

export default function OsSearch() {
  const [q, setQ] = useState('');
  const [records, setRecords] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  const router = useRouter();

  const pages = useMemo(() => {
    if (q.trim().length < MIN) return [];
    const t = q.trim().toLowerCase();
    return PAGES.filter(p =>
      p.name.toLowerCase().includes(t) || p.group.toLowerCase().includes(t)
    ).slice(0, 8);
  }, [q]);

  useEffect(() => {
    clearTimeout(timer.current);
    const t = q.trim();
    if (t.length < MIN) { setRecords(null); setBusy(false); return undefined; }
    setBusy(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(t)}`);
        const d = await res.json();
        // Ignore a response that arrived after the box moved on.
        setRecords(d.ok ? d : { results: [], error: d.detail || d.error });
      } catch (err) {
        setRecords({ results: [], error: err.message });
      } finally {
        setBusy(false);
      }
    }, 280);
    return () => clearTimeout(timer.current);
  }, [q]);

  const short = q.trim().length > 0 && q.trim().length < MIN;

  return (
    <div className="osr">
      <div className="osr-box">
        <span className="osr-icon" aria-hidden>⌕</span>
        <input
          className="osr-input"
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search pages, tasks, orders, anything"
          aria-label="Search the OS"
          autoComplete="off"
        />
        {q && (
          <button className="osr-clear" onClick={() => setQ('')} type="button" aria-label="Clear search">✕</button>
        )}
      </div>

      {short && <p className="osr-hint">Keep going, {MIN} letters to search.</p>}

      {q.trim().length >= MIN && (
        <div className="osr-results">
          {pages.length > 0 && (
            <>
              <p className="osr-group">Pages</p>
              {pages.map(p => (
                <Link key={p.href} href={p.href} className="osr-row" onClick={() => setQ('')}>
                  <span className="osr-row-icon">{p.icon}</span>
                  <span className="osr-row-main">
                    <span className="osr-row-title">{p.name}</span>
                    <span className="osr-row-sub">{p.group}</span>
                  </span>
                  <span className="osr-row-go">→</span>
                </Link>
              ))}
            </>
          )}

          <p className="osr-group">
            Records{busy ? ' · searching' : records ? ` · ${records.results.length}${records.capped ? '+' : ''}` : ''}
          </p>

          {busy && !records && <p className="osr-hint">Looking through every table.</p>}

          {records?.error && <p className="osr-hint osr-hint--bad">Search failed: {records.error}</p>}

          {records && !records.error && records.results.length === 0 && !busy && (
            <p className="osr-hint">Nothing in the database matches that.</p>
          )}

          {records?.results.map((r, i) => {
            const body = (
              <>
                <span className="osr-row-main">
                  <span className="osr-row-title">{r.title}</span>
                  <span className="osr-row-sub">{r.where}</span>
                  {r.snippet && (
                    <span className="osr-row-snip">
                      <b>{r.snippet.field}:</b> {r.snippet.text}
                    </span>
                  )}
                </span>
                {r.href && <span className="osr-row-go">→</span>}
              </>
            );
            return r.href
              ? <Link key={i} href={r.href} className="osr-row" onClick={() => setQ('')}>{body}</Link>
              : <div key={i} className="osr-row osr-row--flat">{body}</div>;
          })}

          {records?.capped && (
            <p className="osr-hint">
              Showing the {records.results.length} most recently updated matches. Narrow the term to see others.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
