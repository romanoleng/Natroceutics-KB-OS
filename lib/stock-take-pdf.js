/**
 * Parser for the "Stock Take Report (by Stock Code)" PDF that the warehouse
 * emails (Sage-style, Natroceutics UK Ltd) — the authoritative warehouse
 * stock-on-hand snapshot.
 *
 * pdf-parse gives one text stream where each product occupies three lines:
 *
 *   UK-BCOM
 *   Vitamin B Complex (8131)
 *   1 1,756.00          ← stock category, quantity
 *
 * Output: mirror-ready records for UK.STOCK, same field names the
 * Natro-OS-Data-Fetch scheduler writes from the Bio-nature SOH email.
 */

const SKU_LINE = /^[A-Z][A-Z0-9/&.-]{2,24}$/;          // "UK-COQ10&PQQ", "CELL/GFD"
const QTY_LINE = /^(\d+)\s+([\d,]+\.\d{2})$/;           // "1 1,756.00"

function isStockTakePdf(text) {
  return /Stock Take Report/i.test(text) && /Quantity In Stock/i.test(text);
}

function parseStockTakeText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Report date: "Date:28/07/2026" (D/MM/YYYY)
  const dm = text.match(/Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const reportDate = dm
    ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`
    : new Date().toISOString().slice(0, 10);

  const records = [];
  for (let i = 0; i < lines.length - 2; i++) {
    if (!SKU_LINE.test(lines[i])) continue;
    // Header words also match the SKU shape — require the qty line to follow
    // within the next two lines to accept it as a product row.
    const desc = lines[i + 1];
    const qtyAt = QTY_LINE.test(lines[i + 2]) ? i + 2 : (QTY_LINE.test(lines[i + 1]) ? i + 1 : -1);
    if (qtyAt === -1) continue;
    const m = lines[qtyAt].match(QTY_LINE);
    const qty = Math.round(Number(m[2].replace(/,/g, '')));

    records.push({
      recordId: lines[i],
      fields: {
        'SKU': lines[i],
        'Product': qtyAt === i + 2 ? desc : '',
        'Total QTY': qty,
        'Status': qty > 0 ? 'In Stock' : 'Out of Stock',
        'Last Updated': reportDate,
        'Notes': 'Imported from warehouse stock take PDF',
      },
    });
    i = qtyAt;
  }

  // Cross-check against the report's own total when present.
  const tm = text.match(/([\d,]+\.\d{2})\s*\n?\s*Total Qty In Stock/i);
  const reportTotal = tm ? Math.round(Number(tm[1].replace(/,/g, ''))) : null;
  const parsedTotal = records.reduce((s, r) => s + r.fields['Total QTY'], 0);

  return { records, reportDate, parsedTotal, reportTotal };
}

module.exports = { isStockTakePdf, parseStockTakeText };
