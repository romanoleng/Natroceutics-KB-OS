/**
 * GoAffPro client — the affiliate programme, authoritative.
 *
 * Until now affiliate data reached the OS through a hand-maintained Airtable
 * base whose last recorded sale was June 2026, which is why the commission line
 * in UK.COST_MODEL read STALE rather than £0. This makes it a measured figure.
 *
 * Why that matters beyond reporting: commission runs at a blended ~24%, the
 * most expensive acquisition channel the business has, and it scales with
 * revenue. Every month it is missing, contribution is overstated.
 *
 * Auth is the access token in GOAFFPRO_ACCESS_TOKEN, sent as
 * X-GOAFFPRO-ACCESS-TOKEN (NOT a Bearer header — that returns 403). Reads only.
 */
const { realEnv } = require('./airtable-tables');

const BASE = 'https://api.goaffpro.com/v1/admin';

function headers() {
  const token = realEnv('GOAFFPRO_ACCESS_TOKEN');
  if (!token) throw new Error('GOAFFPRO_ACCESS_TOKEN not set');
  return { 'X-GOAFFPRO-ACCESS-TOKEN': token, accept: 'application/json' };
}

async function get(path, params = {}) {
  const url = new URL(`${BASE}/${path.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: headers() });
  if (res.status === 401 || res.status === 403) {
    throw new Error('GoAffPro rejected the token. Regenerate it under Settings > Advanced > API Keys.');
  }
  if (!res.ok) throw new Error(`GoAffPro ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return res.json();
}

/**
 * Page through a collection. GoAffPro returns {<key>: [...], total_results},
 * so the caller names the key it wants.
 */
async function paged(path, key, params = {}, pageSize = 100, cap = 40) {
  const out = [];
  let offset = 0, total = Infinity, pages = 0;
  while (out.length < total && pages++ < cap) {
    const json = await get(path, { ...params, limit: pageSize, offset });
    const rows = json[key] || [];
    total = Number(json.total_results ?? rows.length);
    out.push(...rows);
    if (!rows.length) break;
    offset += rows.length;
  }
  return out;
}

/** Every affiliate, with the fields the OS actually uses. */
async function getAffiliates() {
  const rows = await paged('affiliates', 'affiliates', {
    fields: 'id,name,email,status,coupon_code,ref_code,balance,total_sales,total_commission,total_orders,created_at,tags',
  });
  return rows.map(a => ({
    id: a.id,
    name: a.name || [a.first_name, a.last_name].filter(Boolean).join(' ') || '(unnamed)',
    email: a.email || '',
    status: a.status || '',
    coupon: a.coupon_code || a.ref_code || '',
    balance: a.balance ?? null,
    sales: a.total_sales ?? null,
    commission: a.total_commission ?? null,
    orders: a.total_orders ?? null,
    created: a.created_at ? String(a.created_at).slice(0, 10) : '',
    tags: Array.isArray(a.tags) ? a.tags.join(', ') : (a.tags || ''),
  }));
}

/**
 * Referred orders. This is the commission ledger: each row is revenue the
 * programme claims credit for and a commission we owe against it.
 */
async function getOrders() {
  const rows = await paged('orders', 'orders', {
    fields: 'id,order_id,number,affiliate_id,commission,total,subtotal,currency,status,commission_status,created_at,coupon_code,customer_email',
  });
  return rows.map(o => ({
    id: o.id ?? o.order_id,
    number: o.number || o.order_id || '',
    affiliateId: o.affiliate_id ?? null,
    commission: o.commission ?? null,
    revenue: o.total ?? o.subtotal ?? null,
    currency: o.currency || 'GBP',
    // GoAffPro tracks the order state and the commission state separately: an
    // order can be paid while its commission is still pending approval.
    status: o.status || '',
    commissionStatus: o.commission_status || '',
    coupon: o.coupon_code || '',
    date: o.created_at ? String(o.created_at).slice(0, 10) : '',
  }));
}

/** Payouts, so "what do we still owe" is answerable. */
async function getPayouts() {
  try {
    const rows = await paged('payouts', 'payouts', {}, 100, 10);
    return rows.map(p => ({
      id: p.id,
      affiliateId: p.affiliate_id ?? null,
      amount: p.amount ?? null,
      status: p.status || '',
      method: p.payment_method || p.method || '',
      date: p.created_at ? String(p.created_at).slice(0, 10) : '',
    }));
  } catch {
    return [];   // payouts is optional on some plans; never fail the whole pull
  }
}

const isConfigured = () => !!realEnv('GOAFFPRO_ACCESS_TOKEN');

module.exports = { getAffiliates, getOrders, getPayouts, isConfigured };
