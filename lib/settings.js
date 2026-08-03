/**
 * Site settings — the first of the OS-owned config tables.
 *
 * Establishes the pattern that editable copy and theme tokens will reuse:
 * a small key/value table read at render, layered over defaults that live in
 * code.
 *
 * ── The rule that makes this safe ──────────────────────────────────────────
 *
 * **A missing or blank setting falls back to the CODE DEFAULT, never to blank.**
 *
 * That is the whole difference between a configurable platform and a fragile
 * one. If an unset key rendered as an empty string, one accidental clear would
 * strip the wordmark off every page, and the failure would look like a broken
 * build rather than a blank field. Falling back means the worst an empty value
 * can do is return the OS to how it ships.
 *
 * It also means this can be adopted incrementally: replacing a hardcoded string
 * with `get('site.name')` changes nothing until Romano actually sets it.
 *
 * Reads never throw. Settings sit in the layout of every page, so a database
 * blip must degrade to defaults rather than take the whole OS down — the one
 * place where swallowing an error is the right call, because the alternative is
 * no page at all.
 */
const { getPrisma, isConfigured } = require('./prisma');
const { BASES, resolveBaseId } = require('./airtable-tables');

const TABLE = 'os:settings';

/**
 * Every setting the OS understands, with the value it ships with.
 *
 * This list IS the schema. A key not here is ignored rather than rendered,
 * so a typo in the admin table cannot inject an unexpected string into the
 * layout. Adding a setting means adding it here first.
 */
const DEFAULTS = {
  'site.name':        'Natroceutics OS',
  'site.company':     'Natroceutics®',
  'site.wordmarkSub': 'OS',
  'site.tagline':     'We are efficacy first.',
  'site.footer':      'Natroceutics® OS · Internal · Confidential',
  'site.appTitle':    'Natro-OS',
  'meta.description': 'Internal operations platform for Natroceutics.',
  'contact.email':    '',
  'contact.phone':    '',
  'format.timezone':  'Europe/London',
  'format.currency':  'GBP',
  'format.date':      'en-GB',
};

const LABELS = {
  'site.name':        'Site name (browser tab)',
  'site.company':     'Company name',
  'site.wordmarkSub': 'Wordmark suffix',
  'site.tagline':     'Footer tagline',
  'site.footer':      'Footer line',
  'site.appTitle':    'Home-screen app name',
  'meta.description': 'Meta description',
  'contact.email':    'Support email',
  'contact.phone':    'Phone number',
  'format.timezone':  'Time zone',
  'format.currency':  'Currency',
  'format.date':      'Date locale',
};

let cache = null;
let cachedAt = 0;
const TTL_MS = 30_000;

async function loadStored() {
  if (!isConfigured()) return {};
  const base = BASES.GLOBAL;
  const baseId = resolveBaseId(base.envVar) || base.defaultBaseId;
  const rows = await getPrisma().$queryRaw`
    SELECT "recordId", "fields"::text AS f
    FROM "AirtableRecord"
    WHERE "baseId" = ${baseId} AND "tableId" = ${TABLE}`;
  const out = {};
  for (const r of rows) {
    try {
      const v = JSON.parse(r.f)?.Value;
      // An empty stored value is treated as UNSET, so clearing a field in the
      // admin returns it to the shipped default rather than blanking the UI.
      if (v !== undefined && v !== null && String(v).trim() !== '') out[r.recordId] = String(v);
    } catch { /* a malformed row falls back to its default */ }
  }
  return out;
}

/** All settings, defaults layered under whatever is stored. Never throws. */
async function getSettings() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  let stored = {};
  try {
    stored = await loadStored();
  } catch (e) {
    // Deliberately swallowed: this runs in the layout of every page.
    console.warn('[settings] falling back to defaults:', e.message);
  }
  const merged = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (stored[k] !== undefined) merged[k] = stored[k];
  cache = merged;
  cachedAt = Date.now();
  return merged;
}

/** Rows for the admin editor: key, label, current value and whether it is set. */
async function getSettingsForAdmin() {
  let stored = {};
  let error = null;
  try { stored = await loadStored(); } catch (e) { error = e.message; }
  return {
    error,
    rows: Object.keys(DEFAULTS).map(key => ({
      key,
      label: LABELS[key] || key,
      value: stored[key] ?? '',
      fallback: DEFAULTS[key],
      isSet: stored[key] !== undefined,
    })),
  };
}

function invalidateSettingsCache() { cache = null; cachedAt = 0; }

module.exports = { getSettings, getSettingsForAdmin, invalidateSettingsCache, DEFAULTS, LABELS, TABLE };
