#!/usr/bin/env node
/**
 * Sellerboard exports → Postgres mirror (Amazon UK data).
 *
 * Loads the dashboards' Amazon UK tables directly from sellerboard's own
 * export files, bypassing Airtable entirely — built while the Airtable API is
 * quota-blocked, but useful any time fresher Amazon data is wanted than the
 * email-capture cycle provides.
 *
 * The field names and formulas written here deliberately mirror what the
 * natroceutics-email-capture skill writes to Airtable (its SELLERBOARD_TOTALS /
 * ASIN-daily rules), so rows from this importer are interchangeable with rows
 * that arrived via Airtable sync.
 *
 * Usage
 *   node --env-file-if-exists=.env.local scripts/import-sellerboard.js --dir="/path/to/AMAZON-UK"
 *   ... --dry-run          parse and report, write nothing
 *   ... --rsp=<file.tsv>   also load an RSP competitor sheet (tab-separated)
 *
 * File detection is by HEADER SIGNATURE, never filename, so sellerboard's
 * timestamped names work untouched. The source directory is read-only.
 *
 * recordIds are natural keys (sb:<date>, sb:<date>_<ASIN>, order id, SKU,
 * ASIN), so re-running with a newer export upserts in place. When the real
 * Airtable sync later covers the same tables, its deleteStale pass replaces
 * these rows with authoritative ones.
 */
const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');
const { getPrisma, isConfigured } = require('../lib/prisma');
const { UK_TABLES, BASES } = require('../lib/airtable-tables');
const { parseDelimited, toObjects, coerce } = require('./lib/csv');

const UK_BASE_ID = BASES.UK.defaultBaseId;
const UPSERT_BATCH = 400;

/* ── helpers ─────────────────────────────────────────────── */
const num = v => (typeof v === 'number' ? v : Number(String(v).replace(/,/g, '')) || 0);
const absN = v => Math.abs(num(v));
const round2 = v => Math.round(v * 100) / 100;

