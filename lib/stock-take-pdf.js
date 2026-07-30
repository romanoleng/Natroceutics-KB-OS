/**
 * Parser for the "Stock Take Report (by Stock Code)" PDF that the warehouse
 * sends (Sage-style, Natroceutics UK Ltd) — the authoritative warehouse
 * stock-on-hand snapshot.
 *
 * Deliberately dependency-free: pdf-parse/pdf.js dies inside Vercel's lambda
 * runtime ("Invalid number" lexer errors) despite working locally, so this
 * extracts the text layer itself — inflate the PDF's Flate streams with
 * Node's zlib and read the Tj/TJ text-show operators in content order. That
 * order is exactly row order in this report:
 *
 *   "CELL/GENEX", "CELLOG - Genex", " 1", " 105.00", ...
 *
 * Only suitable for this known report family, which is all it's for.
 */
const zlib = require('zlib');

const SKU_RE = /^[A-Z][A-Z0-9/&.-]{2,24}$/;      // "UK-COQ10&PQQ", "CELL/GFD"
const QTY_RE = /^[\d,]+\.\d{2}$/;                 // "1,756.00"
const CAT_RE = /^\d{1,3}$/;                       // stock category column

/** All Tj/TJ strings from every Flate text stream, in content order. */
function extractPdfStrings(buffer) {
  const streams = [];
  let idx = 0;
  while (true) {
    const s = buffer.indexOf('stream', idx);
    if (s === -1) break;
    let start = s + 6;
    if (buffer[start] === 0x0d) start++;
    if (buffer[start] === 0x0a) start++;
    const e = buffer.indexOf('endstream', start);
    if (e === -1) break;
    try {
      const text = zlib.inflateSync(buffer.subarray(start, e)).toString('latin1');
      if (/\bTj|\bTJ/.test(text)) streams.push(text);
    } catch { /* not Flate or not text — skip */ }
    idx = e + 9;
  }

  const unescape = s => s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c) =>
    ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[c]
      ?? String.fromCharCode(parseInt(c, 8))));

  const strings = [];
  const re = /\((?:\\.|[^\\)])*\)\s*Tj|\[((?:\((?:\\.|[^\\)])*\)|[^\]])*)\]\s*TJ/g;
  for (const content of streams) {
    let m;
    while ((m = re.exec(content))) {
      if (m[0].endsWith('Tj')) {
        strings.push(unescape(m[0].slice(1, m[0].lastIndexOf(')'))));
      } else {
        strings.push([...m[1].matchAll(/\((?:\\.|[^\\)])*\)/g)]
          .map(x => unescape(x[0].slice(1, -1))).join(''));
      }
    }
  }
  return strings;
}

function isStockTakePdf(strings) {
  const joined = strings.join(' ');
  return /Stock Take Report/i.test(joined) && /Quantity In Stock/i.test(joined);
}

function parseStockTakeStrings(strings) {
  const joined = strings.join('\n');

  // "Date:28/07/2026" (D/MM/YYYY) — sometimes split across strings.
  const dm = joined.match(/Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const reportDate = dm
    ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`
    : new Date().toISOString().slice(0, 10);

  const records = [];
  for (let i = 0; i < strings.length - 3; i++) {
    const sku = strings[i].trim();
    const desc = strings[i + 1].trim();
    const cat = strings[i + 2].trim();
    const qtyS = strings[i + 3].trim();
    if (!SKU_RE.test(sku) || !CAT_RE.test(cat) || !QTY_RE.test(qtyS)) continue;

    const qty = Math.round(Number(qtyS.replace(/,/g, '')));
    records.push({
      recordId: sku,
      fields: {
        'SKU': sku,
        'Product': desc,
        'Total QTY': qty,
        'Status': qty > 0 ? 'In Stock' : 'Out of Stock',
        'Last Updated': reportDate,
        'Notes': 'Imported from warehouse stock take PDF',
      },
    });
    i += 3;
  }

  // The report prints its own grand total right before the label — use it to
  // verify the parse rather than trusting ourselves.
  let reportTotal = null;
  const labelIdx = strings.findIndex(s => /Total Qty In Stock/i.test(s));
  if (labelIdx > 0 && QTY_RE.test(strings[labelIdx - 1].trim())) {
    reportTotal = Math.round(Number(strings[labelIdx - 1].trim().replace(/,/g, '')));
  }
  const parsedTotal = records.reduce((s, r) => s + r.fields['Total QTY'], 0);

  return { records, reportDate, parsedTotal, reportTotal };
}

/** Convenience: buffer in, parse result out. */
function parseStockTakePdf(buffer) {
  const strings = extractPdfStrings(buffer);
  if (!isStockTakePdf(strings)) return null;
  return parseStockTakeStrings(strings);
}

module.exports = { extractPdfStrings, isStockTakePdf, parseStockTakeStrings, parseStockTakePdf };
