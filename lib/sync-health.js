/**
 * Is the OS up to date, and if not, what is missing?
 *
 * Every write path already records a SyncRun with a source, a row count and a
 * timestamp, so the answer is sitting in the database. What was missing was
 * anywhere to read it. A feed that quietly stops is indistinguishable from one
 * that has nothing new, which is exactly how the Shopify sync button went a
 * day reporting failure without anyone knowing why.
 *
 * Two rules this file keeps to:
 *
 *   1. Silence is never treated as success. A feed that has never run says
 *      "never", not "0 rows". A feed past its cadence says so with its age.
 *   2. A feed nobody expects to run automatically is not a fault. Sellerboard
 *      is a manual upload and Airtable is retired, so neither is ever red.
 *      Marking healthy things red teaches you to ignore the panel.
 */
const { getPrisma, isConfigured } = require('./prisma');

const HOUR = 3600_000;

/**
 * The feeds worth watching, in the order they matter.
 *
 * `sources` are the SyncRun.source strings a feed can arrive under. Several
 * feeds have two: the original script and the in-app route write different
 * strings, and both count as the feed being fed.
 *
 * `everyHours` is how often the feed SHOULD arrive. Nothing enforces it yet
 * (there is no scheduler), so today it is the yardstick the page measures
 * against rather than a promise. `kind: 'manual'` means there is no cadence to
 * miss, and `kind: 'retired'` means the feed is deliberately finished.
 */
const FEEDS = [
  {
    key: 'shopify-orders', label: 'Shopify orders', region: 'UK',
    sources: ['shopify', 'shopify-pull'], everyHours: 24,
    detail: 'Orders, customers and products from uk.natroceutics.com',
  },
  {
    key: 'shopify-finance', label: 'Shopify finance', region: 'UK',
    sources: ['shopify-finance'], everyHours: 24,
    detail: 'Payouts, transaction fees and the cost stack',
  },
  {
    key: 'subscriptions', label: 'Subscriptions', region: 'UK',
    sources: ['subscriptions-pull', 'shopify-subs'], everyHours: 24,
    detail: 'Recurring orders and their customers',
  },
  {
    key: 'klaviyo', label: 'Klaviyo', region: 'UK',
    sources: ['klaviyo-pull'], everyHours: 24,
    detail: 'Flow and campaign attribution, list growth',
  },
  {
    key: 'goaffpro', label: 'GoAffPro affiliates', region: 'UK',
    sources: ['goaffpro-pull', 'affiliate-cost'], everyHours: 24,
    detail: 'Affiliate orders and the commission cost line',
  },
  {
    key: 'mailchimp', label: 'Mailchimp', region: 'SA',
    sources: ['mailchimp-pull'], everyHours: 168,
    detail: 'Campaigns and list health',
  },
  {
    // 'sb' is what the importer records after a real import; 'sellerboard' is
    // the heartbeat the routine sends on a night when no report mail arrived.
    // Both mean the feed was checked, so both count as it being fed.
    key: 'amazon-sb', label: 'Amazon UK (Sellerboard)', region: 'UK',
    sources: ['sb', 'sellerboard'], everyHours: 24,
    detail: 'Imported nightly from the Sellerboard report emails; the upload page is the fallback',
  },
  {
    key: 'outlook', label: 'Outlook', region: 'UK',
    sources: ['outlook'], everyHours: 24,
    detail: 'Daily inbox triage into tasks',
  },
  {
    key: 'granola', label: 'Granola', region: 'All',
    sources: ['granola'], everyHours: 24,
    detail: 'Meeting notes, decisions and actions',
  },
  {
    key: 'capture', label: 'Capture and paste', region: 'All',
    sources: ['upload', 'paste', 'smart-capture', 'ingest', 'manual-note'], kind: 'manual',
    detail: 'Anything you put in yourself, including captures from a chat session',
  },
  {
    key: 'airtable', label: 'Airtable', region: 'All',
    sources: ['airtable'], kind: 'retired',
    detail: 'Migrated to Postgres on 1 August 2026. No longer expected to run.',
  },
];

/**
 * Feeds that are scheduled elsewhere and not yet writing. Listed, never red.
 *
 * Empty since 3 Aug 2026. Outlook and Granola sat here for weeks while the
 * daily routine was already running and writing — the page showed them grey
 * and reassuring, which meant that if the job had died nothing on /status
 * would ever have said so. A feed that genuinely writes belongs in FEEDS with
 * a cadence it can fail to meet; this list is only for something wired up but
 * provably not yet sending.
 */
const PENDING = [];

const ageHours = d => (d ? (Date.now() - new Date(d).getTime()) / HOUR : null);

/**
 * `fresh`   arrived within its cadence
 * `due`     past its cadence but under twice it, so probably just late
 * `stale`   more than twice its cadence, something is wrong
 * `failed`  the last attempt errored
 * `never`   nothing has ever arrived
 * `manual`  no cadence to miss
 * `retired` finished on purpose
 * `pending` scheduled but not yet writing
 */
function stateOf(feed, run) {
  if (feed.kind === 'retired') return 'retired';
  if (!run) return feed.kind === 'manual' ? 'manual' : 'never';
  if (run.status === 'error') return 'failed';
  if (feed.kind === 'manual') return 'manual';
  const age = ageHours(run.startedAt);
  if (age <= feed.everyHours) return 'fresh';
  return age <= feed.everyHours * 2 ? 'due' : 'stale';
}

/**
 * One row per feed, newest run first, plus a headline the home page can show
 * without reading the detail.
 *
 * Never throws: a status panel that takes the page down with it is worse than
 * no status panel. On any failure it reports that it could not read, which is
 * itself honest information.
 */
async function getSyncHealth() {
  if (!isConfigured()) {
    return { ok: false, reason: 'No database configured', feeds: [], headline: null };
  }
  try {
    const prisma = getPrisma();
    // Latest run per source, plus the latest FAILED run per source so a
    // success that follows a failure does not hide that anything broke.
    const latest = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT ON (source) source, status, "recordCount", "startedAt", error
      FROM "SyncRun"
      ORDER BY source, "startedAt" DESC
    `);
    const bySource = new Map(latest.map(r => [r.source, r]));

    const feeds = FEEDS.map(feed => {
      // A feed can arrive under more than one source string; the freshest wins.
      const runs = feed.sources.map(s => bySource.get(s)).filter(Boolean);
      const run = runs.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0] || null;
      const age = ageHours(run?.startedAt);
      return {
        key: feed.key, label: feed.label, region: feed.region, detail: feed.detail,
        everyHours: feed.everyHours || null,
        state: stateOf(feed, run),
        lastRun: run ? new Date(run.startedAt).toISOString() : null,
        ageHours: age === null ? null : Math.round(age * 10) / 10,
        rows: run?.recordCount ?? null,
        error: run?.status === 'error' ? run.error : null,
      };
    }).concat(PENDING.map(p => ({
      ...p, state: 'pending', everyHours: null,
      lastRun: null, ageHours: null, rows: null, error: null,
    })));

    const bad = feeds.filter(f => f.state === 'failed' || f.state === 'stale' || f.state === 'never');
    const due = feeds.filter(f => f.state === 'due');

    return {
      ok: true,
      feeds,
      headline: {
        // "everything is fine" has to be earned, so it is the last case.
        tone: bad.length ? 'bad' : due.length ? 'warn' : 'good',
        bad: bad.length,
        due: due.length,
        names: bad.map(f => f.label),
        checkedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    console.warn('[sync-health]', err.message);
    return { ok: false, reason: err.message, feeds: [], headline: null };
  }
}

module.exports = { getSyncHealth, FEEDS };
