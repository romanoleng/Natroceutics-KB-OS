/**
 * Sellerboard export parsing — shared by scripts/import-sellerboard.js (CLI)
 * and pages/api/import-file.js (the /upload page).
 *
 * Pure functions: text in, mirror-ready records out. No fs, no database.
 *
 * Output field names deliberately mirror what the natroceutics-email-capture
 * skill writes to Airtable, so rows from these builders are interchangeable
 * with rows that arrived via the Airtable sync.
 */
const { parseDelimited, toObjects, coerce } = require('../scripts/lib/csv');
const { UK_TABLES } = require('./airtable-tables');

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

/* ── fee / ad columns (site export carries components, not totals) ── */
const FEE_COLUMNS = [
  'Commission', 'DigitalServicesFee', 'DigitalServicesFeeFBA',
  'FBAInboundTransportationFee', 'FBAInboundTransportationProgramFee',
  'FBAPerUnitFulfillmentFee', 'FBAStorageFee', 'Subscription', 'VineFee',
];
const AD_COLUMNS = ['SponsoredProducts', 'SponsoredDisplay', 'SponsoredBrands', 'SponsoredBrandsVideo'];

/* ── record builders ─────────────────────────────────────── */
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

function buildOrders(rows, asinNames = new Map()) {
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

/**
 * Sellerboard's stock history is AMAZON FBA stock, so it belongs in the
 * Amazon UK table — NOT in Stock on Hand, which is the warehouse's stock-take
 * (fed by the Bio-nature email / the stock-take PDF). Conflating the two put
 * FBA quantities where warehouse SOH should be; kept separate now.
 */
function buildFbaStock(rows, reportDate) {
  const out = [];
  for (const r of rows) {
    const asin = String(r.ASIN || '').trim();
    if (!asin) continue;
    const qty = Math.round(num(r['FBA/FBM Stock']));
    out.push({
      recordId: asin,
      fields: {
        'Product': String(r.Name || ''),
        'ASIN': asin,
        'Amazon SKU': String(r.SKU || ''),
        'FBA Stock': qty,
        'Reserved': Math.round(num(r.Reserved)),
        'Sent to FBA': Math.round(num(r['Sent to FBA'])),
        'Last Synced': `${reportDate}T00:00:00.000Z`,
      },
    });
  }
  return out;
}

/** RSP competitor sheet (tab-separated paste from the Amazon team's Excel). */
function buildRsp(rows, asOfDate) {
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const asin = String(r.ASIN || '').trim();
    if (!/^B0[A-Z0-9]{8}$/.test(asin)) continue;
    // The sheet's "Pricing Action List" block repeats ASINs with fewer
    // columns — the first (full) row per ASIN wins.
    if (seen.has(asin)) continue;
    seen.add(asin);

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
    fields['Last Updated'] = asOfDate;
    fields['Confirmation Status'] = 'Confirmed';
    out.push({ recordId: asin, fields });
  }
  return out;
}

/* ── file type detection by header signature, never filename ── */
const SELLERBOARD_TYPES = [
  {
    key: 'byDay',
    replace: false,
    label: 'Sellerboard: Dashboard by day → Amazon UK Daily P&L',
    tableKey: 'AMAZON_DAILY_PNL',
    tableId: UK_TABLES.AMAZON_DAILY_PNL,
    signature: h => h.includes('Date') && h.includes('SalesOrganic') && h.includes('NetProfit') && !h.includes('ASIN') && !h.includes('DateFrom'),
    build: rows => buildDailyPnl(rows),
  },
  {
    key: 'byProduct',
    replace: false,
    label: 'Sellerboard: Dashboard by product → Amazon UK ASIN Daily',
    tableKey: 'AMAZON_ASIN_DAILY',
    tableId: UK_TABLES.AMAZON_ASIN_DAILY,
    signature: h => h.includes('Date') && h.includes('ASIN') && h.includes('SalesOrganic') && h.includes('ROI'),
    build: rows => buildAsinDaily(rows),
  },
  {
    key: 'orders',
    replace: false,
    label: 'Sellerboard: Orders → Amazon UK Orders',
    tableKey: 'AMAZON_ORDERS',
    tableId: UK_TABLES.AMAZON_ORDERS,
    signature: h => h.includes('AmazonOrderId') && h.includes('OrderTotalAmount'),
    build: (rows, ctx) => buildOrders(rows, ctx.asinNames),
  },
  {
    key: 'stock',
    replace: true,
    label: 'Sellerboard: Stock history → Amazon UK (FBA stock)',
    tableKey: 'AMAZON',
    tableId: UK_TABLES.AMAZON,
    signature: h => h.includes('FNSKU') && h.some(c => c.startsWith('FBA/FBM')),
    build: (rows, ctx) => buildFbaStock(rows, ctx.today),
  },
  {
    key: 'rsp',
    replace: true,
    label: 'RSP competitor sheet → RSP Tracker',
    tableKey: 'RSP_TRACKER',
    tableId: UK_TABLES.RSP_TRACKER,
    signature: h => h.includes('ASIN') && h.includes('Seller 1 (Buy Box)') && h.includes('RRP'),
    build: (rows, ctx) => buildRsp(rows, ctx.today),
  },
];

/**
 * Parse one uploaded/read file. Tries semicolon (sellerboard), tab (Excel
 * paste) and comma in turn; picks the delimiter that yields the most columns.
 *
 * @returns {{type, records, rowCount}|null} null when nothing recognises it.
 */
function parseSellerboardFile(text, ctx = {}) {
  let best = null;
  for (const delim of [';', '\t', ',']) {
    const rows = parseDelimited(text, delim);
    const cols = (rows[0] || []).length;
    if (!best || cols > best.cols) best = { rows, cols };
  }
  const headers = (best.rows[0] || []).map(h => h.trim());
  const type = SELLERBOARD_TYPES.find(t => t.signature(headers));
  if (!type) return null;

  const objects = toObjects(best.rows);
  const context = { today: new Date().toISOString().slice(0, 10), asinNames: new Map(), ...ctx };
  return { type, records: type.build(objects, context), rowCount: objects.length };
}

module.exports = {
  SELLERBOARD_TYPES,
  parseSellerboardFile,
  buildDailyPnl,
  buildAsinDaily,
  buildOrders,
  buildFbaStock,
  buildRsp,
  toISODate,
};
