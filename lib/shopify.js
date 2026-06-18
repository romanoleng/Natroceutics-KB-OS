/**
 * Shopify Admin API — Live Order Feed
 *
 * Requires two environment variables:
 *   SHOPIFY_SHOP_URL   = your-store.myshopify.com
 *   SHOPIFY_ADMIN_TOKEN = shpat_xxxxxxxxxxxxxxxxxxxxxxx
 *
 * How to get the token:
 *   Shopify Admin → Settings → Apps and sales channels
 *   → Develop apps → Create an app → Configure Admin API scopes
 *   → Enable: read_orders, read_customers, read_products
 *   → Install app → copy the Admin API access token
 *
 * Returns null if env vars are missing (falls back to Airtable).
 */

const GQL_ORDERS = `
  query GetOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet        { shopMoney { amount } }
          subtotalPriceSet     { shopMoney { amount } }
          totalDiscountsSet    { shopMoney { amount } }
          totalRefundedSet     { shopMoney { amount } }
          discountCodes
          paymentGatewayNames
          customer { firstName lastName email }
          channelInformation   { channelDefinition { channelName } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function normaliseOrder(node) {
  const o = node;
  const cName = o.customer
    ? `${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim()
    : '';
  return {
    id: o.id,
    'Order Number':        o.name,
    'Order Date':          o.createdAt.slice(0, 10),
    'Customer Name':       cName || '—',
    'Financial Status':    o.displayFinancialStatus,
    'Fulfilment Status':   o.displayFulfillmentStatus,
    'Gross Total (£)':     Number(o.totalPriceSet?.shopMoney?.amount    || 0),
    'Net Total (£)':       Number(o.subtotalPriceSet?.shopMoney?.amount || 0),
    'Discount Amount (£)': Number(o.totalDiscountsSet?.shopMoney?.amount || 0),
    'Refund Amount (£)':   Number(o.totalRefundedSet?.shopMoney?.amount  || 0),
    'Discount Code':       (o.discountCodes || []).join(', '),
    Channel:               o.channelInformation?.channelDefinition?.channelName || 'Online Store',
    'Payment Method':      (o.paymentGatewayNames || []).join(', '),
  };
}

