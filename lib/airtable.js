const Airtable = require('airtable');
const { fetchFromMirror } = require('./mirror');

// Base/table IDs and the field normaliser now live in lib/airtable-tables.js so
// scripts/sync-airtable.js can share them without going through the bundler.
const {
  TABLES,
  SA_TABLES,
  UK_TABLES,
  ME_TABLES,
  PT_TABLES,
  AFF_TABLES,
  PB_TABLES,
  resolveBaseId,
  normaliseRecord,
} = require('./airtable-tables');

/* ── BASE FACTORIES ──────────────────────────────────────────
 * The SDK's defaults are dangerous for a server-rendered page:
 *
 *   noRetryIfRateLimited: false  — on a 429 it recurses forever with backoff,
 *                                  never invoking the callback. The promise
 *                                  neither resolves nor rejects, so the page's
 *                                  own .catch() handlers can never fire.
 *   requestTimeout: 300_000      — a single stalled request can consume the
 *                                  entire serverless budget on its own.
 *
 * Together those turned an exhausted Airtable quota into a 5-minute hang and a
 * 504 on /global, instead of a page that renders with empty sections. We take
 * over retrying ourselves below so failures are bounded and actually surface.
 * ─────────────────────────────────────────────────────────── */
const AIRTABLE_REQUEST_TIMEOUT_MS = 15_000;

function airtableClient() {
  return new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY,
    noRetryIfRateLimited: true,
    requestTimeout: AIRTABLE_REQUEST_TIMEOUT_MS,
  });
}

function getBase() {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    throw new Error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID env vars');
  }
  return airtableClient().base(process.env.AIRTABLE_BASE_ID);
}

function getRegionBase(baseEnvVar) {
  const baseId = process.env[baseEnvVar];
  if (!process.env.AIRTABLE_API_KEY || !baseId) {
    throw new Error(`Missing AIRTABLE_API_KEY or ${baseEnvVar} env vars`);
  }
  return airtableClient().base(baseId);
}

/* ── BOUNDED RETRY ───────────────────────────────────────────
 * Replaces the SDK's unbounded retry. Airtable allows 5 requests/second per
 * base, so a short burst genuinely is worth retrying — but a hard monthly cap
 * never clears, so the attempts must be finite.
 *
 * Both arrive as a 429 and the SDK discards the response body, so they are
 * indistinguishable here. Two quick retries covers the transient case and costs
 * ~3s before giving up on the permanent one.
 * ─────────────────────────────────────────────────────────── */
const RETRY_DELAYS_MS = [1000, 2000];

function isRateLimited(err) {
  return err && (err.statusCode === 429 || err.error === 'TOO_MANY_REQUESTS');
}

async function withRetry(label, fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimited(err) || attempt >= RETRY_DELAYS_MS.length) {
        if (isRateLimited(err)) {
          // Make the quota case unmistakable in the logs — it looks like a
          // generic failure otherwise.
          console.error(`[airtable] rate limited/quota exceeded after ${attempt + 1} attempts: ${label}`);
        }
        throw err;
      }
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

/* ── GENERIC FETCH ───────────────────────────────────────────
 * Every getter below goes through one of these two functions, and both now try
 * the Postgres mirror first. fetchFromMirror() returns null whenever the table
 * has not been synced yet, the mirror is disabled (DATA_SOURCE=airtable), or
 * Postgres is unreachable — in which case we fall through to a live Airtable
 * request exactly as before. That is what lets the migration roll out one base
 * at a time with no per-page changes: a table moves off the Airtable API the
 * moment scripts/sync-airtable.js first backfills it.
 * ─────────────────────────────────────────────────────────── */
async function fetchAll(tableId, sortField, base, baseId) {
  const effectiveBaseId = baseId || resolveBaseId('AIRTABLE_BASE_ID');

  const mirrored = await fetchFromMirror(effectiveBaseId, tableId, { sortField, sortDir: 'asc' });
  if (mirrored) return mirrored;

  const b = base || getBase();
  const opts = sortField ? { sort: [{ field: sortField, direction: 'asc' }] } : {};

  const records = await withRetry(tableId, () => new Promise((resolve, reject) => {
    const acc = [];
    b(tableId)
      .select(opts)
      .eachPage(
        (page, next) => { page.forEach(r => acc.push(normaliseRecord(r))); next(); },
        err => (err ? reject(err) : resolve(acc))
      );
  }));
  // Inject source coordinates so the client can call the comments API
  return records.map(r => ({ ...r, _baseId: effectiveBaseId, _tableId: tableId }));
}