/** "6/05/2026" or "6/05/2026 9:26:04 PM" (D/MM/YYYY) → "2026-05-06" */
function toISODate(v) {
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/* ── file type detection by header signature ─────────────── */
const TYPES = [
  {
    key: 'byDay',
    label: 'Dashboard by day → Amazon UK Daily P&L',
    tableId: UK_TABLES.AMAZON_DAILY_PNL,
    signature: h => h.includes('Date') && h.includes('SalesOrganic') && h.includes('NetProfit') && !h.includes('ASIN') && !h.includes('DateFrom'),
  },
  {
    key: 'byProduct',
    label: 'Dashboard by product → Amazon UK ASIN Daily',
    tableId: UK_TABLES.AMAZON_ASIN_DAILY,
    signature: h => h.includes('Date') && h.includes('ASIN') && h.includes('SalesOrganic') && h.includes('ROI'),
  },
  {
    key: 'orders',
    label: 'Orders → Amazon UK Orders',
    tableId: UK_TABLES.AMAZON_ORDERS,
    signature: h => h.includes('AmazonOrderId') && h.includes('OrderTotalAmount'),
  },
  {
    key: 'stock',
    label: 'Stock history → Stock on Hand',
    tableId: UK_TABLES.STOCK,
    signature: h => h.includes('FNSKU') && h.some(c => c.startsWith('FBA/FBM')),
  },
];

function detectType(headers) {
  return TYPES.find(t => t.signature(headers)) || null;
}

/* ── per-type record builders ────────────────────────────────
 * Output field names must match what pages/uk.js and /api/amazon-sales read —
 * they are the Airtable field names the email-capture skill writes.
 * ──────────────────────────────────────────────────────────── */

// Sum of the per-order/period Amazon fee columns. The emailed dashboard CSV
// has a single AmazonFees total; the site export carries the components.
const FEE_COLUMNS = [
  'Commission', 'DigitalServicesFee', 'DigitalServicesFeeFBA',
  'FBAInboundTransportationFee', 'FBAInboundTransportationProgramFee',
  'FBAPerUnitFulfillmentFee', 'FBAStorageFee', 'Subscription', 'VineFee',
];
const AD_COLUMNS = ['SponsoredProducts', 'SponsoredDisplay', 'SponsoredBrands', 'SponsoredBrandsVideo'];

function buildDailyPnl(rows) {
  const out = [];
  for (const r of rows) {
    const date = toISODate(r.Date);
    if (!date) continue;
    const organic = num(r.SalesOrganic);
    const ppc = num(r.SalesPPC);
    out.push({
      recordId: `sb:${date}`,
      fields: {
        'Date': date,
        'Revenue £': round2(organic + ppc),
        'Organic Revenue £': round2(organic),
        'PPC Revenue £': round2(ppc),
        'Orders': Math.round(num(r.Orders)),
        'Refunds': Math.round(num(r.Refunds)),
        'Amazon Fees £': round2(FEE_COLUMNS.reduce((s, c) => s + absN(r[c]), 0)),
        'Ad Spend £': round2(AD_COLUMNS.reduce((s, c) => s + absN(r[c]), 0)),
        'COGS £': round2(absN(r['ProductCost Sales'])),
        'Gross Profit £': round2(num(r.GrossProfit)),
        'Net Profit £': round2(num(r.NetProfit)),
        'Margin %': round2(num(r.Margin)),
        'Sessions': Math.round(num(r.Sessions)),
      },
    });
  }
  return out;
}

function buildAsinDaily(rows) {
  const out = [];
  for (const r of rows) {
    const date = toISODate(r.Date);
    const asin = String(r.ASIN || '').trim();
    if (!date || !asin) continue;
    out.push({
      recordId: `sb:${date}_${asin}`,
      fields: {
        'Record Key': `${date}_${asin}`,
        'Date': date,
        'ASIN': asin,
        'SKU': String(r.SKU || ''),
        'Product Name': String(r.Name || ''),
        'Revenue £': round2(num(r.SalesOrganic) + num(r.SalesPPC)),
        'PPC Revenue £': round2(num(r.SalesPPC)),
        'Units': Math.round(num(r.UnitsOrganic) + num(r.UnitsPPC)),
        'Net Profit £': round2(num(r.NetProfit)),
        'Margin %': round2(num(r.Margin)),
        'Sessions': Math.round(num(r.Sessions)),
        'ROI %': round2(num(r.ROI)),
        'Ad Spend £': round2(absN(r['Ads spend'])),
      },
    });
  }
  return out;
}

function buildOrders(rows, asinNames) {
  // One export row per order LINE — a multi-item order repeats its
  // AmazonOrderId with per-line amounts. Aggregate to one record per order so
  // the page's "Total on Record" counts orders, not lines, and revenue is the
  // order total.
  const byId = new Map();
  for (const r of rows) {
    const id = String(r.AmazonOrderId || '').trim();
    if (!id) continue;
    const date = toISODate(r['PurchaseDate(UTC)']);
    const asin = String(r.Products || '').trim();

    let o = byId.get(id);
    if (!o) {
      o = {
        date,
        asins: [],
        qty: 0,
        revenue: 0,
        status: String(r.OrderStatus || ''),
        channel: String(r.SalesChannel || ''),
        fulfilment: String(r.FulfillmentChannel || ''),
      };
      byId.set(id, o);
    }
    if (asin && !o.asins.includes(asin)) o.asins.push(asin);
    o.qty += num(r.NumberOfItems);
    o.revenue += num(r.OrderTotalAmount);
  }

  return [...byId.entries()].map(([id, o]) => ({
    recordId: id,
    fields: {
      'Order ID': id,
      'Order Date': o.date,
      // Sellerboard's order export has no ship date; the purchase date keeps
      // the page's date filter and sort working.
      'Shipped Date': o.date,
      'ASIN': o.asins.join(', '),
      'Product Name': o.asins.map(a => asinNames.get(a) || a).join(' | '),
      'Quantity': Math.round(o.qty),
      'Revenue (£)': round2(o.revenue),
      'Status': o.status,
      'Sales Channel': o.channel,
      'Fulfilment': o.fulfilment,
    },
  }));
}

function buildStock(rows, reportDate) {
  const out = [];
  for (const r of rows) {
    const sku = String(r.SKU || '').trim();
    if (!sku) continue;
    const qty = Math.round(num(r['FBA/FBM Stock']));
    out.push({
      recordId: sku,
      fields: {
        'SKU': sku,
        'Product': String(r.Name || ''),
        'ASIN': String(r.ASIN || ''),
        'Total QTY': qty,
        'Reserved': Math.round(num(r.Reserved)),
        'Sent to FBA': Math.round(num(r['Sent to FBA'])),
        'Status': qty > 0 ? 'In Stock' : 'Out of Stock',
        'Last Updated': reportDate,
        'Notes': 'Imported from sellerboard stock history export',
      },
    });
  }
  return out;
}

/* ── RSP competitor sheet (tab-separated paste from Excel) ── */
function buildRsp(tsvPath) {
  const rows = toObjects(parseDelimited(fs.readFileSync(tsvPath, 'utf8'), '\t'));
  const out = [];
  for (const r of rows) {
    const asin = String(r.ASIN || '').trim();
    if (!/^B0[A-Z0-9]{8}$/.test(asin)) continue;

    // Natroceutics' own listed price = the price of whichever seller slot is us.
    let scPrice = '';
    let scStatus = 'Inactive';
    for (let i = 1; i <= 8; i++) {
      const seller = String(r[i === 1 ? 'Seller 1 (Buy Box)' : `Seller ${i}`] || '');
      if (/natroceutics/i.test(seller)) {
        scStatus = 'Active';
        scPrice = coerce(String(r[`Price ${i}`] ?? ''));
        break;
      }
    }

    const fields = { ...r };
    fields['SC Status'] = scStatus;
    fields['SC Listed Price £'] = scPrice;
    fields['Last Updated'] = '2026-07-27';
    fields['Confirmation Status'] = 'Confirmed';
    out.push({ recordId: asin, fields });
  }
  return out;
}

/* ── mirror write (same pattern as import-csv.js) ────────── */
async function upsert(prisma, tableId, records, syncToken) {
  for (let i = 0; i < records.length; i += UPSERT_BATCH) {
    const batch = records.slice(i, i + UPSERT_BATCH);
    const values = batch.map((r, j) => Prisma.sql`(
      ${UK_BASE_ID}, ${tableId}, ${r.recordId},
      ${JSON.stringify(r.fields)}::json,
      ${null}::text, ${i + j}::int, ${syncToken}, (now() at time zone 'utc')
    )`);
    await prisma.$executeRaw`
      INSERT INTO "AirtableRecord"
        ("baseId","tableId","recordId","fields","createdTime","position","syncToken","syncedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("baseId","tableId","recordId") DO UPDATE SET
        "fields"    = EXCLUDED."fields",
        "position"  = EXCLUDED."position",
        "syncToken" = EXCLUDED."syncToken",
        "syncedAt"  = EXCLUDED."syncedAt"
    `;
  }
}

async function commitTable(prisma, tableKey, tableId, records, { replace }) {
  const syncToken = `sb-${Date.now()}-${tableKey}`;
  await upsert(prisma, tableId, records, syncToken);
  let deleted = 0;
  if (replace) {
    ({ count: deleted } = await prisma.airtableRecord.deleteMany({
      where: { baseId: UK_BASE_ID, tableId, syncToken: { not: syncToken } },
    }));
  }
  await prisma.syncRun.create({
    data: {
      baseKey: 'UK', tableKey, baseId: UK_BASE_ID, tableId,
      status: 'ok', recordCount: records.length, deleted,
      startedAt: new Date(), finishedAt: new Date(),
    },
  });
  return deleted;
}

function pad(s, n) { return String(s).padEnd(n); }

/* ── main ────────────────────────────────────────────────── */
async function main() {
  const args = { dir: null, dryRun: false, rsp: null };
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--dir=')) args.dir = a.slice(6);
    else if (a.startsWith('--rsp=')) args.rsp = a.slice(6);
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); return 0; }
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!args.dir && !args.rsp) { console.error('Pass --dir=<folder of sellerboard exports> and/or --rsp=<file.tsv>'); return 1; }
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }

  const prisma = getPrisma();
  const results = [];

  /* Pass 1: read + classify every CSV in the folder (read-only). */
  const parsed = { byDay: [], byProduct: [], orders: [], stock: [] };
  if (args.dir) {
    const files = fs.readdirSync(args.dir).filter(f => f.toLowerCase().endsWith('.csv'));
    console.log(`\nScanning ${files.length} CSV file(s) in ${args.dir}\n`);
    for (const file of files.sort()) {
      const rows = parseDelimited(fs.readFileSync(path.join(args.dir, file), 'utf8'), ';');
      const headers = (rows[0] || []).map(h => h.trim());
      const type = detectType(headers);
      const shortName = file.length > 55 ? file.slice(0, 52) + '…' : file;
      if (!type) { console.log(`  skip  ${shortName}`); continue; }
      console.log(`  ${pad(type.key, 10)} ${shortName} (${rows.length - 1} lines)`);
      parsed[type.key].push({ file, objects: toObjects(rows) });
    }
  }

  /* Duplicate exports of the same report: keep the one with the most rows. */
  const pick = list => list.sort((a, b) => b.objects.length - a.objects.length)[0] || null;

  const byDay = pick(parsed.byDay);
  const byProduct = pick(parsed.byProduct);
  const orders = pick(parsed.orders);
  const stock = pick(parsed.stock);

  // ASIN → product name map for the orders build.
  const asinNames = new Map();
  if (byProduct) for (const r of byProduct.objects) {
    const a = String(r.ASIN || '').trim();
    if (a && r.Name && !asinNames.has(a)) asinNames.set(a, String(r.Name));
  }

  const jobs = [];
  if (byDay)     jobs.push({ tableKey: 'AMAZON_DAILY_PNL',  tableId: UK_TABLES.AMAZON_DAILY_PNL,  records: buildDailyPnl(byDay.objects),            replace: true });
  if (byProduct) jobs.push({ tableKey: 'AMAZON_ASIN_DAILY', tableId: UK_TABLES.AMAZON_ASIN_DAILY, records: buildAsinDaily(byProduct.objects),       replace: true });
  if (orders)    jobs.push({ tableKey: 'AMAZON_ORDERS',     tableId: UK_TABLES.AMAZON_ORDERS,     records: buildOrders(orders.objects, asinNames),  replace: true });
  if (stock)     jobs.push({ tableKey: 'STOCK',             tableId: UK_TABLES.STOCK,             records: buildStock(stock.objects, new Date().toISOString().slice(0, 10)), replace: true });
  if (args.rsp)  jobs.push({ tableKey: 'RSP_TRACKER',       tableId: UK_TABLES.RSP_TRACKER,       records: buildRsp(args.rsp),                      replace: true });

  console.log('');
  for (const job of jobs) {
    process.stdout.write(pad(`UK.${job.tableKey}`, 26));
    if (!job.records.length) { console.log('SKIP  0 usable rows'); continue; }
    if (args.dryRun) {
      const dates = job.records.map(r => r.fields.Date).filter(Boolean).sort();
      console.log(`ok    ${job.records.length} records${dates.length ? `  (${dates[0]} → ${dates[dates.length - 1]})` : ''}  (dry run)`);
      continue;
    }
    const deleted = await commitTable(prisma, job.tableKey, job.tableId, job.records, job);
    console.log(`ok    ${job.records.length} records${deleted ? `  (-${deleted} replaced)` : ''}`);
    results.push(job.tableKey);
  }

  console.log(`\n${results.length || (args.dryRun ? jobs.length : 0)} table(s) ${args.dryRun ? 'parsed' : 'written'}.\n`);
  return 0;
}

async function disconnect() {
  const p = globalThis.__natroPrisma;
  if (p) await p.$disconnect().catch(() => {});
}

main()
  .then(async code => { await disconnect(); process.exit(code); })
  .catch(async err => { console.error(err); await disconnect(); process.exit(1); });
