/**
 * Shared CSV/TSV parsing for the import scripts.
 *
 * Hand-rolled RFC 4180 parser rather than the xlsx dependency: SheetJS detects
 * date-shaped strings and reformats them (2026-08-12 came back as "8/12/26"),
 * which silently corrupts date columns. This returns every cell exactly as the
 * source wrote it. Supports comma (Airtable), semicolon (sellerboard) and tab
 * delimiters.
 */

function parseDelimited(text, delimiter = ',') {
  // Strip a UTF-8 BOM — Airtable and sellerboard exports both include one.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }   // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; }
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\r') { /* handled by the \n branch */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else { field += c; }
  }
  // Trailing field / row when the file does not end with a newline.
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  return rows;
}

/**
 * UK-format dates (D/M/YYYY) → ISO. Pages filter and sort with `new Date(v)`,
 * which reads "7/3/2026" as 3 July rather than 7 March and "16/6/2026" as
 * Invalid Date — that silently scattered 319 records across wrong months
 * before it was caught on 2026-07-31. Both upstream sources (Airtable CSV
 * exports, sellerboard) are day-first, so normalise on the way in.
 */
const UK_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
function ukDateToISO(s) {
  const m = s.match(UK_DATE);
  if (!m) return null;
  const [, d, mo, y] = m;
  if (Number(d) < 1 || Number(d) > 31 || Number(mo) < 1 || Number(mo) > 12) return null;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Numeric coercion matching what the Airtable API returns: currency and
 * thousands separators become numbers ("£138.45" → 138.45, "1,234.56" →
 * 1234.56), plain numerics become numbers — but never anything with a leading
 * zero, because SKUs and order references like "0012345" must stay strings.
 */
function coerce(s) {
  if (s === '') return '';

  const iso = ukDateToISO(s);
  if (iso) return iso;

  const money = s.match(/^(-?)\s*[£$€R]\s?([\d,]+(?:\.\d+)?)$/)
             || s.match(/^(-?)([\d,]+\.\d+)$/)
             || s.match(/^(-?)(\d{1,3}(?:,\d{3})+)$/);
  if (money) {
    const n = Number(money[1] + money[2].replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }

  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  // Leading zeros mean it is an identifier, not a quantity.
  const digits = s.replace(/^-/, '');
  if (digits.length > 1 && digits[0] === '0' && digits[1] !== '.') return s;
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
}

/** Rows → array of objects keyed by the (trimmed) header row, cells coerced. */
function toObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.every(c => c.trim() === '')) continue;   // blank trailing lines
    const rec = {};
    headers.forEach((h, i) => {
      if (h) rec[h] = coerce((cells[i] ?? '').trim());
    });
    out.push(rec);
  }
  return out;
}

module.exports = { parseDelimited, coerce, toObjects, ukDateToISO };