async function fetchFromRegion(baseEnvVar, tableId, sortField, maxRecords, sortDir = 'asc') {
  const baseId = resolveBaseId(baseEnvVar);

  const mirrored = await fetchFromMirror(baseId, tableId, { sortField, maxRecords, sortDir });
  if (mirrored) return mirrored;

  const b = getRegionBase(baseEnvVar);
  const opts = {
    ...(sortField ? { sort: [{ field: sortField, direction: sortDir }] } : {}),
    ...(maxRecords ? { maxRecords } : {}),
  };

  const records = await withRetry(`${baseEnvVar}/${tableId}`, () => new Promise((resolve, reject) => {
    const acc = [];
    b(tableId).select(opts).eachPage(
      (page, next) => { page.forEach(r => acc.push(normaliseRecord(r))); next(); },
      err => (err ? reject(err) : resolve(acc))
    );
  }));
  return records.map(r => ({ ...r, _baseId: baseId, _tableId: tableId }));
}

/* ── GLOBAL KB — PUBLIC API ──────────────────────────────── */
export async function getProducts()   { return fetchAll(TABLES.PRODUCTS,   'Product Name'); }
export async function getSOPs()       { return fetchAll(TABLES.SOPS,        'SOP ID'); }
export async function getContacts()   { return fetchAll(TABLES.CONTACTS,    'Name'); }
export async function getRegulatory() { return fetchAll(TABLES.REGULATORY,  'Item'); }
export async function getPlatforms()  { return fetchAll(TABLES.PLATFORMS,   'Platform'); }
export async function getAllItems()   { return fetchAll(TABLES.KNOWLEDGE); }

export async function createItem(fields) {
  const base = getBase();
  return new Promise((resolve, reject) => {
    base(TABLES.KNOWLEDGE).create([{ fields }], { typecast: true }, (err, records) => {
      if (err) return reject(err);
      resolve({ id: records[0].id, ...records[0].fields });
    });
  });
}

export async function getHomeStats() {
  const [products, sops, contacts, platforms, regulatory, knowledge] = await Promise.all([
    fetchAll(TABLES.PRODUCTS),
    fetchAll(TABLES.SOPS),
    fetchAll(TABLES.CONTACTS),
    fetchAll(TABLES.PLATFORMS),
    fetchAll(TABLES.REGULATORY),
    fetchAll(TABLES.KNOWLEDGE),
  ]);
  const sopByStatus = {};
  sops.forEach(s => {
    const st = s.Status || 'Unknown';
    sopByStatus[st] = (sopByStatus[st] || 0) + 1;
  });
  const recentKnowledge = [...knowledge]
    .sort((a, b) => (b.last_updated || '').localeCompare(a.last_updated || ''))
    .slice(0, 3);
  return { products: products.length, sops: sops.length, contacts: contacts.length,
    platforms: platforms.length, regulatory: regulatory.length, knowledge: knowledge.length,
    sopByStatus, recentKnowledge };
}

export async function getStats() {
  const items = await getAllItems();
  const categories = {};
  items.forEach(item => {
    const cat = item.category || 'Uncategorised';
    categories[cat] = (categories[cat] || 0) + 1;
  });
  return { total: items.length, categories };
}

/* ── SA — PUBLIC API ─────────────────────────────────────── */
export async function getSATasks()      { return fetchFromRegion('AIRTABLE_SA_BASE_ID', SA_TABLES.TASKS, 'Task'); }
export async function getSAPriorities() { return fetchFromRegion('AIRTABLE_SA_BASE_ID', SA_TABLES.PRIORITIES, 'Priority Item'); }
export async function getSARisks()      { return fetchFromRegion('AIRTABLE_SA_BASE_ID', SA_TABLES.RISKS); }
export async function getSAInventory()  { return fetchFromRegion('AIRTABLE_SA_BASE_ID', SA_TABLES.INVENTORY, 'SKU'); }
export async function getSAFinance()    { return fetchFromRegion('AIRTABLE_SA_BASE_ID', SA_TABLES.FINANCE); }
export async function getSAB2B()        { return fetchFromRegion('AIRTABLE_SA_BASE_ID', SA_TABLES.B2B, 'Account Name'); }
export async function getSACustomers()  { return fetchFromRegion('AIRTABLE_SA_BASE_ID', SA_TABLES.CUSTOMERS, 'Customer Name'); }
export async function getSAMarketing()  { return fetchFromRegion('AIRTABLE_SA_BASE_ID', SA_TABLES.MARKETING); }
export async function getSACS()         { return fetchFromRegion('AIRTABLE_SA_BASE_ID', SA_TABLES.CS); }
export async function getSAReporting()  { return fetchFromRegion('AIRTABLE_SA_BASE_ID', SA_TABLES.REPORTING); }

