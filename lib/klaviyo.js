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
const REVISION = '2024-10-15';

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
  const lists = await kpaged('lists', { 'fields[list]': 'name,created,updated' });
  const out = [];
  for (const l of lists) {
    let count = null;
    try {
      const c = await kget(`lists/${l.id}/profiles`, { 'page[size]': 1, 'fields[profile]': 'email' });
      count = c.data?.length != null ? (c.meta?.total ?? null) : null;
    } catch { /* count is optional; never fail the whole pull for it */ }
    out.push({ id: l.id, name: l.attributes?.name, created: l.attributes?.created, profiles: count });
  }
  return out;
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
 * Revenue attributed to Klaviyo, via the "Placed Order" metric aggregate.
 * Returns null (not zero) when the metric cannot be found: a channel that
 * earned nothing and a channel we cannot measure must never look the same.
 */
async function getAttributedRevenue(since, until) {
  const metrics = await kpaged('metrics', { 'fields[metric]': 'name,integration' }, 3);
  const placed = metrics.find(m => /placed order/i.test(m.attributes?.name || ''));
  if (!placed) return null;

  const body = {
    data: {
      type: 'metric-aggregate',
      attributes: {
        metric_id: placed.id,
        measurements: ['sum_value', 'count'],
        interval: 'month',
        page_size: 100,
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
  if (!res.ok) return null;
  const json = await res.json();
  const dates = json.data?.attributes?.dates || [];
  const series = json.data?.attributes?.data?.[0]?.measurements || {};
  return dates.map((d, i) => ({
    month: String(d).slice(0, 7),
    revenue: series.sum_value?.[i] ?? null,
    orders: series.count?.[i] ?? null,
  }));
}

const isConfigured = () => !!realEnv('KLAVIYO_API_KEY');

module.exports = { getLists, getFlows, getCampaigns, getAttributedRevenue, isConfigured, REVISION };
