import { useMemo, useState } from 'react';
import OsLayout from '../components/OsLayout';
import { fetchFromMirror } from '../lib/mirror';
import { BASES, resolveBaseId } from '../lib/airtable-tables';

/**
 * /time — where the passive tracker's data actually surfaces.
 *
 * Tracking you cannot see is surveillance with no payoff, which is fair
 * criticism: it had been recording for hours with no way to look at it.
 *
 * Two honesty rules the page states rather than implies:
 *   1. It only counts time the OS was OPEN AND VISIBLE. A window left open
 *      overnight does not bill eight hours.
 *   2. It cannot see work done outside the OS: meetings, Outlook, the
 *      warehouse, anything on a phone that is not this. So the total is "time
 *      in the OS", never "hours worked", and the page says so.
 */

const fmt = mins => {
  const m = Math.round(Number(mins) || 0);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
const dayLabel = d => {
  if (!d) return '—';
  const t = new Date(`${d}T12:00:00`);
  return t.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};
/** "/uk" -> "UK", "/all-tasks" -> "Today". Paths are not a reading experience. */
const PAGE_NAMES = {
  '/': 'Home', '/all-tasks': 'Today', '/uk': 'United Kingdom', '/me': 'Middle East',
  '/sa': 'South Africa', '/pt': 'Portugal', '/kb': 'Knowledge Base', '/capture': 'Capture',
  '/products': 'Products', '/settings': 'Settings', '/menu': 'Menu', '/time': 'Time',
  '/global': 'Global', '/partner-brands': 'Partner Brands', '/report/shopify-uk': 'Shopify report',
};
const pageName = p => PAGE_NAMES[p] || p;

export default function TimePage({ sessions, serverTime }) {
  const [range, setRange] = useState('7');

  const view = useMemo(() => {
    const cutoff = range === 'all'
      ? '0000-00-00'
      : new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10);
    const rows = sessions.filter(s => s.Day >= cutoff);

    const byDay = new Map();
    const byPage = new Map();
    for (const s of rows) {
      const d = byDay.get(s.Day) || { day: s.Day, minutes: 0, sessions: 0, first: '', last: '' };
      d.minutes += Number(s.Minutes) || 0;
      d.sessions++;
      if (!d.first || s['Started At'] < d.first) d.first = s['Started At'];
      if (!d.last || s['Ended At'] > d.last) d.last = s['Ended At'];
      byDay.set(s.Day, d);

      // A session's minutes are split evenly across the pages it touched. It is
      // an approximation and labelled as one: heartbeats record presence, not
      // which tab had focus at each moment.
      const pages = String(s.Pages || '').split(' · ').filter(Boolean);
      if (!pages.length) continue;
      const share = (Number(s.Minutes) || 0) / pages.length;
      for (const p of pages) byPage.set(p, (byPage.get(p) || 0) + share);
    }

    const days = [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
    const total = days.reduce((s, d) => s + d.minutes, 0);
    return {
      days, total,
      sessions: rows.length,
      avg: days.length ? total / days.length : 0,
      pages: [...byPage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      max: Math.max(...days.map(d => d.minutes), 1),
    };
  }, [sessions, range]);

  return (
    <OsLayout title="Time" serverTime={serverTime}>
      <section className="os-hero">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Natroceutics OS</p>
          <h1 className="os-hero-title">Time</h1>
          <p className="today-sub">
            {fmt(view.total)} in the OS over {view.days.length} day{view.days.length === 1 ? '' : 's'} ·
            {' '}{view.sessions} sessions
          </p>
        </div>
      </section>

      <div className="os-page-wrap">
        <div className="sp-caveat">
          This counts time the OS was <strong>open and visible</strong>, nothing else. A window left
          open in the background stops counting, and work done outside the OS is invisible to it:
          meetings, Outlook, the warehouse. Read it as time in the OS, never as hours worked.
        </div>

        <div className="td-bar">
          <div className="td-view">
            {[['7', '7 days'], ['30', '30 days'], ['all', 'All']].map(([v, l]) => (
              <button key={v} className={range === v ? 'on' : ''} onClick={() => setRange(v)} type="button">{l}</button>
            ))}
          </div>
        </div>

        {view.days.length === 0 ? (
          <div className="os-empty">
            Nothing recorded in this range. Tracking runs automatically while the OS is open, and can
            be switched off in Settings.
          </div>
        ) : (
          <>
            <div className="os-stat-row">
              <div className="os-stat-card os-stat-green">
                <div className="os-stat-num">{fmt(view.total)}</div>
                <div className="os-stat-label">Total in the OS</div>
              </div>
              <div className="os-stat-card">
                <div className="os-stat-num">{fmt(view.avg)}</div>
                <div className="os-stat-label">Average per active day</div>
              </div>
              <div className="os-stat-card">
                <div className="os-stat-num">{view.sessions}</div>
                <div className="os-stat-label">Sessions</div>
              </div>
              <div className="os-stat-card">
                <div className="os-stat-num">{view.days.length}</div>
                <div className="os-stat-label">Active days</div>
              </div>
            </div>

            <div className="sp-card" style={{ marginTop: 18 }}>
              <div className="sp-card-label">By day</div>
              <div className="tm-days">
                {view.days.map(d => (
                  <div key={d.day} className="tm-day">
                    <span className="tm-day-l">{dayLabel(d.day)}</span>
                    <div className="tm-bar">
                      <div className="tm-bar-fill" style={{ width: `${(d.minutes / view.max) * 100}%` }} />
                    </div>
                    <span className="tm-day-v">{fmt(d.minutes)}</span>
                    <span className="tm-day-s">
                      {d.first?.slice(11, 16)}–{d.last?.slice(11, 16)} · {d.sessions} session{d.sessions === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="sp-card" style={{ marginTop: 14 }}>
              <div className="sp-card-label">Where the time went</div>
              <table className="sp-mini">
                <tbody>
                  {view.pages.map(([p, mins]) => (
                    <tr key={p}>
                      <td>{pageName(p)}<span className="sp-src">{p}</span></td>
                      <td className="sp-num">{fmt(mins)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="sp-note">
                A session&apos;s minutes are split evenly across the pages it touched. Heartbeats record
                that the OS was open, not which view had your attention, so treat this as a rough
                shape rather than a measurement.
              </p>
            </div>
          </>
        )}
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  try {
    const baseId = resolveBaseId(BASES.UK.envVar);
    const rows = (await fetchFromMirror(baseId, BASES.UK.tables.TIME_SESSIONS)) || [];
    const sessions = rows.map(r => r.fields || r).filter(s => s.Day);
    return { props: { sessions, serverTime: new Date().toISOString() } };
  } catch (e) {
    console.warn('[time]', e.message);
    return { props: { sessions: [], serverTime: new Date().toISOString() } };
  }
}
