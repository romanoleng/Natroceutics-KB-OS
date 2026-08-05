/**
 * Where a capture or an upload is allowed to land.
 *
 * ONE list, shared by the paste box, the file drop and Smart Capture, so
 * "where does this go" has a single answer everywhere in the OS. Before this
 * existed the paste box offered four hand-written targets, Smart Capture
 * offered ten section LABELS that were not destinations at all, and neither
 * knew about the 123 tables actually in the database.
 *
 * WHY A TABLE IS OFFERED OR NOT
 *
 * The test is the one already written into CLAUDE.md: not "does a feed touch
 * this table" but "does the writer REPLACE the table or ADD to it". A row typed
 * into a replaced table survives until the next pull and then vanishes, which is
 * worse than never offering the destination, because it is trusted in the
 * meantime.
 *
 * So FEED_OWNED below is not a guess from the table name. It is the list of
 * tables a pull script or importer rebuilds from scratch, read off the writers
 * themselves. The CLAUDE.md shorthand "UK.AMAZON*" is blunter than reality:
 * sellerboard REPLACES UK.AMAZON and UK.RSP_TRACKER but MERGES
 * UK.AMAZON_DAILY_PNL, UK.AMAZON_ASIN_DAILY and UK.AMAZON_ORDERS on a natural
 * key. Merged tables are still feed-owned in spirit — a hand-typed row there
 * would silently corrupt the P&L — so they are listed too, with their own
 * reason.
 *
 * Getting this wrong in either direction is expensive: too strict and a usable
 * table is invisible, too loose and an upload is quietly eaten by the next
 * nightly run.
 */

const { BASES } = require('./airtable-tables');

/** Rebuilt from scratch on every run. Anything typed here is destroyed. */
const REPLACED = {
  'UK.AMAZON':            'Sellerboard stock export replaces this nightly',
  'UK.RSP_TRACKER':       'the RSP competitor sheet replaces this on upload',
  'UK.STOCK':             'the warehouse SOH workbook replaces this on upload',
  'UK.SHOPIFY_PNL':       'shopify-pull rebuilds this',
  'UK.SHOPIFY_PRODUCTS':  'shopify-pull rebuilds this',
  'UK.SHOPIFY_COSTS':     'shopify-pull rebuilds this (unit costs live in Shopify)',
  'UK.SHOPIFY_PAYOUTS':   'shopify-finance-pull rebuilds this',
  'UK.SHOPIFY_YTD':       'shopify-finance-pull rebuilds this',
  'UK.SUBS_MONTHLY':      'subscriptions-pull rebuilds this',
  'UK.SUBS_CUSTOMERS':    'subscriptions-pull rebuilds this',
  'UK.SUBS_PRODUCTS':     'subscriptions-pull rebuilds this',
  'UK.KLAVIYO_LISTS':     'klaviyo-pull rebuilds this',
  'UK.KLAVIYO_FLOWS':     'klaviyo-pull rebuilds this',
  'UK.KLAVIYO_CAMPAIGNS': 'klaviyo-pull rebuilds this',
  'UK.KLAVIYO_REVENUE':   'klaviyo-pull rebuilds this',
  'UK.AFFILIATES_LIVE':   'goaffpro-pull rebuilds this',
  'UK.AFF_MONTHLY':       'goaffpro-pull rebuilds this',
  'ME.KLAVIYO':           'klaviyo-pull rebuilds this',
  'SA.MAILCHIMP_AUDIENCES':   'mailchimp-pull rebuilds this',
  'SA.MAILCHIMP_CAMPAIGNS':   'mailchimp-pull rebuilds this',
  'SA.MAILCHIMP_AUTOMATIONS': 'mailchimp-pull rebuilds this',
};

/**
 * Merged on a natural key rather than replaced, so an upload here would NOT be
 * deleted — but it would sit in a feed's table and be read as if the feed had
 * produced it. Financial series must have one author.
 */
const FEED_MERGED = {
  'UK.AMAZON_DAILY_PNL':  'the Amazon daily P&L is built from Sellerboard only',
  'UK.AMAZON_ASIN_DAILY': 'the per-ASIN P&L is built from Sellerboard only',
  'UK.AMAZON_ORDERS':     'Amazon orders arrive from Sellerboard only',
  'UK.MEETINGS':          'meetings arrive from Granola only',
  'GLOBAL.FINDINGS':      'findings are written by the findings pass, and closing is preserved',
  'UK.COST_MODEL':        'goaffpro-pull recomputes affiliate_commission daily — edit rows on the page instead',
};

/** `${baseKey}.${tableKey}` → why it is locked, or null if it is writable. */
function lockReason(baseKey, tableKey) {
  const key = `${baseKey}.${tableKey}`;
  return REPLACED[key] || FEED_MERGED[key] || null;
}

function isWritable(baseKey, tableKey) {
  return !lockReason(baseKey, tableKey);
}

/**
 * Every destination in the OS, grouped by base, newest-friendly labels.
 *
 * `includeLocked` returns the locked ones too, carrying their reason, so a UI
 * can EXPLAIN the absence rather than silently shortening the list. A missing
 * option with no explanation reads as a bug and sends people to the terminal.
 */
function listDestinations({ includeLocked = false } = {}) {
  const groups = [];
  for (const [baseKey, base] of Object.entries(BASES)) {
    const tables = Object.keys(base.tables || {}).sort();
    const items = [];
    for (const tableKey of tables) {
      const reason = lockReason(baseKey, tableKey);
      if (reason && !includeLocked) continue;
      items.push({
        value: `${baseKey}.${tableKey}`,
        baseKey,
        tableKey,
        label: tableKey.replace(/_/g, ' '),
        locked: Boolean(reason),
        lockReason: reason,
      });
    }
    if (items.length) groups.push({ baseKey, label: base.label || baseKey, items });
  }
  return groups;
}

module.exports = { listDestinations, isWritable, lockReason, REPLACED, FEED_MERGED };
