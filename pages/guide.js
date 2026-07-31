import OsLayout from '../components/OsLayout';
import { getMirrorStatus } from '../lib/mirror-status';

/* ── status band copy, keyed on how the mirror is actually doing ── */
const STATUS_COPY = {
  ok: {
    tone: 'ok',
    title: 'Reading from the Natroceutics database',
    body: 'Dashboard pages are served from our own database. Opening a page no longer uses any Airtable API quota.',
  },
  empty: {
    tone: 'amber',
    title: 'Database connected, no data mirrored yet',
    body: 'The database is set up but nothing has been synced into it, so every page is still reading live from Airtable. Run the first sync to switch over.',
  },
  'not-configured': {
    tone: 'amber',
    title: 'Reading live from Airtable',
    body: 'No database is connected yet, so every page load calls the Airtable API directly — the behaviour that hit the monthly quota. Nothing is broken; this is the old path.',
  },
  disabled: {
    tone: 'amber',
    title: 'Database bypassed on purpose',
    body: 'DATA_SOURCE is set to "airtable", so the mirror is switched off and pages read live from Airtable. This is the rollback switch — unset it to go back to the database.',
  },
  unreachable: {
    tone: 'red',
    title: 'Database unreachable — falling back to Airtable',
    body: 'The database could not be reached, so pages are serving live from Airtable instead. The site keeps working, but it is spending Airtable quota again. Worth looking at.',
  },
};

function fmt(iso) {
  if (!iso) return 'never';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function relative(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins)) return null;
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

