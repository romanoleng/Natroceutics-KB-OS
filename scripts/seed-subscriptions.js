#!/usr/bin/env node
/**
 * Seed the Shopify UK subscription tables from the 1 August 2026 live pull.
 *
 * Subscriptions run on Recharge, but NONE of this needed the Recharge API:
 * Recharge writes its state onto the Shopify objects themselves, so the whole
 * picture rebuilds from order tags and customer tags.
 *
 *   customer tag "Active Subscriber"           currently subscribed
 *   customer tag "Inactive Subscriber"         churned
 *   customer tag "Subscription card declined"  payment failed, revenue at risk
 *   order tag   "Subscription First Order"     acquisition
 *   order tag   "Subscription Recurring Order" retention
 *   lineItem.sellingPlan.name                  cadence and discount
 *
 * TWO HONESTY RULES, same as the finance engine:
 *
 * 1. "Active Subscriber" is a tag, not a fact. Several customers carry it while
 *    their last order was months ago — the tag is set at signup and is not
 *    always cleared on churn. We therefore report BOTH the tag count and a
 *    "billing recently" count (an order within 45 days), and the tab leads with
 *    the second. Reporting the tag alone would overstate the base.
 *
 * 2. Recurring revenue per month is NOT derived here. It needs every
 *    subscription order since inception (~500), which is a job for
 *    scripts/shopify-pull.js once SHOPIFY_ADMIN_TOKEN is rotated. It reads
 *    PENDING rather than being estimated from average order value.
 *
 *   node --env-file-if-exists=.env.local scripts/seed-subscriptions.js
 */
const { getPrisma, isConfigured } = require('../lib/prisma');
const { commitTable } = require('../lib/mirror-write');
const { BASES, resolveBaseId } = require('../lib/airtable-tables');

const PULLED_AT = '2026-08-01';
const UK = BASES.UK;
const UK_BASE_ID = resolveBaseId(UK.envVar);

/* Roster: every customer tagged Active Subscriber or Subscription card
 * declined, read live 1 Aug 2026. [shortId, name, orders, spent, createdAt,
 * lastOrderAt, active, declined, inactive] */
