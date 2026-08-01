/**
 * Klaviyo client — campaigns, flows and list growth into the OS.
 *
 * Klaviyo is the owned channel, and the Shopify traffic data says it is
 * switched off: 3 email sessions in June, 0 in July, against a list that
 * snapshotted at 362 profiles in June. That gap is the single largest untapped
 * asset on the UK store, so measuring it properly is the point of this file.
 *
 * Auth is a private API key (pk_…) in KLAVIYO_API_KEY, added by Romano to
 * Vercel — never pasted into a chat. Reads only: nothing here sends email or
 * mutates a list.
 *
 * The API is versioned by date header rather than by path, so REVISION is
 * pinned deliberately; bumping it is a decision, not an accident.
 */
const { realEnv } = require('./airtable-tables');

const BASE = 'https://a.klaviyo.com/api';
const REVISION = '2025-04-15';

function key() {
  const k = realEnv('KLAVIYO_API_KEY');
  if (!k) throw new Error('KLAVIYO_API_KEY not set');
  return k;
}

async function kget(path, params = {}) {
  const url = new URL(`${BASE}/${path.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: {
      Authorization: `Klaviyo-API-Key ${key()}`,
      revision: REVISION,
      accept: 'application/json',
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Klaviyo rejected the key. Check it is a PRIVATE key (pk_…) with read scopes.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Klaviyo ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Follow `links.next` until exhausted. Klaviyo cursors are full URLs. */
async function kpaged(path, params = {}, cap = 10) {
  const out = [];
  let page = await kget(path, params);
  out.push(...(page.data || []));
  let next = page.links?.next, hops = 0;
  while (next && hops++ < cap) {
    const res = await fetch(next, {
      headers: { Authorization: `Klaviyo-API-Key ${key()}`, revision: REVISION, accept: 'application/json' },
    });
    if (!res.ok) break;
    page = await res.json();
    out.push(...(page.data || []));
    next = page.links?.next;
  }
  return out;
}

/* ── the four things the OS actually needs ─────────────────── */

/** Lists with their current profile counts. */
async function getLists() {
  // profile_count is only available as an additional-field on newer API
  // revisions, and asking for it on an older one is a hard 400 rather than a
  // silent omission. Try it, fall back to the plain call, and report null
  // rather than 0 when the count genuinely is not available.
  let lists;
  try {
    lists = await kpaged('lists', {
      'fields[list]': 'name,created,updated',
      'additional-fields[list]': 'profile_count',
    });
  } catch (e) {
    if (!/additional-fields/i.test(e.message)) throw e;
    lists = await kpaged('lists', { 'fields[list]': 'name,created,updated' });
  }
  return lists.map(l => ({
    id: l.id,
    name: l.attributes?.name,
    created: l.attributes?.created,
    profiles: l.attributes?.profile_count ?? null,
  }));
}

/** Flows and their status — the "is the owned channel switched on" question. */
async function getFlows() {
  const flows = await kpaged('flows', { 'fields[flow]': 'name,status,archived,created,updated,trigger_type' });
  return flows.map(f => ({
    id: f.id,
    name: f.attributes?.name,
    status: f.attributes?.status,
    trigger: f.attributes?.trigger_type,
    archived: !!f.attributes?.archived,
    updated: f.attributes?.updated,
  }));
}

/** Campaigns sent, newest first. Klaviyo requires a channel filter. */
async function getCampaigns(channel = 'email') {
  const rows = await kpaged('campaigns', {
    filter: `equals(messages.channel,'${channel}')`,
    'fields[campaign]': 'name,status,created_at,send_time,scheduled_at',
    sort: '-created_at',
  }, 4);
  return rows.map(c => ({
    id: c.id,
    name: c.attributes?.name,
    status: c.attributes?.status,
    sent: c.attributes?.send_time || c.attributes?.scheduled_at || null,
    created: c.attributes?.created_at,
  }));
}

/**
 * TOTAL order value recorded by Klaviyo's Placed Order metric.
 *
 * NOT email-attributed revenue, and it must never be labelled as such. The
 * Shopify integration fires Placed Order on EVERY order, so this is the whole
 * store as Klaviyo sees it. Isolating email-driven revenue needs per-message
 * attribution, which this endpoint does not give.
 *
 * Its real value is as an integration heartbeat: if Klaviyo's order count
 * diverges from Shopify's, the integration has stopped receiving orders, and
 * every flow that triggers on a purchase is silently dead.
 *
 * Returns null (not zero) when the metric cannot be read: a channel that
 * earned nothing and one we cannot measure must never look the same.
 */
async function getOrderMetric(since, until) {
  const metrics = await kpaged('metrics', { 'fields[metric]': 'name,integration' }, 3);
  // Name varies by integration: "Placed Order" (Shopify), "Ordered Product",
  // "Checkout Completed". Try the common ones before giving up, and prefer a
  // Shopify-sourced metric when several match.
  const wanted = [/^placed order$/i, /placed order/i, /ordered product/i, /checkout completed/i];
  let placed = null;
  for (const rx of wanted) {
    const hits = metrics.filter(m => rx.test(m.attributes?.name || ''));
    if (!hits.length) continue;
    placed = hits.find(m => /shopify/i.test(m.attributes?.integration?.name || '')) || hits[0];
    break;
  }
  if (!placed) return null;

  const body = {
    data: {
      type: 'metric-aggregate',
      attributes: {
        metric_id: placed.id,
        measurements: ['sum_value', 'count'],
        interval: 'month',
        page_size: 500,   // Klaviyo rejects anything below 500 here
        filter: [`greater-or-equal(datetime,${since})`, `less-than(datetime,${until})`],
        timezone: 'Europe/London',
      },
    },
  };
  const res = await fetch(`${BASE}/metric-aggregates`, {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${key()}`,
      revision: REVISION,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Returning null quietly made a fixable 400 (page_size) look like "this
    // account has no revenue data". Say what went wrong.
    const body = await res.text().catch(() => '');
    console.warn(`[klaviyo] metric-aggregates ${res.status}: ${body.slice(0, 200)}`);
    return null;
  }
  const json = await res.json();
  const dates = json.data?.attributes?.dates || [];
  const series = json.data?.attributes?.data?.[0]?.measurements || {};
  return dates.map((d, i) => ({
    month: String(d).slice(0, 7),
    revenue: series.sum_value?.[i] ?? null,
    orders: series.count?.[i] ?? null,
  }));
}