/* ── UK — PUBLIC API ─────────────────────────────────────── */
export async function getUKTasks()         { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.TASKS, 'Task'); }
export async function getUKPriorities()    { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.PRIORITIES, 'Priority Item'); }
export async function getUKRisks()         { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.RISKS); }
export async function getUKAmazon()        { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.AMAZON, 'Product'); }
export async function getUKShopify()       { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.SHOPIFY, 'SKU'); }
export async function getUKStock()         { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.STOCK, 'SKU'); }
export async function getUKReporting()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.REPORTING); }
export async function getUKReconcile()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.RECONCILE, null, 100); }
export async function getUKB2B()           { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.B2B, 'Business Name'); }
export async function getUKCS()            { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.CS, null, 200); }
export async function getUKCustomers()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.CUSTOMERS, 'Customer Name', 300); }
export async function getUKAffiliates()    { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.AFFILIATES, 'Name'); }
export async function getUKMarketing()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.MARKETING); }
export async function getUKSubscriptions() { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.SUBSCRIPTIONS, 'Plan Name'); }
export async function getUKSubscribers()   { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.SUBSCRIBERS, 'Subscriber Name'); }
export async function getUKAmazonCat()          { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.AMAZON_CAT); }
export async function getUKAmazonDailyPnL()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.AMAZON_DAILY_PNL,  'Date',       90,  'desc'); }
export async function getUKAmazonAsinDaily()    { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.AMAZON_ASIN_DAILY, 'Date',       300, 'desc'); }
export async function getUKAmazonOrders()       { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.AMAZON_ORDERS,     'Shipped Date', 150, 'desc'); }
export async function getUKEmailList()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.EMAIL_LIST, 'Email'); }
export async function getUKOrders()        { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.ORDERS, 'Order Date', 300, 'desc'); }
export async function getUKDiscounts()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.DISCOUNTS, 'Voucher Code'); }
export async function getUKRefunds()       { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.REFUNDS, null, 200); }
export async function getUKPayouts()       { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.PAYOUTS); }
export async function getUKSoftware()      { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.SOFTWARE, 'Platform'); }
export async function getUKInbound()       { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.INBOUND, 'SKU'); }
export async function getUKPPC()                    { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.PPC, 'Campaign Name', 200); }
export async function getUKAmazonDisbursements()    { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.AMAZON_DISBURSEMENTS, null, 100); }

/* ── PARTNER BRANDS — PUBLIC API ─────────────────────────── */
export async function getPartnerBrands() { return fetchFromRegion('AIRTABLE_PB_BASE_ID', PB_TABLES.BRANDS); }

/* ── ME — PUBLIC API ─────────────────────────────────────── */
export async function getMETasks()         { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.TASKS, 'Task'); }
export async function getMEPriorities()    { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.PRIORITIES, 'Priority Item'); }
export async function getMERisks()         { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.RISKS); }
export async function getMERegistrations() { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.REGISTRATIONS, 'Product Name'); }
export async function getMEInventory()     { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.INVENTORY, 'Product Name'); }
export async function getMEAffiliates()    { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.AFFILIATES, 'Name'); }
export async function getMEB2B()           { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.B2B, 'Business Name'); }
export async function getMEPartners()      { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.PARTNERS, 'Partner Name'); }
export async function getMEFinance()       { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.FINANCE); }
export async function getMEMarketing()     { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.MARKETING); }
export async function getMECS()            { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.CS); }
export async function getMECustomers()     { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.CUSTOMERS, 'Customer Name'); }
export async function getMEReporting()     { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.REPORTING); }
export async function getMESubscriptions() { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.SUBSCRIPTIONS, 'Plan Name'); }
export async function getMEKlaviyo()       { return fetchFromRegion('AIRTABLE_ME_BASE_ID', ME_TABLES.KLAVIYO, 'Flow Name'); }
// NOTE: ME had no Products table of its own (tblFVhJpN0n1WSmjh returns 422 — deleted).
// me.js reads the Products tab from the Global KB via getProducts().

