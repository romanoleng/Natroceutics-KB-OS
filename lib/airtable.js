const Airtable = require('airtable');

/* ── GLOBAL KB BASE (appbbbPs9ngSR6fIK) ─────────────────── */
const TABLES = {
  PRODUCTS:   'tblvqKsikkBxxxzc3',
  SOPS:       'tblUIOawN9l2ws0Za',
  CONTACTS:   'tblESsxXkjHLSywdf',
  REGULATORY: 'tbllK0YmQRBAqJfwm',
  PLATFORMS:  'tbl7A2w43Sz6Q5AQv',
  KNOWLEDGE:  'tbli6Hw7UwQnl82iE',
};

/* ── SA TABLE IDs (appz7wLo78sxzLhjV) ───────────────────── */
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
};

/* ── UK TABLE IDs (appb0pnXsdtALWq80) ───────────────────── */
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
  AMAZON_CAT:   'tblL0G8JL77q6noYO',
  EMAIL_LIST:   'tblSbvIuPrpeYHm8S',
  ORDERS:       'tblcjO5zznG3dgJF9',
  DISCOUNTS:    'tblvhQyCSgEZBt9bD',
  REFUNDS:      'tbly6X7DHLpusrKbv',
  PAYOUTS:      'tblZOo7OKstVH0QAG',
  SOFTWARE:     'tbll0759mAnWDeBRj',
};

/* ── ME TABLE IDs (appdN9dWxVcB2KFZ6) ───────────────────── */
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
};

/* ── FIELD NORMALISER ────────────────────────────────────── */
function val(v) {
  if (!v) return '';
  if (typeof v === 'object' && v.name) return v.name;
  return v;
}

function normaliseRecord(r) {
  const raw = r.fields;
  const clean = {};
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    clean[k] = Array.isArray(v)
      ? v.map(item => (item && typeof item === 'object' && item.name ? item.name : item))
      : val(v);
  }
  return { id: r.id, ...clean };
}

/* ── BASE FACTORIES ──────────────────────────────────────── */
function getBase() {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    throw new Error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID env vars');
  }
  return new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(process.env.AIRTABLE_BASE_ID);
}

function getRegionBase(baseEnvVar) {
  const baseId = process.env[baseEnvVar];
  if (!process.env.AIRTABLE_API_KEY || !baseId) {
    throw new Error(`Missing AIRTABLE_API_KEY or ${baseEnvVar} env vars`);
  }
  return new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(baseId);
}

/* ── GENERIC FETCH ───────────────────────────────────────── */
async function fetchAll(tableId, sortField, base) {
  const b = base || getBase();
  const records = [];
  const opts = sortField ? { sort: [{ field: sortField, direction: 'asc' }] } : {};

  await new Promise((resolve, reject) => {
    b(tableId)
      .select(opts)
      .eachPage(
        (page, next) => { page.forEach(r => records.push(normaliseRecord(r))); next(); },
        err => (err ? reject(err) : resolve())
      );
  });
  return records;
}

async function fetchFromRegion(baseEnvVar, tableId, sortField) {
  return fetchAll(tableId, sortField, getRegionBase(baseEnvVar));
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
export async function getUKReconcile()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.RECONCILE); }
export async function getUKB2B()           { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.B2B, 'Business Name'); }
export async function getUKCS()            { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.CS); }
export async function getUKCustomers()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.CUSTOMERS, 'Customer Name'); }
export async function getUKAffiliates()    { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.AFFILIATES, 'Name'); }
export async function getUKMarketing()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.MARKETING); }
export async function getUKSubscriptions() { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.SUBSCRIPTIONS, 'Plan Name'); }
export async function getUKAmazonCat()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.AMAZON_CAT); }
export async function getUKEmailList()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.EMAIL_LIST, 'Email'); }
export async function getUKOrders()        { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.ORDERS); }
export async function getUKDiscounts()     { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.DISCOUNTS, 'Voucher Code'); }
export async function getUKRefunds()       { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.REFUNDS); }
export async function getUKPayouts()       { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.PAYOUTS); }
export async function getUKSoftware()      { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.SOFTWARE, 'Platform'); }
export async function getUKInbound()       { return fetchFromRegion('AIRTABLE_UK_BASE_ID', UK_TABLES.INBOUND, 'SKU'); }

/* ── PARTNER BRANDS TABLE IDs (app6jWt9MuLq42Y5s) ───────── */
const PB_TABLES = {
  BRANDS: 'tbluJOsWSfqK4rQO9',
};

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
