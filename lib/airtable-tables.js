/**
 * Shared Airtable base/table registry + record normaliser.
 *
 * Plain CommonJS on purpose: this module is consumed both by lib/airtable.js
 * (bundled by Next) and by scripts/sync-airtable.js (plain `node`, no bundler).
 *
 * Base IDs are not secrets — the PAT grants access, not the ID. They are
 * hardcoded as defaults so the sync job and the read path agree even if an
 * env var is missing (same reasoning as pages/api/update-record.js).
 */

/* ── GLOBAL KB (appbbbPs9ngSR6fIK) ───────────────────────── */
const TABLES = {
  PRODUCTS:      'tblvqKsikkBxxxzc3',
  SOPS:          'tblUIOawN9l2ws0Za',
  CONTACTS:      'tblESsxXkjHLSywdf',
  REGULATORY:    'tbllK0YmQRBAqJfwm',
  PLATFORMS:     'tbl7A2w43Sz6Q5AQv',
  KNOWLEDGE:     'tbli6Hw7UwQnl82iE',
  BRAND_ASSETS:  'tblxMOkq8tqdzMPrF',
  COMPANY_INFO:  'tblxKfYvJNu2CBDgC',
  TEMPLATES:     'tbliPfMPO95nuekOy',
  TRAINING:      'tbl1hL2A6qBjqte4w',
  DIST_MARKETS:  'tblMOakySILRggIiv',
};

/* ── SA OPERATIONS (appz7wLo78sxzLhjV) ───────────────────── */
const SA_TABLES = {
  TASKS:      'tblAv5lowKpohE27i',
  PRIORITIES: 'tblMvYUWODyMLDwRi',
  RISKS:      'tblQGQRoAZVsdheLw',
  INVENTORY:  'tblPJWX2YT9xwXEyi',
  FINANCE:    'tblcJsY2dQfbhUBFt',
  B2B:        'tblauiEdEtKeGkBdK',
  CUSTOMERS:  'tblBpULGJj0600WuO',
  MARKETING:  'tbltw6snX9fcexQZo',
  CS:         'tblJRBmiKrQ52BB2V',
  REPORTING:  'tblTWDSELaDcGiIuG',
  WEBINAR:    'tblePLDaPB5JLWtHb',
};