/**
 * Per-flow and per-campaign performance: opens, clicks, conversions and the
 * revenue Klaviyo attributes to each.
 *
 * THIS is email-attributed revenue, unlike the Placed Order metric aggregate
 * (which counts every order in the store). Flow and campaign value reports
 * attribute a conversion to the message that drove it, which is the number
 * that answers "is email earning".
 *
 * `kind` is 'flow' or 'campaign'. Needs the Placed Order metric id to attribute
 * against, which we look up rather than hardcode.
 */
async function getValueReport(kind, timeframe = 'last_12_months') {
  const metrics = await kpaged('metrics', { 'fields[metric]': 'name,integration' }, 3);
  const placed = metrics.find(m => /^placed order$/i.test(m.attributes?.name || ''));
  if (!placed) return [];

  const type = `${kind}-values-report`;
  const res = await fetch(`${BASE}/${kind}-values-reports`, {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${key()}`,
      revision: REVISION, accept: 'application/json', 'content-type': 'application/json',
    },
    body: JSON.stringify({
      data: { type, attributes: {
        timeframe: { key: timeframe },
        statistics: ['opens_unique', 'clicks_unique', 'conversion_value', 'conversions',
                     'recipients', 'open_rate', 'click_rate'],
        conversion_metric_id: placed.id,
      } },
    }),
  });
  if (!res.ok) {
    console.warn(`[klaviyo] ${type} ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
    return [];
  }
  const json = await res.json();
  return (json.data?.attributes?.results || []).map(r => ({
    id: r.groupings?.[`${kind}_id`] || '',
    recipients: r.statistics?.recipients ?? null,
    opens: r.statistics?.opens_unique ?? null,
    openRate: r.statistics?.open_rate ?? null,
    clicks: r.statistics?.clicks_unique ?? null,
    clickRate: r.statistics?.click_rate ?? null,
    conversions: r.statistics?.conversions ?? null,
    revenue: r.statistics?.conversion_value ?? null,
  }));
}

const isConfigured = () => !!realEnv('KLAVIYO_API_KEY');

module.exports = { getLists, getFlows, getCampaigns, getOrderMetric, getValueReport, isConfigured, REVISION };
