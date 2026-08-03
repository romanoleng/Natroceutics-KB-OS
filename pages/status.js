import OsLayout from '../components/OsLayout';
import FindingsPanel from '../components/FindingsPanel';
import { getSyncHealth } from '../lib/sync-health';
import { getFindings } from '../lib/findings';

/**
 * /status — every feed into the OS, when it last arrived, and what is missing.
 *
 * The point of this page is that "up to date" should be something you can
 * check in two seconds on logging in, rather than something you assume until a
 * number looks wrong. It states what has not happened as plainly as what has.
 */

const STATE = {
  fresh:   { label: 'Current',        tone: 'good' },
  due:     { label: 'Overdue',        tone: 'warn' },
  stale:   { label: 'Stale',          tone: 'bad'  },
  failed:  { label: 'Failed',         tone: 'bad'  },
  never:   { label: 'Never run',      tone: 'bad'  },
  manual:  { label: 'Manual',         tone: 'idle' },
  retired: { label: 'Retired',        tone: 'idle' },
  pending: { label: 'Not yet wired',  tone: 'idle' },
};

/** "3.4" hours is not how anyone thinks about time. */
function ago(hours) {
  if (hours === null || hours === undefined) return 'never';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'} ago`;
  const d = Math.round(hours / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

const cadence = h =>
  !h ? 'On demand' : h >= 168 ? 'Weekly' : h >= 24 ? 'Daily' : `Every ${h}h`;

export default function StatusPage({ health, findings, serverTime }) {
  const { feeds = [], headline } = health || {};
  const groups = [
    ['Needs attention', feeds.filter(f => ['failed', 'stale', 'never'].includes(f.state))],
    ['Overdue',         feeds.filter(f => f.state === 'due')],
    ['Current',         feeds.filter(f => f.state === 'fresh')],
    ['No schedule',     feeds.filter(f => ['manual', 'retired', 'pending'].includes(f.state))],
  ].filter(([, rows]) => rows.length);

  return (
    <OsLayout title="Data status" serverTime={serverTime}>
      <section className="os-hero">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Natroceutics OS</p>
          <h1 className="os-hero-title">Data status</h1>
          <p className="today-sub">
            {!health?.ok
              ? 'Could not read the sync log.'
              : headline?.tone === 'good'
                ? 'Every scheduled feed is within its window.'
                : `${headline.bad + headline.due} feed${headline.bad + headline.due === 1 ? '' : 's'} not current.`}
          </p>
        </div>
      </section>

      <div className="os-page-wrap">
        {!health?.ok && (
          <div className="os-empty">
            The sync log could not be read: {health?.reason || 'unknown error'}. That is a fault in
            itself, so treat every figure in the OS as unverified until it clears.
          </div>
        )}

        <div className="sp-caveat">
          This reports when data last <strong>arrived</strong>, not whether it is correct. A feed can
          be current and still be wrong if the source is wrong. Outlook, Granola and Sellerboard
          arrive on a daily schedule and record a heartbeat even on a day with nothing to report, so
          a gap in those is a real gap. The rest are run by hand and their ages reflect that.
          Findings are the exception: they are the OS checking correctness against itself, two
          records at a time.
        </div>

        {findings?.ok ? (
          <FindingsPanel
            findings={findings.open}
            otherCount={findings.other}
            baseId={findings.baseId}
            tableId={findings.tableId}
          />
        ) : (
          <div className="os-empty" style={{ marginTop: 16 }}>
            The findings table could not be read: {findings?.reason || 'unknown error'}.
          </div>
        )}

        {groups.map(([title, rows]) => (
          <div className="sp-card" style={{ marginTop: 16 }} key={title}>
            <div className="sp-card-label">{title}</div>
            <div className="st-list">
              {rows.map(f => {
                const s = STATE[f.state] || STATE.manual;
                return (
                  <div key={f.key} className={`st-row st-row--${s.tone}`}>
                    <span className="st-dot" aria-hidden />
                    <div className="st-main">
                      <div className="st-name">
                        {f.label}
                        <span className="st-region">{f.region}</span>
                      </div>
                      <div className="st-detail">{f.detail}</div>
                      {f.error && <div className="st-error">{f.error}</div>}
                    </div>
                    <div className="st-meta">
                      <span className={`st-badge st-badge--${s.tone}`}>{s.label}</span>
                      <span className="st-when">
                        {f.state === 'pending' ? 'Scheduled, not writing yet' : ago(f.ageHours)}
                      </span>
                      <span className="st-cadence">
                        {f.rows !== null ? `${f.rows} rows · ` : ''}{cadence(f.everyHours)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  const [health, findings] = await Promise.all([getSyncHealth(), getFindings()]);
  return { props: { health, findings, serverTime: new Date().toISOString() } };
}