/* ── UK OPERATIONS (appb0pnXsdtALWq80) ───────────────────── */
const UK_TABLES = {
  TASKS:        'tbl5GXDhdcu6iwCA8',
  PRIORITIES:   'tblYTB8FShzWDqVeN',
  RISKS:        'tblFBhcUJ7ZTZoQov',
  AMAZON:       'tbl7khKIWfRcQ2dmh',
  SHOPIFY:      'tblc73cwTFR60JdUv',
  STOCK:        'tblWc0N3ayUrJP60D',
  INBOUND:      'tblu3QHWxCucuXUkw',
  REPORTING:    'tbllj9cGWg25QaKwN',
  RECONCILE:    'tblQEa0dId1GQRvg2',
  B2B:          'tblEAe9lIOyzkefpe',
  CS:           'tbl5oZcrpTXxl3Hjb',
  CUSTOMERS:    'tblbH6xNCBaAfhrS6',
  AFFILIATES:   'tbllcjILmUWq26YWt',
  MARKETING:    'tblz4XHQU8vVytmau',
  SUBSCRIPTIONS:'tblcZu8ml1bJQ0nyF',
  SUBSCRIBERS:  'tbltzWAQt26FNyypK',
  AMAZON_CAT:        'tblL0G8JL77q6noYO',
  AMAZON_DAILY_PNL:  'tbljM4lbcBIgUAjyQ',
  AMAZON_ASIN_DAILY: 'tblJNHtfGobCw3a4S',
  AMAZON_ORDERS:     'tbl0tgHiBHWD2Wwbd',
  EMAIL_LIST:   'tblSbvIuPrpeYHm8S',
  ORDERS:       'tblcjO5zznG3dgJF9',
  DISCOUNTS:    'tblvhQyCSgEZBt9bD',
  REFUNDS:      'tbly6X7DHLpusrKbv',
  PAYOUTS:      'tblZOo7OKstVH0QAG',
  SOFTWARE:             'tbll0759mAnWDeBRj',
  PPC:                  'tbltASQRNhjKMZMtc',
  AMAZON_DISBURSEMENTS: 'tblRy6Ag4wOvRiAFo',
  REVIEWS:              'tblo3QVsNlwRJwusq',
  BIONATURE:            'tble4FVBtWMMm2GRT',
  BILLING:              'tblqlDrBSELpUTzVL',
  SALES_BY_PRODUCT:     'tblrpZ9CthkffG71U',
  RSP_TRACKER:          'tbl8eIUqdU1MoKdq8',
  VINE:                 'tblPVvHk2Dzexg7X0',
  SHOPIFY_DAILY_PNL:    'tbljPXWa1nN1ipm3M',
  PRODUCT_COSTS:        'tblylteTQa0TThDQ5',
  MEETINGS:             'tbl0bkNcbY5qIZSvs',
  // OS-native tables (no Airtable counterpart). The 'os:' prefix tells the
  // Airtable sync to skip them — we own this schema now.
  //
  // The Shopify finance set is deliberately native rather than reusing the
  // empty Airtable tables above (SHOPIFY_DAILY_PNL, PRODUCT_COSTS): those still
  // exist in Airtable with no rows, so the next full sync would delete
  // everything we compute here. Shopify is the source of truth for costs now.
  COST_MODEL:           'os:uk-cost-model',
  SHOPIFY_PNL:          'os:uk-shopify-pnl',
  SHOPIFY_PRODUCTS:     'os:uk-shopify-products',
  SHOPIFY_TRAFFIC:      'os:uk-shopify-traffic',
  SHOPIFY_COSTS:        'os:uk-shopify-costs',
  // Subscriptions are derived from Shopify order history (Recharge writes its
  // state onto every order), so these are ours too. The Airtable
  // SUBSCRIPTIONS/SUBSCRIBERS tables above are empty and a sync would wipe
  // anything written to them.
  SUBS_CUSTOMERS:       'os:uk-subs-customers',
  SUBS_MONTHLY:         'os:uk-subs-monthly',
  SUBS_PRODUCTS:        'os:uk-subs-products',
  AFF_MONTHLY:          'os:uk-affiliate-monthly',
  // Klaviyo, measured. UK has no Airtable Klaviyo table at all (ME/PT do, and
  // ME's holds Gamma Waves' flow designs — the plan of record, kept separate
  // from what the API says is actually live).
  KLAVIYO_LISTS:        'os:uk-klaviyo-lists',
  KLAVIYO_FLOWS:        'os:uk-klaviyo-flows',
  KLAVIYO_CAMPAIGNS:    'os:uk-klaviyo-campaigns',
  KLAVIYO_REVENUE:      'os:uk-klaviyo-revenue',
};

/* ── ME OPERATIONS (appdN9dWxVcB2KFZ6) ───────────────────── */
const ME_TABLES = {
  TASKS:         'tbleGswAUGSDhcrE9',
  PRIORITIES:    'tblz81v4l2Beh5XtT',
  RISKS:         'tblvdSm29ycY7ENRU',
  REGISTRATIONS: 'tblyrM5AT5cAeqAeL',
  INVENTORY:     'tblZ9Z17syXw31nTq',
  AFFILIATES:    'tblxkbumbWcSOVXoJ',
  B2B:           'tblRbRwlLdCapGMEP',
  PARTNERS:      'tblkDrwHaPcTxikH1',
  FINANCE:       'tbl0HCAMkRB5hqpts',
  MARKETING:     'tbloodUOnRAg7SpYf',
  CS:            'tblAmoYqeAO0xRWui',
  CUSTOMERS:     'tblTSPyLdJobafD4W',
  REPORTING:     'tblxpactS49zjUHPc',
  SUBSCRIPTIONS: 'tbl0pbfzJiayCt03L',
  KLAVIYO:       'tblGdkaCJlTwrCIip',
  KLAVIYO_LISTS:     'os:me-klaviyo-lists',
  KLAVIYO_FLOWS:     'os:me-klaviyo-flows',
  KLAVIYO_CAMPAIGNS: 'os:me-klaviyo-campaigns',
  KLAVIYO_REVENUE:   'os:me-klaviyo-revenue',
};