export async function getShopifyOrdersLive({ maxOrders = 500 } = {}) {
  const shop  = process.env.SHOPIFY_SHOP_URL;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;

  if (!shop || !token) return null; // signal to caller: use Airtable fallback

  const endpoint = `https://${shop}/admin/api/2024-01/graphql.json`;
  const headers  = {
    'Content-Type':           'application/json',
    'X-Shopify-Access-Token': token,
  };

  const orders = [];
  let cursor  = null;
  let hasMore = true;

  while (hasMore && orders.length < maxOrders) {
    const remaining = maxOrders - orders.length;
    const pageSize  = Math.min(remaining, 250);

    const res = await fetch(endpoint, {
      method:  'POST',
      headers,
      body: JSON.stringify({
        query:     GQL_ORDERS,
        variables: { first: pageSize, after: cursor },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));

    const { edges, pageInfo } = json.data.orders;
    for (const { node } of edges) orders.push(normaliseOrder(node));

    hasMore = pageInfo.hasNextPage;
    cursor  = pageInfo.endCursor;
  }

  return orders;
}

/* ── Google Drive CSV fetch ──────────────────────────── */
function parseShopifySalesCSV(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse a single CSV line respecting quoted commas
  const parseLine = line => {
    const vals = []; let cur = '', inQ = false;
    for (const c of line) {
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    vals.push(cur.trim());
    return vals;
  };

  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    const qty   = Number(obj['Net items sold']) || 0;
    const gross = Number(obj['Gross sales'])    || 0;
    return {
      product:    obj['Product title'] || '',
      qty,
      price:      qty > 0 ? +(gross / qty).toFixed(2) : 0,
      grossSales: gross,
      discounts:  Math.abs(Number(obj['Discounts']) || 0),
      returns:    Math.abs(Number(obj['Returns'])   || 0),
      netSales:   Number(obj['Net sales'])           || 0,
    };
  }).filter(r => r.product && r.grossSales > 0);
}

export async function getShopifySalesCSV(fileId) {
  if (!fileId) return null;
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Drive CSV fetch failed: ${res.status}`);
  const text = await res.text();
  if (text.includes('<!DOCTYPE')) throw new Error('Drive file not public — share it first');
  return parseShopifySalesCSV(text);
}

/* ── Google Drive CSV — Shopify Orders ──────────────── */
function parseShopifyOrdersCSV(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const parseLine = line => {
    const vals = []; let cur = '', inQ = false;
    for (const c of line) {
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    vals.push(cur.trim());
    return vals;
  };

  const headers = parseLine(lines[0]);
  const col = name => headers.findIndex(h => h.toLowerCase().trim() === name.toLowerCase());

  const iName       = col('name');
  const iCreated    = col('created at');
  const iBilling    = col('billing name');
  const iFinancial  = col('financial status');
  const iFulfill    = col('fulfillment status');
  const iTotal      = col('total');
  const iSubtotal   = col('subtotal');
  const iDisctAmt   = col('discount amount');
  const iDisctCode  = col('discount code');
  const iPayment    = col('payment method');

  const seen = new Set();
  const orders = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const vals = parseLine(line);
    const name = (vals[iName] || '').trim();
    if (!name || seen.has(name)) continue; // deduplicate — CSV has one row per line item
    seen.add(name);

    orders.push({
      id:                   name,
      'Order Number':       name,
      'Order Date':         (vals[iCreated] || '').slice(0, 10),
      'Customer Name':      vals[iBilling]   || '—',
      'Financial Status':   (vals[iFinancial] || '').toUpperCase(),
      'Fulfilment Status':  (vals[iFulfill]   || '').toUpperCase(),
      'Gross Total (£)':    Math.abs(Number(vals[iTotal])    || 0),
      'Net Total (£)':      Math.abs(Number(vals[iSubtotal]) || 0),
      'Discount Amount (£)':Math.abs(Number(vals[iDisctAmt]) || 0),
      'Refund Amount (£)':  0,
      'Discount Code':      vals[iDisctCode] || '',
      Channel:              'Online Store',
      'Payment Method':     vals[iPayment]   || '',
    });
  }

  return orders.sort((a, b) => b['Order Date'].localeCompare(a['Order Date']));
}

export async function getOrdersFromDriveCSV(fileId) {
  if (!fileId) return null;
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Drive orders CSV fetch failed: ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<!')) throw new Error('Drive file not public — share it first');
  return parseShopifyOrdersCSV(text);
}

/* ── Google Drive Folder — all CSVs merged ───────────── */
export async function getOrdersFromDriveFolder(folderId, apiKey) {
  if (!folderId || !apiKey) return null;

  // List all CSVs in the folder (most-recently-modified first)
  const q = encodeURIComponent(`'${folderId}' in parents and mimeType='text/csv' and trashed=false`);
  const fields = encodeURIComponent('files(id,name,modifiedTime)');
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&key=${apiKey}&fields=${fields}&orderBy=modifiedTime+desc`;

  const listRes = await fetch(listUrl);
  if (!listRes.ok) throw new Error(`Drive folder list failed: ${listRes.status}`);
  const { files = [] } = await listRes.json();
  if (files.length === 0) return null;

  // Download + parse each file; deduplicate by Order Number across all files
  const seen = new Set();
  const allOrders = [];

  for (const file of files) {
    try {
      const fileOrders = await getOrdersFromDriveCSV(file.id);
      if (!fileOrders) continue;
      for (const order of fileOrders) {
        const key = order['Order Number'];
        if (key && !seen.has(key)) {
          seen.add(key);
          allOrders.push(order);
        }
      }
    } catch (e) {
      console.warn(`Skipping Drive file ${file.name}:`, e.message);
    }
  }

  return allOrders.sort((a, b) => b['Order Date'].localeCompare(a['Order Date']));
}

/* ── Google Drive XLSX — Warehouse SOH ──────────────── */
export async function getWarehouseSOHFromDrive(fileId) {
  if (!fileId) return null;
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Drive XLSX fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();

  // Detect HTML response (file not public / login redirect)
  const peek = Buffer.from(buffer).slice(0, 15).toString('utf8');
  if (peek.trimStart().startsWith('<!')) throw new Error('Drive file not public — share it first');

  const xlsx = require('xlsx');
  const workbook = xlsx.read(Buffer.from(buffer), { type: 'buffer' });
  const ws = workbook.Sheets['SOH'];
  if (!ws) throw new Error('SOH sheet not found in workbook');

  // sheet_to_json with header:1 gives raw row arrays
  // Row 0: title, Row 1: blank, Row 2: headers, Row 3+: data
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

  return rows.slice(3)
    .filter(row => row && row[1] != null && String(row[1]).trim() !== '')
    .map(row => {
      const sku      = String(row[1] || '').trim();
      const product  = String(row[3] || '').trim();
      const totalQty = Number(row[4]) || 0;

      const batches = [
        { qty: Number(row[6]) || 0,  info: String(row[7]  || '').trim() },
        { qty: Number(row[8]) || 0,  info: String(row[9]  || '').trim() },
        { qty: Number(row[10]) || 0, info: String(row[11] || '').trim() },
      ].filter(b => b.qty > 0 || b.info);

      return {
        id:          sku,
        SKU:         sku,
        Product:     product,
        'Total QTY': totalQty,
        'Batch Info': batches.map(b => `${b.qty > 0 ? b.qty + ' × ' : ''}${b.info}`).filter(Boolean).join(' | '),
        batches,
        _source:     'drive',
      };
    });
}

/* ── ShopifyQL runner ────────────────────────────────── */
const GQL_SHOPIFYQL = `
  mutation RunShopifyQL($query: String!) {
    shopifyqlQuery(query: $query) {
      tableData {
        unformattedData {
          columns { name dataType }
          rowData
        }
      }
      parseErrors { code message }
    }
  }
`;

async function runShopifyQL(qlQuery) {
  const shop  = process.env.SHOPIFY_SHOP_URL;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!shop || !token) return null;

  const endpoint = `https://${shop}/admin/api/2024-01/graphql.json`;
  const headers  = { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token };

  const res = await fetch(endpoint, {
    method: 'POST', headers,
    body: JSON.stringify({ query: GQL_SHOPIFYQL, variables: { query: qlQuery } }),
  });
  if (!res.ok) throw new Error(`Shopify API ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));

  const result = json.data?.shopifyqlQuery;
  if (result?.parseErrors?.length) throw new Error(result.parseErrors.map(e => e.message).join('; '));

  const { columns, rowData } = result.tableData.unformattedData;
  return rowData.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col.name] = row[i]; });
    return obj;
  });
}

export async function getSalesByProduct({ days = 30 } = {}) {
  try {
    const since = `-${days}d`;
    const [salesRows, invRows] = await Promise.all([
      runShopifyQL(`FROM sales SHOW gross_sales, net_sales, orders, discounts, taxes GROUP BY product_id, product_title ORDER BY gross_sales DESC SINCE ${since} UNTIL today`),
      runShopifyQL(`FROM inventory SHOW inventory_units_sold GROUP BY product_id, product_title SINCE ${since} UNTIL today`),
    ]);
    if (!salesRows) return null;

    const qtyMap = {};
    if (invRows) for (const r of invRows) {
      if (r.product_id) qtyMap[r.product_id] = Number(r.inventory_units_sold) || 0;
    }

    return salesRows
      .filter(r => r.product_id && Number(r.gross_sales) > 0)
      .map(r => {
        const grossSales = Number(r.gross_sales) || 0;
        const qty        = qtyMap[r.product_id] || 0;
        return {
          productId:  r.product_id,
          product:    r.product_title,
          qty,
          orders:     Number(r.orders) || 0,
          price:      qty > 0 ? +(grossSales / qty).toFixed(2) : 0,
          grossSales,
          netSales:   Number(r.net_sales) || 0,
          discounts:  Math.abs(Number(r.discounts) || 0),
        };
      });
  } catch (e) {
    console.warn('getSalesByProduct failed:', e.message);
    return null;
  }
}

/* ── Local CSV helpers (data/ folder, parsed server-side) ────────── */

function readLocalCSV(filename) {
  const fs   = require('fs');
  const path = require('path');
  const file = path.join(process.cwd(), 'data', filename);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

// Shared quoted-CSV line parser
function parseCSVLine(line) {
  const vals = []; let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  vals.push(cur.trim());
  return vals;
}

/** Orders CSV  (one row per line-item → dedup by Name) */
export function getLocalOrders() {
  const text = readLocalCSV('shopify-orders.csv');
  if (!text) return null;
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return null;

  const headers = parseCSVLine(lines[0]);
  const col = name => headers.findIndex(h => h.toLowerCase().trim() === name.toLowerCase());

  const iName      = col('name');
  const iCreated   = col('created at');
  const iBilling   = col('billing name');
  const iFinancial = col('financial status');
  const iFulfill   = col('fulfillment status');
  const iTotal     = col('total');
  const iSubtotal  = col('subtotal');
  const iDiscAmt   = col('discount amount');
  const iDiscCode  = col('discount code');
  const iPayment   = col('payment method');
  const iRefund    = col('refunded amount');
  const iShipping  = col('shipping');
  const iSource    = col('source');
  const iTags      = col('tags');

  const seen = new Set();
  const orders = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const v = parseCSVLine(line);
    const name = (v[iName] || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const isSubscription = (v[iTags] || '').toLowerCase().includes('subscription');
    const source = (v[iSource] || '').toLowerCase();
    const channel = source === 'subscription_contract_checkout_one' ? 'Subscription' : 'Online Store';

    orders.push({
      id:                    name,
      'Order Number':        name,
      'Order Date':          (v[iCreated] || '').slice(0, 10),
      'Customer Name':       v[iBilling] || '—',
      'Financial Status':    (v[iFinancial] || '').toUpperCase(),
      'Fulfilment Status':   (v[iFulfill] || '').toUpperCase(),
      'Gross Total (£)':     Math.abs(Number(v[iTotal])    || 0),
      'Net Total (£)':       Math.abs(Number(v[iSubtotal]) || 0),
      'Discount Amount (£)': Math.abs(Number(v[iDiscAmt])  || 0),
      'Refund Amount (£)':   Math.abs(Number(v[iRefund])   || 0),
      'Shipping (£)':        Math.abs(Number(v[iShipping]) || 0),
      'Discount Code':       v[iDiscCode] || '',
      Channel:               channel,
      'Payment Method':      v[iPayment] || '',
      _subscription:         isSubscription,
    });
  }

  return orders.sort((a, b) => b['Order Date'].localeCompare(a['Order Date']));
}

/** Daily sales breakdown CSV */
export function getLocalDailySales() {
  const text = readLocalCSV('shopify-daily-sales.csv');
  if (!text) return null;
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return null;

  const headers = parseCSVLine(lines[0]);
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const v   = parseCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h.replace(/"/g, '').trim()] = (v[i] || '').replace(/"/g, '').trim(); });
      return {
        day:       obj['Day'],
        gross:     Number(obj['Gross sales'])      || 0,
        discounts: Math.abs(Number(obj['Discounts'])   || 0),
        returns:   Math.abs(Number(obj['Returns'])     || 0),
        net:       Number(obj['Net sales'])        || 0,
        shipping:  Number(obj['Shipping charges']) || 0,
        taxes:     Number(obj['Taxes'])            || 0,
        total:     Number(obj['Total sales'])      || 0,
      };
    })
    .filter(r => r.day);
}

/** Sales by product CSV */
export function getLocalSalesByProduct() {
  const text = readLocalCSV('shopify-sales-by-product.csv');
  if (!text) return null;
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return null;

  const headers = parseCSVLine(lines[0]);
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const v   = parseCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h.replace(/"/g, '').trim()] = (v[i] || '').replace(/"/g, '').trim(); });
      const grossSales = Number(obj['Gross sales']) || 0;
      const qty        = Number(obj['Net items sold']) || 0;
      return {
        product:    obj['Product title'] || '',
        qty,
        price:      qty > 0 ? +(grossSales / qty).toFixed(2) : 0,
        grossSales,
        discounts:  Math.abs(Number(obj['Discounts']) || 0),
        returns:    Math.abs(Number(obj['Returns'])   || 0),
        netSales:   Number(obj['Net sales'])           || 0,
      };
    })
    .filter(r => r.product && r.grossSales > 0);
}

/** Payouts CSV */
export function getLocalPayouts() {
  const text = readLocalCSV('shopify-payouts.csv');
  if (!text) return null;
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return null;

  const headers = parseCSVLine(lines[0]);
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const v   = parseCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h.trim()] = (v[i] || '').trim(); });
      return {
        id:              obj['Bank Reference'] || obj['Payout Date'],
        date:            obj['Payout Date'],
        status:          obj['Status'],
        charges:         Number(obj['Charges'])   || 0,
        refunds:         Math.abs(Number(obj['Refunds']) || 0),
        fees:            Number(obj['Fees'])       || 0,
        total:           Number(obj['Total'])      || 0,
        bankRef:         obj['Bank Reference']    || '',
        currency:        obj['Currency']          || 'GBP',
      };
    })
    .filter(r => r.date);
}