export default function Guide({ status, serverTime }) {
  const copy = STATUS_COPY[status.reason] || STATUS_COPY['not-configured'];

  return (
    <OsLayout title="How the OS Works" serverTime={serverTime}>
      <section className="os-hero">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Guide</p>
          <h1 className="os-hero-title">How the OS Works</h1>
          <p className="os-hero-sub">Where the numbers on these dashboards come from, and how current they are.</p>
        </div>
      </section>

      <div className="os-page-wrap">

        {/* ── live status ── */}
        <div className={`guide-status guide-status--${copy.tone}`}>
          <div className="guide-status-head">
            <span className="guide-status-dot" />
            <span className="guide-status-title">{copy.title}</span>
          </div>
          <p className="guide-status-body">{copy.body}</p>
          {status.active && (
            <p className="guide-status-meta">
              {status.totals.syncedTables} of {status.totals.totalTables} tables mirrored
              {' · '}
              {status.totals.rows.toLocaleString('en-GB')} records held locally
            </p>
          )}
        </div>

        {/* ── the flow ── */}
        <h2 className="guide-h2">The short version</h2>
        <div className="guide-flow">
          <div className="guide-flow-step">
            <span className="guide-flow-num">1</span>
            <h3>You edit in Airtable</h3>
            <p>Airtable is still the single source of truth. Nothing about how you and the team add or change records has changed.</p>
          </div>
          <div className="guide-flow-arrow">→</div>
          <div className="guide-flow-step">
            <span className="guide-flow-num">2</span>
            <h3>A job copies it across</h3>
            <p>Once a day a scheduled job reads every table out of Airtable and writes a copy into our own database.</p>
          </div>
          <div className="guide-flow-arrow">→</div>
          <div className="guide-flow-step">
            <span className="guide-flow-num">3</span>
            <h3>The OS reads the copy</h3>
            <p>These dashboards read that copy instead of calling Airtable. Opening a page as often as you like costs nothing.</p>
          </div>
        </div>

        <div className="guide-callout">
          <strong>Why this changed.</strong> Every dashboard page used to call Airtable live, every single time
          anyone opened it. Usage grew with how often the team used the site, and on 27 July 2026 it hit
          Airtable&rsquo;s monthly account cap — taking down the OS and the daily data scheduler at the same time.
          Reading from our own copy makes dashboard traffic free and unlimited.
        </div>

        {/* ── are we off Airtable ── */}
        <h2 className="guide-h2">Are we off Airtable?</h2>
        <div className="guide-split">
          <div className="guide-split-col">
            <p className="guide-split-label guide-split-label--ok">No longer dependent</p>
            <ul className="guide-list">
              <li><strong>Viewing dashboards.</strong> Opening UK, SA, ME, PT, Knowledge Base or any other page uses zero Airtable quota.</li>
              <li><strong>Usage that scales with the team.</strong> Ten people refreshing all day costs the same as nobody opening it.</li>
            </ul>
          </div>
          <div className="guide-split-col">
            <p className="guide-split-label guide-split-label--amber">Still dependent</p>
            <ul className="guide-list">
              <li><strong>Airtable is still the source of truth.</strong> All data originates and is edited there.</li>
              <li><strong>Edits still write to Airtable.</strong> Changing a record or posting a comment in the OS goes straight to Airtable.</li>
              <li><strong>The daily sync reads Airtable.</strong> A fixed, predictable number of calls per day — not per page view.</li>
            </ul>
          </div>
        </div>
        <p className="guide-note">
          So: the runaway usage is gone and the quota is no longer something the team can exhaust by using the site.
          But Airtable is still where the data lives. Cutting the dependency entirely means moving editing off Airtable
          too, which needs a replacement for its grid interface — a separate, much larger piece of work, and not worth
          starting unless the daily sync alone turns out to be too much.
        </p>

        {/* ── freshness ── */}
        <h2 className="guide-h2">How current is what I&rsquo;m looking at?</h2>
        <div className="guide-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Module</th>
                <th>Tables mirrored</th>
                <th>Records</th>
                <th>Last refreshed</th>
              </tr>
            </thead>
            <tbody>
              {status.bases.map(b => (
                <tr key={b.key}>
                  <td><strong>{b.label}</strong></td>
                  <td>
                    {b.syncedTables} / {b.totalTables}
                    {b.failedTables > 0 && (
                      <span className="guide-pill guide-pill--red">{b.failedTables} failing</span>
                    )}
                  </td>
                  <td>{b.rows ? b.rows.toLocaleString('en-GB') : '—'}</td>
                  <td>
                    {b.lastSync ? (
                      <>
                        {fmt(b.lastSync)}
                        <span className="guide-rel">{relative(b.lastSync)}</span>
                      </>
                    ) : (
                      <span className="guide-muted">not synced — reading live from Airtable</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {status.bases.some(b => b.failedTables > 0) && (
          <div className="guide-callout guide-callout--red">
            <strong>Some tables failed to sync.</strong> Those tables fall back to reading live from Airtable, so the
            pages still work — they are just using quota again.
            <ul className="guide-list">
              {status.bases.flatMap(b =>
                (b.failures || []).map(f => (
                  <li key={`${b.key}.${f.table}`}><code>{b.key}.{f.table}</code> — {f.error}</li>
                ))
              )}
            </ul>
          </div>
        )}

        {/* ── getting data in ── */}
        <h2 className="guide-h2">Getting data in — no tools needed</h2>
        <div className="guide-qa">
          <div className="guide-qa-item">
            <h3>Amazon UK — sellerboard files</h3>
            <p>
              In sellerboard, export <strong>Dashboard by day</strong>, <strong>Dashboard by
              product</strong>, <strong>Orders</strong> and <strong>Stock history</strong>, then drop
              the files on the <a href="/capture">Capture</a> page exactly as downloaded. The OS
              reads the columns, not the filename. Amazon P&amp;L, product performance, orders and
              stock update immediately.
            </p>
          </div>
          <div className="guide-qa-item">
            <h3>Shopify UK — one button</h3>
            <p>
              UK module → Shopify UK → Orders → <strong>⟳ Sync Shopify</strong>. Pulls the latest
              orders straight from the store into the database and refreshes the page. New orders are
              added, existing ones updated; nothing is deleted.
            </p>
          </div>
          <div className="guide-qa-item">
            <h3>RSP / competitor pricing</h3>
            <p>
              Copy the pricing tab from the Amazon team&rsquo;s Excel, save it as
              <em> tab-separated</em> (.tsv), and drop it on <a href="/capture">Capture</a>. It
              needs the ASIN, Seller/Price columns and RRP; the OS works out which listing is ours.
            </p>
          </div>
          <div className="guide-qa-item">
            <h3>Where do the files live afterwards?</h3>
            <p>
              <strong>The database is the official store</strong> — once a file is uploaded, its data
              is in the OS and the file itself is no longer needed. Keep the original exports wherever
              suits (a &ldquo;Natro-OS / raw exports&rdquo; folder in your cloud drive is plenty) as a
              paper trail, but nothing reads from that folder — the dashboards only read the database.
            </p>
          </div>
        </div>

        {/* ── practical ── */}
        <h2 className="guide-h2">Things worth knowing</h2>
        <div className="guide-qa">
          <div className="guide-qa-item">
            <h3>I changed something in Airtable and don&rsquo;t see it here</h3>
            <p>
              That&rsquo;s expected. The OS shows the data as of the last sync, not as of this second. Your change will
              appear after the next daily run. The <strong>Airtable</strong> button in the header takes you to the live
              record if you need to confirm something immediately.
            </p>
          </div>
          <div className="guide-qa-item">
            <h3>I edited a record from inside the OS</h3>
            <p>
              Edits and comments made in the OS are written straight to Airtable, so Airtable is correct immediately.
              The dashboard will catch up on the next sync.
            </p>
          </div>
          <div className="guide-qa-item">
            <h3>A page shows a module as &ldquo;not synced&rdquo;</h3>
            <p>
              Nothing is broken. Any table that hasn&rsquo;t been mirrored yet automatically falls back to reading live
              from Airtable, exactly as the site always did. Modules are being moved across one at a time.
            </p>
          </div>
          <div className="guide-qa-item">
            <h3>The numbers look wrong</h3>
            <p>
              Check the <em>Last refreshed</em> column above first — a stale sync is the usual explanation. If the
              timestamp is recent and the number still looks wrong, compare against Airtable directly and flag it.
            </p>
          </div>
        </div>

        <h2 className="guide-h2">For whoever maintains this</h2>
        <ul className="guide-list guide-list--tech">
          <li>Full runbook, schema notes and rollback steps: <code>docs/POSTGRES-MIRROR.md</code> in the repo.</li>
          <li>Run a sync by hand: <code>npm run sync -- --bases=UK</code>. Check what&rsquo;s mirrored: <code>npm run sync:stats</code>.</li>
          <li>Emergency rollback: set <code>DATA_SOURCE=airtable</code> in Vercel and redeploy. Every read goes back to live Airtable, no code change.</li>
          <li>Reads go through <code>lib/airtable.js</code>, which tries <code>lib/mirror.js</code> first and falls through to Airtable whenever the mirror has nothing for that table.</li>
        </ul>

      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  const status = await getMirrorStatus();
  return { props: { status, serverTime: new Date().toISOString() } };
}