/* ── PT OPERATIONS (appfEakXS6FAu2FIY) ───────────────────── */
const PT_TABLES = {
  TASKS:         'tblCs1y6PPv0Grk75',
  PRIORITIES:    'tblXU24K6GGnKJbWh',
  RISKS:         'tbls4uqqpsO7AtwBu',
  INVENTORY:     'tblxAvn1YyfJPcwhG',
  AFFILIATES:    'tbl7Bbp2RLrsVu9QO',
  B2B:           'tbltIxj8VQftFZ51Q',
  CUSTOMERS:     'tbl7S8eoNKVGQqwxJ',
  FINANCE:       'tblzQtBe9urFNimhW',
  MARKETING:     'tblVyyOlOYusZXLnr',
  CS:            'tblSelPE1OhJDFxdO',
  REPORTING:     'tblQOIni6Ebt8leCk',
  PARTNERS:      'tblNZFhlQ40zxndQl',
  SUBSCRIPTIONS: 'tblopq0TCgqZ4psFr',
  KLAVIYO:       'tblZq5tYOZmIujzYo',
};

/* ── AFFILIATE OPS (appKTwqP6KywdcIrp) ───────────────────── */
const AFF_TABLES = {
  AFFILIATES: 'tblwhKgMaGiO0eiqh',
  SALES:      'tbleBqkXTV7G222J6',
  PAYOUTS:    'tbl5UmIafiCh6DKzy',
  TRAFFIC:    'tblj7rft8W5C96RZZ',
  TASKS:      'tblV1zHSFAH11ZSvP',
  PRODUCTS:   'tblPv8narL5FunC9a',
};

/* ── PARTNER BRANDS (app6jWt9MuLq42Y5s) ──────────────────── */
const PB_TABLES = {
  BRANDS: 'tbluJOsWSfqK4rQO9',
};

/**
 * One entry per Airtable base. `envVar` is the variable lib/airtable.js reads;
 * `defaultBaseId` is the fallback used when that variable is unset.
 */
const BASES = {
  GLOBAL: { key: 'GLOBAL', label: 'Global KB',      envVar: 'AIRTABLE_BASE_ID',           defaultBaseId: 'appbbbPs9ngSR6fIK', tables: TABLES },
  UK:     { key: 'UK',     label: 'UK Operations',  envVar: 'AIRTABLE_UK_BASE_ID',        defaultBaseId: 'appb0pnXsdtALWq80', tables: UK_TABLES },
  SA:     { key: 'SA',     label: 'SA Operations',  envVar: 'AIRTABLE_SA_BASE_ID',        defaultBaseId: 'appz7wLo78sxzLhjV', tables: SA_TABLES },
  ME:     { key: 'ME',     label: 'ME Operations',  envVar: 'AIRTABLE_ME_BASE_ID',        defaultBaseId: 'appdN9dWxVcB2KFZ6', tables: ME_TABLES },
  PT:     { key: 'PT',     label: 'PT Operations',  envVar: 'AIRTABLE_PT_BASE_ID',        defaultBaseId: 'appfEakXS6FAu2FIY', tables: PT_TABLES },
  AFF:    { key: 'AFF',    label: 'Affiliate Ops',  envVar: 'AIRTABLE_AFFILIATE_BASE_ID', defaultBaseId: 'appKTwqP6KywdcIrp', tables: AFF_TABLES },
  PB:     { key: 'PB',     label: 'Partner Brands', envVar: 'AIRTABLE_PB_BASE_ID',        defaultBaseId: 'app6jWt9MuLq42Y5s', tables: PB_TABLES },
};

const BASE_BY_ENV_VAR = Object.fromEntries(
  Object.values(BASES).map(b => [b.envVar, b])
);

/*
 * `vercel env pull` writes the literal string "[SENSITIVE]" for variables marked
 * sensitive, because their values cannot be read back. Left unchecked that gets
 * used as a real credential or base ID and every request fails with an opaque
 * 404 — which is exactly what happened on 2026-07-28. Treat those placeholders
 * as unset.
 */
const PLACEHOLDER_VALUES = new Set(['[SENSITIVE]', '[REDACTED]', 'undefined', 'null']);