/* ── SA — NEW EXPORTS ────────────────────────────────────── */
export async function getSAWebinar() { return fetchFromRegion('AIRTABLE_SA_BASE_ID', SA_TABLES.WEBINAR, 'Webinar Name'); }

/* ── UK — NEW EXPORTS ────────────────────────────────────── */
export async function getUKAmazonReviews()  { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.REVIEWS, 'Review Date', 200, 'desc'); }
export async function getUKBionature()      { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.BIONATURE, 'SKU Code'); }
export async function getUKBilling()        { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.BILLING, 'Invoice Date'); }
export async function getUKRSPTracker()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.RSP_TRACKER, 'Product'); }
export async function getUKSalesByProduct() { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.SALES_BY_PRODUCT, 'SKU', 500); }
export async function getUKVine()           { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.VINE, 'Product'); }
export async function getUKShopifyDailyPnL() { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.SHOPIFY_DAILY_PNL, 'Date', 90, 'desc'); }
export async function getUKProductCosts()    { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.PRODUCT_COSTS, 'SKU', 100); }
export async function getUKMeetings()        { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.MEETINGS, 'Date', 100, 'desc'); }

/* ── GLOBAL KB — NEW EXPORTS ─────────────────────────────── */
export async function getBrandAssets()  { return fetchAll(TABLES.BRAND_ASSETS,  'Asset Name'); }
export async function getCompanyInfo()  { return fetchAll(TABLES.COMPANY_INFO,  'Item'); }
export async function getTemplates()    { return fetchAll(TABLES.TEMPLATES,     'Template Name'); }
export async function getTraining()     { return fetchAll(TABLES.TRAINING,      'Resource Title'); }
export async function getDistributionMarkets() { return fetchAll(TABLES.DIST_MARKETS, 'Market'); }

/* ── PT — PUBLIC API ─────────────────────────────────────── */
export async function getPTTasks()         { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.TASKS, 'Task'); }
export async function getPTPriorities()    { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.PRIORITIES, 'Priority Item'); }
export async function getPTRisks()         { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.RISKS); }
export async function getPTInventory()     { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.INVENTORY, 'SKU'); }
export async function getPTAffiliates()    { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.AFFILIATES, 'Affiliate Name'); }
export async function getPTB2B()           { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.B2B, 'Account Name'); }
export async function getPTCustomers()     { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.CUSTOMERS, 'Customer Name'); }
export async function getPTFinance()       { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.FINANCE); }
export async function getPTMarketing()     { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.MARKETING); }
export async function getPTCS()            { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.CS); }
export async function getPTReporting()     { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.REPORTING); }
export async function getPTPartners()      { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.PARTNERS, 'Partner Name'); }
export async function getPTSubscriptions() { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.SUBSCRIPTIONS, 'Plan Name'); }
export async function getPTKlaviyo()       { return fetchFromRegion('AIRTABLE_PT_BASE_ID', PT_TABLES.KLAVIYO, 'Flow Name'); }

/* ── AFFILIATE OPS — PUBLIC API ──────────────────────────── */
export async function getAffiliates()        { return fetchFromRegion('AIRTABLE_AFFILIATE_BASE_ID', AFF_TABLES.AFFILIATES, 'Name'); }
export async function getAffiliateSales()    { return fetchFromRegion('AIRTABLE_AFFILIATE_BASE_ID', AFF_TABLES.SALES, null, 200); }
export async function getAffiliatePayouts()  { return fetchFromRegion('AIRTABLE_AFFILIATE_BASE_ID', AFF_TABLES.PAYOUTS, null, 100); }
export async function getAffiliateTraffic()  { return fetchFromRegion('AIRTABLE_AFFILIATE_BASE_ID', AFF_TABLES.TRAFFIC, 'Affiliate Name', 200); }
export async function getAffiliateTasks()    { return fetchFromRegion('AIRTABLE_AFFILIATE_BASE_ID', AFF_TABLES.TASKS); }
export async function getAffiliateProducts() { return fetchFromRegion('AIRTABLE_AFFILIATE_BASE_ID', AFF_TABLES.PRODUCTS, 'Product'); }