const ROSTER = [
  ['9303684743506','Nikki Scott',2,75.98,'2025-08-31','2025-09-30',1,0,0],
  ['9303717609810','Gavin Bliss',10,281.60,'2025-08-31','2026-07-26',1,0,0],
  ['9399027335506','Amy Baker-Hudghton',2,79.52,'2025-09-22','2026-06-19',1,0,0],
  ['9409697284434','Tor Cameron',1,41.09,'2025-09-26','2025-09-26',1,0,0],
  ['9413037785426','Mark Spickett',6,307.09,'2025-09-28','2026-06-24',1,0,0],
  ['9432251433298','James Chima Ezuruike',1,76.50,'2025-10-05','2025-10-05',0,1,0],
  ['9442663432530','Mihaela Durla',1,27.05,'2025-10-09','2025-10-09',0,1,0],
  ['9450453827922','Katrina McVeigh',2,57.88,'2025-10-13','2025-11-10',0,1,0],
  ['9510420939090','Rachel Hickey',3,88.17,'2025-10-26','2026-01-28',0,1,1],
  ['9510777618770','Mr BC Slade',8,209.65,'2025-10-26','2026-05-26',1,0,0],
  ['9539899752786','Nicola Elliott',1,59.09,'2025-11-04','2025-11-04',0,1,1],
  ['9556243153234','Paula Gavrilovic',3,227.87,'2025-11-09','2026-06-09',1,0,0],
  ['9570276180306','Amelia Smith',7,418.17,'2025-11-11','2026-07-31',1,0,0],
  ['9601832583506','Naomi Jones',4,170.87,'2025-11-18','2026-07-28',1,0,0],
  ['9601934983506','Sadie Mantovani',4,356.24,'2025-11-18','2026-06-02',1,0,0],
  ['9631813337426','Wendy Peaker',6,456.16,'2025-11-24','2026-06-02',1,0,0],
  ['9752479990098','Faris Alibhai',2,878.40,'2025-12-22','2026-01-27',1,0,0],
  ['9757015540050','Fiona McNally',2,178.20,'2025-12-23','2026-02-18',1,0,0],
  ['9769945792850','Alan Reid',13,835.55,'2025-12-28','2026-07-24',1,0,0],
  ['9785299009874','Morag Prail',2,115.30,'2026-01-03','2026-08-01',1,0,0],
  ['9838394048850','Tracy Sutherland',5,162.16,'2026-01-17','2026-07-18',1,0,0],
  ['9885334503762','Martin Hudec',12,1240.95,'2026-01-25','2026-07-30',1,0,0],
  ['10050797338962','Elizabeth Sharp',6,404.25,'2026-02-19','2026-07-11',1,0,0],
  ['10102437937490','Lorna Hughes',3,87.45,'2026-03-04','2026-06-04',1,0,0],
  ['10124479037778','Larissa Pridham',4,98.60,'2026-03-10','2026-06-10',1,0,0],
  ['10160290988370','Sharon Latta',4,254.90,'2026-03-19','2026-07-12',1,0,0],
  ['10225256694098','Lucy Atkinson',5,145.75,'2026-03-30','2026-08-01',1,0,0],
  ['10235414020434','Fiona Burdge',4,335.25,'2026-03-31','2026-07-20',1,0,0],
  ['10239032394066','Roger Selman',1,42.65,'2026-04-02','2026-04-02',1,0,0],
  ['10262274965842','Shontelle Bryan',4,119.17,'2026-04-09','2026-07-28',1,0,0],
  ['10343425048914','Peter Thurman',2,174.60,'2026-04-26','2026-06-25',1,0,0],
  ['10344933392722','Joana Teles',2,52.00,'2026-04-26','2026-05-26',1,1,0],
  ['10382115799378','Adam Hankinson',4,176.00,'2026-05-01','2026-08-01',1,0,0],
  ['10387801866578','Donna Sanderson',1,63.80,'2026-05-04','2026-05-04',1,0,0],
  ['10448261349714','Douglas Howie',3,150.90,'2026-05-14','2026-07-14',1,0,0],
  ['10524878602578','Marianna Nechypor',2,51.10,'2026-05-19','2026-06-19',1,0,0],
  ['10543412052306','Lisa Donaldson',3,115.45,'2026-05-22','2026-07-22',1,0,0],
  ['10642000970066','Silvia Ruiz Navarro',1,29.15,'2026-06-03','2026-06-03',1,0,0],
  ['10664296874322','Elaine Horton',2,53.80,'2026-06-08','2026-07-08',1,0,0],
  ['10670094025042','Lindsay Wake',1,138.45,'2026-06-09','2026-06-09',1,0,0],
  ['10693078974802','Elizabeth Parr',2,113.20,'2026-06-12','2026-07-12',1,0,0],
  ['10698062463314','Jaime Parlade',2,52.00,'2026-06-13','2026-07-13',1,0,0],
  ['10702765359442','Jenna Grose',1,24.65,'2026-06-14','2026-06-14',1,0,0],
  ['10711884005714','Emily Conchie',1,24.65,'2026-06-16','2026-06-16',1,0,0],
  ['10753681785170','Gillian Mccollum',1,73.70,'2026-06-23','2026-06-23',1,0,0],
  ['10807072948562','Kate Morland',1,39.50,'2026-07-03','2026-07-03',1,0,0],
  ['10815039930706','Joyce Tyson',1,60.65,'2026-07-06','2026-07-06',1,0,0],
  ['10815308431698','G Maclennan',1,29.15,'2026-07-06','2026-07-06',1,0,0],
  ['10852865802578','Chantal Chegrinec',1,58.90,'2026-07-11','2026-07-11',1,0,0],
  ['10891211178322','Adrian Starling',1,22.36,'2026-07-15','2026-07-15',1,0,0],
  ['10904374772050','Oksana Rovenko',1,76.95,'2026-07-16','2026-07-16',1,0,0],
  ['10935632986450','Gillian Burford',1,32.30,'2026-07-20','2026-07-21',1,0,0],
  ['10947534389586','Helena Esteves',2,533.08,'2026-07-23','2026-07-31',1,0,0],
  ['10965778006354','Sam Sammy',2,71.93,'2026-07-26','2026-07-27',1,0,0],
  ['10971947827538','Joanna Thompson',1,26.90,'2026-07-28','2026-07-28',1,0,0],
];

/** SKUs seen on subscription line items in the inception-to-date sample. */
const PLAN = '1 month subscription with 10% discount';
const SUB_SKUS = [
  ['UK-SAFFRON','Saffron Bioactive'], ['UK-BCOM','Activated B-Complex Advanced'],
  ['UK-BERGA','Bergamot-HT Complex'], ['UK-SULFO','Sulforaphane NRF2 Complex'],
  ['UK-GLUTSOD','Glutathione SOD Advanced'], ['UK-ASHWA','Ashwagandha Bioactive'],
  ['UK-COQ10+PQQ','CoQ10 + PQQ Advanced'], ['60s: UK-CURCOM','Curcumin Complete'],
  ['UK-QUERCBIO','Quercetin Bioactive'], ['UK-CREAT','Creatine Bioactive'],
  ['UK-OMEGAK2','Omega 3 Fortified'], ['UK-MAGCO','Magnesium Glycinate Complex'],
  ['UK-OPTIV','OPTI-VITA Complex'], ['UK-LIPOC-1','Vitamin C Complete'],
  ['UK-CURFOR','Curcumin Fortified'], ['UK-COQ10','Coenzyme Q10 Advanced'],
  ['UK-OMEGA','Omega 3 Pure & Wild'], ['UK-BERCOM','Berberine Complex'],
];