function realEnv(name) {
  const v = process.env[name];
  if (!v || PLACEHOLDER_VALUES.has(v.trim())) return null;
  return v;
}

/** Resolve a base ID from its env var, falling back to the hardcoded default. */
function resolveBaseId(envVar) {
  return realEnv(envVar) || (BASE_BY_ENV_VAR[envVar] && BASE_BY_ENV_VAR[envVar].defaultBaseId) || null;
}

/** Flat list of { baseKey, label, envVar, baseId, tableKey, tableId } for the sync job. */
/** True for OS-native tables that have no Airtable counterpart. */
function isNativeTable(tableId) {
  return typeof tableId === 'string' && tableId.startsWith('os:');
}

function listTables(baseKeys) {
  const keys = baseKeys && baseKeys.length ? baseKeys : Object.keys(BASES);
  const out = [];
  for (const k of keys) {
    const base = BASES[k];
    if (!base) throw new Error(`Unknown base key "${k}". Known: ${Object.keys(BASES).join(', ')}`);
    for (const [tableKey, tableId] of Object.entries(base.tables)) {
      if (isNativeTable(tableId)) continue;   // nothing to fetch from Airtable
      out.push({
        baseKey: base.key,
        label: base.label,
        envVar: base.envVar,
        baseId: resolveBaseId(base.envVar),
        tableKey,
        tableId,
      });
    }
  }
  return out;
}

/* ── FIELD NORMALISER ────────────────────────────────────── */
// Unchanged from the original lib/airtable.js so mirrored rows are
// byte-for-byte what the pages already expect.
function val(v) {
  if (!v) return '';
  if (typeof v === 'object' && v.name) return v.name;
  return v;
}

/** Flatten an Airtable record's fields into plain strings/arrays. */
function normaliseFields(raw) {
  const clean = {};
  for (const k of Object.keys(raw || {})) {
    const v = raw[k];
    clean[k] = Array.isArray(v)
      ? v.map(item => (item && typeof item === 'object' && item.name ? item.name : item))
      : val(v);
  }
  return clean;
}

/*
 * "Last modified" surrogate.
 *
 * Last Note At (set when a comment is posted) beats Last Modified. Sync-driven
 * tables (Shopify, Amazon, warehouse feeds etc.) carry a "Last Synced"-style
 * field instead of Last Modified — checked last so those tables show a real
 * update date rather than falling back to createdTime. Add new variants to
 * these lists rather than in individual pages.
 */
const MODIFIED_FIELDS = ['Last Note At', 'Last Modified', 'Last modified'];
const SYNC_FIELDS = ['Stock Last Synced', 'Last Synced', 'Last Sync', 'Synced At'];

/** @returns {{updatedAt: string|null, syncSourced: boolean}} */
function deriveUpdatedAt(clean) {
  const modified = MODIFIED_FIELDS.map(f => clean[f]).find(Boolean) || null;
  const synced = SYNC_FIELDS.map(f => clean[f]).find(Boolean) || null;
  return {
    updatedAt: modified || synced || null,
    syncSourced: Boolean(!modified && synced),
  };
}

/** Back-compat alias — returns just the date. */
function updatedAtFrom(clean) {
  return deriveUpdatedAt(clean).updatedAt;
}

function normaliseRecord(r) {
  const clean = normaliseFields(r.fields);
  // r.createdTime is undefined in airtable.js v0.12 — must read from _rawJson
  const ct = (r._rawJson && r._rawJson.createdTime) || r.createdTime || null;
  const { updatedAt, syncSourced } = deriveUpdatedAt(clean);
  const normalised = { id: r.id, ...clean };
  normalised.createdTime = ct; // set after spread so no field can override it
  normalised._updatedAt = updatedAt;
  normalised._syncSourced = syncSourced;
  return normalised;
}

module.exports = {
  TABLES,
  SA_TABLES,
  UK_TABLES,
  ME_TABLES,
  PT_TABLES,
  AFF_TABLES,
  PB_TABLES,
  BASES,
  BASE_BY_ENV_VAR,
  resolveBaseId,
  realEnv,
  isNativeTable,
  listTables,
  normaliseFields,
  normaliseRecord,
  deriveUpdatedAt,
  updatedAtFrom,
};
