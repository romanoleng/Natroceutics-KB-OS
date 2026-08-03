/**
 * Parser for the warehouse "SOH with Batches & BBDs" workbook.
 *
 * One row per stock code, with up to three (QTY, Batch & BBD) pairs beside a
 * Total QTY. It carries everything the stock take PDF does and adds the batch
 * numbers and best-before dates, which is the only place expiry is recorded
 * anywhere in the OS.
 *
 * The batch text is typed by hand and every row is spelled differently:
 *
 *   Batch-9136 & BBD 01/28
 *   Batch - 10638A & BBD - 03/27
 *   Batch-0002352SA BBD 08-27          (no ampersand)
 *   Batch - 320667 7 BBD 10/28         (7 typed instead of &)
 *   Batch-2351uk & BBD08/28            (no space before the date)
 *   Batch - 02606023 & BBd 11/27       (lower-case d)
 *
 * So the pattern is deliberately loose about separators and case. A line it
 * cannot read is reported rather than dropped: silently losing a batch would
 * understate how much stock is about to expire, which is the one number this
 * import exists to produce.
 *
 * TOTALS ARE NOT FORCED TO RECONCILE. Where the batch quantities do not sum to
 * Total QTY the difference is recorded on the row as unbatched stock and
 * returned in `unreconciled`. That gap is a fact about the warehouse sheet, not
 * a parse failure, and hiding it would be the wrong kind of tidy.
 */

const BATCH_RE = /Batch\s*[-–—]?\s*([A-Za-z0-9]+)\s*(?:&|7|and)?\s*BB[Dd]\s*[-–—]?\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})/i;

const num = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** "01/28" becomes "2028-01"; sorts and compares correctly as a string. */
function parseBbd(mm, yy) {
  const month = Number(mm);
  if (!(month >= 1 && month <= 12)) return null;
  let year = Number(yy);
  if (year < 100) year += 2000;
  if (year < 2020 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function parseBatchCell(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const m = raw.match(BATCH_RE);
  if (!m) return { batch: null, bbd: null, raw, unreadable: true };
  return { batch: m[1], bbd: parseBbd(m[2], m[3]), raw, unreadable: false };
}

/**
 * @param {string[][]} grid  worksheet as rows of strings
 * @param {string} reportDate  ISO date to stamp rows with
 */
function parseSohBatches(grid, reportDate) {
  // Find the header row rather than assuming row 3: the title block above it
  // has moved before.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const joined = grid[i].map(c => String(c || '').toLowerCase()).join('|');
    if (joined.includes('code') && joined.includes('total qty') && joined.includes('batch')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const header = grid[headerIdx].map(c => String(c || '').trim().toLowerCase());
  const col = name => header.findIndex(h => h === name);
  const codeCol = col('code');
  const descCol = col('description');
  const totalCol = col('total qty');
  if (codeCol === -1 || totalCol === -1) return null;

  // Every (QTY, Batch & BBD) pair to the right of Total QTY, in sheet order.
  const pairCols = [];
  for (let c = totalCol + 1; c < header.length; c++) {
    if (header[c] === 'qty') {
      const batchCol = header.indexOf('batch & bbd', c + 1);
      if (batchCol !== -1 && batchCol <= c + 2) pairCols.push({ qtyCol: c, batchCol });
    }
  }
  if (!pairCols.length) return null;

  const records = [];
  const unreconciled = [];
  const unreadable = [];
  let parsedTotal = 0;

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i];
    const sku = String(row[codeCol] || '').trim();
    const total = num(row[totalCol]);
    if (!sku || total === null) continue;

    const batches = [];
    for (const { qtyCol, batchCol } of pairCols) {
      const qty = num(row[qtyCol]);
      const parsed = parseBatchCell(row[batchCol]);
      if (!qty && !parsed) continue;
      if (parsed?.unreadable) unreadable.push({ sku, text: parsed.raw });
      if (qty || parsed?.batch) {
        batches.push({ qty: qty || 0, batch: parsed?.batch || null, bbd: parsed?.bbd || null });
      }
    }

    const batchedQty = batches.reduce((s, b) => s + b.qty, 0);
    const gap = total - batchedQty;
    if (gap !== 0) unreconciled.push({ sku, total, batched: batchedQty, gap });

    const dated = batches.filter(b => b.bbd).map(b => b.bbd).sort();
    const fields = {
      'SKU': sku,
      'Product': String(row[descCol] ?? '').trim() || sku,
      'Total QTY': total,
      'Status': total > 0 ? 'In Stock' : 'Out of Stock',
      'Last Updated': reportDate,
      'Batch Count': batches.filter(b => b.batch).length,
      // The number this import exists for: what expires first.
      'Earliest BBD': dated[0] || '',
      'Latest BBD': dated.length ? dated[dated.length - 1] : '',
      'Unbatched QTY': gap,
      'Batches': batches
        .filter(b => b.batch || b.qty)
        .map(b => `${b.qty} × ${b.batch || 'no batch'}${b.bbd ? ` (BBD ${b.bbd})` : ''}`)
        .join('; '),
      'Notes': 'Imported from warehouse SOH with batches workbook',
    };
    batches.forEach((b, n) => {
      fields[`Batch ${n + 1}`] = b.batch || '';
      fields[`Batch ${n + 1} QTY`] = b.qty;
      fields[`Batch ${n + 1} BBD`] = b.bbd || '';
    });

    parsedTotal += total;
    records.push({ recordId: sku, fields });
  }

  if (!records.length) return null;
  return { records, parsedTotal, unreconciled, unreadable };
}

module.exports = { parseSohBatches, parseBatchCell, parseBbd };
