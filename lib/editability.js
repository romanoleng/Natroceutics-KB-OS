/**
 * Which tables may be edited by hand, and which a feed would overwrite.
 *
 * This is the 3 August audit encoded so nothing has to guess. The test is NOT
 * "does a feed touch this table", it is **does the writer REPLACE the table or
 * add to it**. A hand-typed value on a replaced table survives until the next
 * run and then vanishes, which is worse than never offering the edit at all,
 * because it is trusted in the meantime.
 *
 * Three verdicts:
 *   'open'    nothing live rewrites it. Edit freely.
 *   'partial' a script writes SOME of it. Named rows or fields are protected.
 *   'feed'    rebuilt wholesale on every run. Read-only, with the reason shown.
 *
 * Airtable is retired, so a table whose only historic writer was the Airtable
 * sync now has no live writer and is 'open'. That covers most region tables.
 *
 * WHEN YOU ADD A PULL SCRIPT, ADD ITS TABLE HERE. A new feed that quietly
 * starts replacing an 'open' table is exactly the silent failure this file
 * exists to prevent.
 */

/** Rebuilt wholesale. `${baseKey}.${tableKey}` → why it cannot be edited. */
const FEED_TABLES = {
  'UK.ORDERS':            'Rebuilt from Shopify on every orders pull.',
  'UK.SHOPIFY_PNL':       'Rebuilt by the Shopify finance pull.',
  'UK.SHOPIFY_PRODUCTS':  'Rebuilt by the Shopify finance pull.',
  'UK.SHOPIFY_TRAFFIC':   'Rebuilt by the Shopify finance pull.',
  'UK.SHOPIFY_COSTS':     'Unit costs live in Shopify. Set them there, not here.',
  'UK.SHOPIFY_PAYOUTS':   'Rebuilt from Shopify payout reconciliation.',
  'UK.SHOPIFY_YTD':       'Recomputed by the Shopify finance pull.',
  'UK.SUBS_CUSTOMERS':    'Rebuilt by the subscriptions pull.',
  'UK.SUBS_MONTHLY':      'Rebuilt by the subscriptions pull.',
  'UK.SUBS_PRODUCTS':     'Rebuilt by the subscriptions pull.',
  'UK.KLAVIYO_LISTS':     'Rebuilt by the Klaviyo pull.',
  'UK.KLAVIYO_FLOWS':     'Rebuilt by the Klaviyo pull.',
  'UK.KLAVIYO_CAMPAIGNS': 'Rebuilt by the Klaviyo pull.',
  'UK.KLAVIYO_REVENUE':   'Rebuilt by the Klaviyo pull.',
  'UK.AFFILIATES_LIVE':   'Rebuilt by the GoAffPro pull.',
  'UK.AFF_MONTHLY':       'Rebuilt by the GoAffPro pull.',
  'UK.AMAZON':            'Rebuilt from the Sellerboard stock export.',
  'UK.AMAZON_ASIN_DAILY': 'Rebuilt from the Sellerboard ASIN export.',
  'UK.AMAZON_DAILY_PNL':  'Rebuilt from the Sellerboard P&L export.',
  'UK.AMAZON_ORDERS':     'Rebuilt from the Sellerboard orders export.',
  'UK.STOCK':             'Rebuilt from the warehouse SOH workbook on every upload.',
  'UK.MEETINGS':          'Written by the Granola feed.',
  'SA.MAILCHIMP_AUDIENCES':   'Rebuilt by the Mailchimp pull.',
  'SA.MAILCHIMP_CAMPAIGNS':   'Rebuilt by the Mailchimp pull.',
  'SA.MAILCHIMP_AUTOMATIONS': 'Rebuilt by the Mailchimp pull.',
};

/**
 * Tables a script writes only PART of.
 *
 * `rows` are recordIds the script recomputes; `note` explains the rest. Every
 * other row is genuinely safe, and in UK.COST_MODEL's case that is because
 * goaffpro-pull reads the others back out of the mirror and writes them again
 * untouched rather than discarding them.
 */
const PARTIAL_TABLES = {
  'UK.COST_MODEL': {
    rows: ['affiliate_commission'],
    note: 'Affiliate commission is recomputed from GoAffPro daily. Every other line is yours.',
  },
  'GLOBAL.FINDINGS': {
    fields: ['Finding', 'Severity', 'Evidence A', 'Evidence B', 'Why it matters',
             'Suggested action', 'Money at risk', 'Area', 'Page', 'Method'],
    note: 'The findings pass rewrites the evidence on every run. Status and Resolution are yours and are never overwritten.',
  },
};

function tableVerdict(baseKey, tableKey) {
  const id = `${baseKey}.${tableKey}`;
  if (FEED_TABLES[id]) return { verdict: 'feed', reason: FEED_TABLES[id] };
  if (PARTIAL_TABLES[id]) return { verdict: 'partial', reason: PARTIAL_TABLES[id].note, ...PARTIAL_TABLES[id] };
  return { verdict: 'open', reason: 'No live feed writes this. Edits persist.' };
}

/** Can this specific row be edited? Partial tables protect named recordIds. */
function rowEditable(baseKey, tableKey, recordId) {
  const v = tableVerdict(baseKey, tableKey);
  if (v.verdict === 'feed') return false;
  if (v.verdict === 'partial' && v.rows) return !v.rows.includes(recordId);
  return true;
}

/** Can this specific field be edited? Partial tables may protect named fields. */
function fieldEditable(baseKey, tableKey, fieldName) {
  const v = tableVerdict(baseKey, tableKey);
  if (v.verdict === 'feed') return false;
  if (v.verdict === 'partial' && v.fields) return !v.fields.includes(fieldName);
  return true;
}

module.exports = { tableVerdict, rowEditable, fieldEditable, FEED_TABLES, PARTIAL_TABLES };
