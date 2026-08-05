/**
 * Import ANY flat table into a chosen destination.
 *
 * The OS stores records as `fields Json`, so the database has never cared what
 * columns a table has. The only thing that ever stopped a simple spreadsheet
 * landing here was /api/import-file insisting on RECOGNISING the header row
 * first: no signature match, 422, no matter how obvious the file. That is right
 * for the nightly Sellerboard drops, where guessing wrong writes into the wrong
 * financial series. It is wrong when the user has already said where the file
 * goes.
 *
 * So: detection stays the default, and naming a destination turns it off. The
 * columns become the fields, verbatim.
 *
 * NOTHING IS INFERRED ABOUT MEANING. No date parsing, no number coercion, no
 * renaming to match an existing table. A generic importer that quietly reshapes
 * data is how you get a column of British dates silently read as American ones.
 * Values are stored as the trimmed strings the file contained.
 */

const { createHash } = require('crypto');

/** Split one delimited line, honouring "quoted, fields" and "" escapes. */
function splitLine(line, delim) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delim) {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/**
 * Pick the delimiter by which one splits the header into the most fields while
 * staying CONSISTENT down the file. Counting on the header alone picks comma
 * for a tab-separated file whose header happens to contain "Berberine, Complex".
 */
function sniffDelimiter(lines) {
  const candidates = ['\t', ';', ',', '|'];
  let best = { delim: '\t', score: -1, cols: 1 };
  for (const delim of candidates) {
    const counts = lines.slice(0, 20).map(l => splitLine(l, delim).length);
    const cols = counts[0] || 1;
    if (cols < 2) continue;
    const consistent = counts.filter(c => c === cols).length / counts.length;
    // Width is the tie-breaker, consistency is the test.
    const score = consistent * 100 + cols;
    if (score > best.score) best = { delim, score, cols };
  }
  return best.delim;
}

/** Header cells → unique, non-empty column names, order preserved. */
function normaliseHeader(cells) {
  const seen = new Map();
  return cells.map((raw, i) => {
    let name = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!name) name = `Column ${i + 1}`;
    if (seen.has(name)) {
      const n = seen.get(name) + 1;
      seen.set(name, n);
      name = `${name} (${n})`;
    } else seen.set(name, 1);
    return name;
  });
}

/**
 * Choose the column that identifies a row, so re-uploading the same export
 * UPDATES rather than duplicating. A generic import with no stable key is a
 * duplicate generator: the Outlook task feed hashed on content and produced
 * nine near-identical Amazon tasks in three days by exactly this route.
 *
 * Preference order: the caller's choice, then an identifier-looking column
 * (ASIN, SKU, GTIN, Code, ID, Order), then any column that is complete and
 * unique. Falling back to a content hash is honest but means an edited row
 * arrives as a new one, so we say so in the warnings.
 */
/**
 * Ranked, NOT in file order. The Transparency export happens to list GTIN
 * before ASIN and both are unique, so file order would key it on GTIN while
 * every other Amazon table in the OS keys on ASIN — the two would never join.
 * The identifier the rest of the OS already uses wins.
 */
const ID_HINTS = [
  /^asin$/i,
  /^sku$/i,
  /^(order\s*(no|number|id)?|order[-_]?id)$/i,
  /^(gtin|ean|barcode)$/i,
  /^(code|id|reference|ref)$/i,
];

function chooseKeyColumn(columns, rows, preferred) {
  if (preferred && columns.includes(preferred)) return { column: preferred, hinted: true };

  const isComplete = col => rows.every(r => String(r[col] ?? '').trim() !== '');
  const isUnique = col => {
    const vals = rows.map(r => String(r[col] ?? '').trim());
    return new Set(vals).size === vals.length;
  };
  const usable = col => isComplete(col) && isUnique(col);

  for (const hint of ID_HINTS) {
    const hit = columns.find(c => hint.test(c) && usable(c));
    if (hit) return { column: hit, hinted: true };
  }
  // Nothing that looks like an identifier. A unique column still beats hashing
  // the whole row, but say so: keying on a prose column means correcting a typo
  // in that cell arrives as a NEW row rather than an edit.
  const fallback = columns.find(usable);
  return fallback ? { column: fallback, hinted: false } : { column: null, hinted: false };
}

/**
 * @param {string} text  raw delimited text (a paste, or a worksheet as TSV)
 * @param {{keyColumn?: string, maxRows?: number}} opts
 * @returns {{columns, rows, records, keyColumn, delimiter, warnings, skipped}}
 */
function parseGenericTable(text, { keyColumn, maxRows = 5000 } = {}) {
  const rawLines = String(text || '').split(/\r\n|\r|\n/);
  const lines = rawLines.filter(l => l.trim() !== '');
  if (lines.length < 2) {
    const err = new Error('Needs a header row and at least one row of data');
    err.status = 422;
    throw err;
  }

  const delimiter = sniffDelimiter(lines);
  const header = normaliseHeader(splitLine(lines[0], delimiter));

  const warnings = [];
  const rows = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delimiter);
    // A row of nothing but separators is spreadsheet padding, not data. The
    // Sellerboard stock export ends with one of these every single night.
    if (cells.every(c => c === '')) { skipped++; continue; }
    const row = {};
    header.forEach((col, i) => { row[col] = cells[i] ?? ''; });
    rows.push(row);
    if (rows.length >= maxRows) {
      warnings.push(`Stopped at ${maxRows} rows — split the file and import the rest`);
      break;
    }
  }

  if (!rows.length) {
    const err = new Error('No data rows found under the header');
    err.status = 422;
    throw err;
  }

  // Drop columns that are empty for EVERY row: trailing blank spreadsheet
  // columns otherwise become real fields and show up as dashes on every page.
  const columns = header.filter(col => rows.some(r => String(r[col] ?? '').trim() !== ''));
  const dropped = header.length - columns.length;
  if (dropped > 0) warnings.push(`${dropped} empty column${dropped === 1 ? '' : 's'} ignored`);

  const trimmed = rows.map(r => {
    const o = {};
    for (const c of columns) o[c] = String(r[c] ?? '').trim();
    return o;
  });

  const { column: key, hinted } = chooseKeyColumn(columns, trimmed, keyColumn);
  if (!key) {
    warnings.push(
      'No column uniquely identifies a row, so rows are keyed on their content. ' +
      'Re-importing after an edit will add a row rather than update one.'
    );
  } else if (!hinted) {
    warnings.push(
      `No identifier column found, so rows are keyed on "${key}". ` +
      'Editing that cell and re-importing will add a row rather than update one.'
    );
  }

  const records = trimmed.map(fields => ({
    recordId: key
      ? `k:${createHash('sha1').update(String(fields[key])).digest('hex').slice(0, 28)}`
      : `h:${createHash('sha1').update(JSON.stringify(fields)).digest('hex').slice(0, 20)}`,
    fields,
  }));

  if (skipped) warnings.push(`${skipped} blank row${skipped === 1 ? '' : 's'} ignored`);

  return { columns, rows: trimmed, records, keyColumn: key, delimiter, warnings, skipped };
}

module.exports = { parseGenericTable, sniffDelimiter, splitLine };
