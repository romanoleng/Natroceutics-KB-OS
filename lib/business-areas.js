/**
 * Business Area: ONE vocabulary, and the mapping that gets there from the mess.
 *
 * The field had 21 distinct values across 183 UK tasks for about 12 real
 * concepts, because three writers each invented their own words and two of them
 * used emoji prefixes:
 *
 *   "🛒 Amazon UK" (36) · "Amazon" (28) · "Amazon UK" (4)   → one thing, three strings
 *   "Shopify" (34) · "🛍️ Shopify UK" (10)                   → one thing, two strings
 *   "Warehouse" (24) · "🏭 Warehouse" (7)                    → one thing, two strings
 *
 * A reader sees one category. A GROUP BY sees three. That is the problem
 * CLAUDE.md flags, and it is why capture could not offer "Amazon UK" as a
 * sub-category: there was no agreed name to offer.
 *
 * Canonical names are REGION-QUALIFIED where the work is region-specific
 * (Amazon UK, Shopify UK) and bare where it is not (Finance, Warehouse). That
 * matches how Romano already types them.
 *
 * Normalising on READ is not enough. Anything that groups or sorts on a stored
 * field needs the stored field cleaned, or the tidy display hides two different
 * strings underneath — which is exactly how this got to 21 values unnoticed.
 * scripts/normalise-business-areas.js does the stored half.
 */

/** The list offered in every picker, in the order it should appear. */
const AREAS = {
  UK: [
    'Amazon UK',
    'Shopify UK',
    'Warehouse',
    'B2B',
    'Subscriptions',
    'Affiliates',
    'Marketing',
    'Customer Experience',
    'Packaging',
    'Events',
    'Finance',
    'General',
  ],
  ME: ['Shopify ME', 'Launch', 'Partners', 'Marketing', 'Finance', 'General'],
  SA: ['B2B', 'Marketing', 'Customer Experience', 'Events', 'Finance', 'General'],
  PT: ['B2B', 'Marketing', 'Finance', 'General'],
  AFF: ['Affiliates', 'Marketing', 'Finance', 'General'],
};

/**
 * Everything seen in the wild → its canonical name. Keys are lower-cased and
 * stripped of emoji and punctuation before lookup, so "🛒 Amazon UK",
 * "Amazon UK" and "amazon-uk" all land on the same entry without needing a row
 * each.
 */
const ALIASES = {
  'amazon': 'Amazon UK',
  'amazon uk': 'Amazon UK',
  'amazon us': 'Amazon UK',
  'shopify': 'Shopify UK',
  'shopify uk': 'Shopify UK',
  'shopify me': 'Shopify ME',
  'warehouse': 'Warehouse',
  'stock': 'Warehouse',
  'inventory': 'Warehouse',
  'packaging': 'Packaging',
  'b2b': 'B2B',
  'wholesale': 'B2B',
  'subscriptions': 'Subscriptions',
  'subscription': 'Subscriptions',
  'affiliate uk': 'Affiliates',
  'affiliate': 'Affiliates',
  'affiliates': 'Affiliates',
  'marketing': 'Marketing',
  'customer experience': 'Customer Experience',
  'customer service': 'Customer Experience',
  'cs': 'Customer Experience',
  'webinar': 'Events',
  'webinars': 'Events',
  'events': 'Events',
  'finance': 'Finance',
  'billing': 'Finance',
  'general': 'General',
  'ecommerce': 'General',
  'e-commerce': 'General',
  'orders': 'Shopify UK',
  'customers': 'Customer Experience',
  'meetings': 'General',
};

/**
 * "Middle East" is a REGION sitting in a business-area field, on 7 UK tasks.
 * Mapping it to a UK area would bury the mistake; it is reported separately so
 * Romano can decide whether those tasks belong to ME instead. Silently guessing
 * is how a mis-filed task becomes permanently invisible.
 */
const REGION_WORDS = new Set(['middle east', 'me', 'uk', 'south africa', 'sa', 'portugal', 'pt']);

/** Strip emoji, punctuation and case so aliases need one entry, not six. */
function slug(value) {
  return String(value || '')
    // Emoji and variation selectors, which two writers prefix onto every value.
    .replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/[_\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * @returns {{value: string|null, changed: boolean, isRegion: boolean}}
 *   `value` is the canonical name, or null when nothing sensible applies.
 */
function normaliseArea(raw) {
  const s = slug(raw);
  if (!s) return { value: null, changed: false, isRegion: false };
  if (REGION_WORDS.has(s)) return { value: null, changed: false, isRegion: true };
  const hit = ALIASES[s];
  if (hit) return { value: hit, changed: hit !== String(raw).trim(), isRegion: false };
  // Unknown but non-empty: keep it rather than blanking. Losing a category
  // nobody predicted is worse than carrying one extra string.
  const titled = String(raw).trim();
  return { value: titled, changed: false, isRegion: false };
}

/** The picker list for a region, always including anything already stored. */
function areasFor(regionKey, extra = []) {
  const base = AREAS[regionKey] || AREAS.UK;
  const merged = [...base];
  for (const e of extra) if (e && !merged.includes(e)) merged.push(e);
  return merged;
}

module.exports = { AREAS, ALIASES, normaliseArea, areasFor, slug };