const r2 = n => Math.round(n * 100) / 100;
const TODAY = new Date(`${PULLED_AT}T00:00:00Z`);
const daysSince = iso => Math.round((TODAY - new Date(`${iso}T00:00:00Z`)) / 86400000);

/** Billing recently = an order inside 45 days. One monthly cycle plus slack. */
const BILLING_WINDOW = 45;

function buildCustomers() {
  return ROSTER.map(([id, name, orders, spent, created, last, active, declined, inactive]) => {
    const age = daysSince(last);
    const billing = active && age <= BILLING_WINDOW;
    const state = declined ? 'CARD DECLINED'
      : inactive ? 'Churned'
      : billing ? 'Active'
      : active ? 'Tagged active, not billing'
      : 'Unknown';
    return {
      recordId: `sub:${id}`,
      fields: {
        Customer: name,
        Status: state,
        'Orders': orders,
        'Lifetime Value (£)': r2(spent),
        'Avg Order (£)': orders ? r2(spent / orders) : '',
        'Subscribed Since': created,
        'Last Order': last,
        'Days Since Last Order': age,
        'Card Declined': declined ? 'Yes' : '',
        Plan: PLAN,
        Source: 'Shopify customer tags (Recharge)',
        'Last Updated': PULLED_AT,
      },
    };
  });
}

/** Signups and churn by month, from the roster's own dates. */
function buildMonthly() {
  const months = new Map();
  const touch = m => {
    if (!months.has(m)) months.set(m, { signups: 0, active: 0, declined: 0, ltv: 0 });
    return months.get(m);
  };
  for (const [, , orders, spent, created, last, active, declined] of ROSTER) {
    const m = touch(created.slice(0, 7));
    m.signups++;
    m.ltv += spent;
    if (active) m.active++;
    if (declined) m.declined++;
  }
  return [...months.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({
      recordId: month,
      fields: {
        Month: month,
        'New Subscribers': v.signups,
        'Still Active': v.active,
        'Card Declined': v.declined,
        'Cohort Lifetime Value (£)': r2(v.ltv),
        'Avg LTV (£)': v.signups ? r2(v.ltv / v.signups) : '',
        'Recurring Revenue (£)': '',   // needs the full order pull — never estimated
        Basis: 'Signups by the month the customer first subscribed. Recurring revenue PENDING: needs every subscription order since inception via shopify-pull.js.',
      },
    }));
}

const buildProducts = () => SUB_SKUS.map(([sku, name], i) => ({
  recordId: `subsku:${sku}`.slice(0, 32),
  fields: {
    SKU: sku, Product: name, Plan: PLAN, Discount: '10%',
    Source: 'Shopify sellingPlan on subscription orders',
    'Last Updated': PULLED_AT,
  },
}));

async function main() {
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }
  const prisma = getPrisma();

  const customers = buildCustomers();
  const monthly = buildMonthly();
  const products = buildProducts();

  const active = customers.filter(c => c.fields.Status === 'Active').length;
  const stale = customers.filter(c => c.fields.Status === 'Tagged active, not billing').length;
  const declined = customers.filter(c => c.fields['Card Declined'] === 'Yes').length;
  const ltv = customers.reduce((s, c) => s + (c.fields['Lifetime Value (£)'] || 0), 0);

  console.log(`roster: ${customers.length} subscriber records`);
  console.log(`  billing within ${BILLING_WINDOW} days: ${active}`);
  console.log(`  tagged active but NOT billing:      ${stale}   <- tag overstates the base`);
  console.log(`  card declined:                      ${declined}`);
  console.log(`  combined lifetime value:            £${r2(ltv).toLocaleString('en-GB')}`);

  for (const [tableKey, records] of [
    ['SUBS_CUSTOMERS', customers], ['SUBS_MONTHLY', monthly], ['SUBS_PRODUCTS', products],
  ]) {
    const { written } = await commitTable(prisma, {
      baseKey: 'UK', tableKey,
      baseId: UK_BASE_ID, tableId: UK.tables[tableKey],
      records, replace: true, source: 'shopify-subs',
    });
    console.log(`\nUK.${tableKey.padEnd(16)} ${written} rows`);
  }

  await prisma.$disconnect();
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.error(e); process.exit(1); });
