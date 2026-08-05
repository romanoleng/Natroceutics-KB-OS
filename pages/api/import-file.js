/**
 * POST /api/import-file — the engine behind the /upload page.
 *
 * Body: { filename, content } (file text, JSON-encoded).
 * Detects the file type by HEADER SIGNATURE (sellerboard dashboard-by-day,
 * dashboard-by-product, orders, stock history, or an RSP competitor sheet),
 * builds mirror records with the same field names the Airtable sync produces,
 * and upserts them into Postgres. The dashboards serve the new data on the
 * next page load — no deploy, no AI, no terminal.
 *
 * Auth: middleware.js already gates every /api/* route behind the kb-auth
 * cookie (only /api/login is exempt), so a valid session is required.
 */
import { getPrisma, isConfigured } from '../../lib/prisma';
import { parseSellerboardFile } from '../../lib/sellerboard';
import { commitTable } from '../../lib/mirror-write';
import { BASES } from '../../lib/airtable-tables';
import { parseGenericTable } from '../../lib/table-import';
import { lockReason } from '../../lib/destinations';

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};

/** ASIN → product name map from whatever ASIN-daily data is already mirrored. */
async function loadAsinNames(prisma) {
  const map = new Map();
  try {
    const rows = await prisma.$queryRaw`
      SELECT DISTINCT ON ("fields"->>'ASIN')
             "fields"->>'ASIN' AS asin, "fields"->>'Product Name' AS name
      FROM "AirtableRecord"
      WHERE "tableId" = ${'tblJNHtfGobCw3a4S'} AND "fields"->>'ASIN' IS NOT NULL
    `;
    for (const r of rows) if (r.asin && r.name) map.set(r.asin, r.name);
  } catch { /* cosmetic only — orders fall back to showing the ASIN */ }
  return map;
}

/* ── freeform paste targets ──────────────────────────────────
 * For text copied out of Outlook rather than a spreadsheet: the user says
 * where it belongs and the record is built the same way the Natro-OS-Data-
 * Fetch scheduler builds it from the same email. Additive — never replaces.
 * ──────────────────────────────────────────────────────────── */
function firstLine(text) {
  return (text.split('\n').map(l => l.trim()).find(l => l) || '').slice(0, 180);
}

const today = () => new Date().toISOString().slice(0, 10);

const FREEFORM_TARGETS = {
  'UK.TASKS': {
    label: 'UK Task',
    tableKey: 'TASKS',
    build: text => [{
      fields: {
        'Task': firstLine(text),
        'Status': 'Not Started',
        'Priority': 'Normal',
        'Owner': 'Romano',
        'Business Area': 'Ecommerce',
        'Date of Entry': today(),
        'Notes': text.slice(0, 8000),
      },
    }],
  },
  'UK.RISKS': {
    label: 'UK Risk / Blocker',
    tableKey: 'RISKS',
    build: text => [{
      fields: {
        'Risk / Blocker': firstLine(text),
        'Status': 'Open',
        'Owner': 'Romano',
        'Date Raised': today(),
        'Notes': text.slice(0, 8000),
      },
    }],
  },
  'UK.ORDERS': {
    label: 'Shopify order email',
    tableKey: 'ORDERS',
    // Same extraction rules the scheduler applies to these emails.
    build: text => {
      const orderNo = text.match(/#\d{3,6}/)?.[0];
      if (!orderNo) throw Object.assign(new Error('No order number (#1234) found in the pasted text — is this a Shopify order email?'), { status: 422 });
      const customer = text.match(/placed by\s+([A-Za-zÀ-ž' .-]+)/i)?.[1]?.trim()
                    || text.match(/^([A-Za-zÀ-ž' .-]+)\s+placed order/mi)?.[1]?.trim() || '';
      // Line-anchored so "Total" cannot match the "Subtotal" line.
      const money = label => {
        const m = text.match(new RegExp(String.raw`^\s*` + label + String.raw`\b[^\d£$-]*£?\s*(-?[\d,]+\.\d{2})`, 'im'));
        return m ? Number(m[1].replace(/,/g, '')) : null;
      };
      const gross = money('Subtotal') ?? money('Total');
      const net = money('Total');
      const discountCode = text.match(/\b([A-Z0-9]{4,15})\b\s*\(?-\s*£/)?.[1] || '';
      return [{
        recordId: orderNo,
        fields: {
          'Order Number': orderNo,
          'Customer Name': customer || '—',
          'Order Date': today(),
          'Gross Total (£)': gross ?? 0,
          'Net Total (£)': net ?? gross ?? 0,
          'Discount Code': discountCode,
          'Financial Status': 'PAID',
          'Fulfilment Status': 'FULFILLED',
          'Channel': 'Online Store',
          'Month': today().slice(0, 7),
          'Notes': 'Added via paste on /upload',
        },
      }];
    },
  },
};

/* ── explicit-destination import ──────────────────────────────
 * "Put this table in UK.TRANSPARENCY" rather than "work out what this is".
 * ──────────────────────────────────────────────────────────── */

/** A target naming a real BASE.TABLE, as opposed to 'auto' or a freeform key. */
function isTableTarget(target) {
  if (!target || typeof target !== 'string' || target === 'auto') return false;
  if (FREEFORM_TARGETS[target]) return false;
  const [baseKey, tableKey] = target.split('.');
  return Boolean(BASES[baseKey]?.tables?.[tableKey]);
}

/** XLSX buffer → { sheetName, tsv } for the chosen sheet, or the widest one. */
function sheetToTsv(buffer, wanted) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  const names = wb.SheetNames || [];
  if (!names.length) {
    const e = new Error('That workbook has no sheets'); e.status = 422; throw e;
  }
  const pick = wanted && names.includes(wanted)
    ? wanted
    // No sheet named: take the one with the most cells rather than the first.
    // Exports routinely lead with a cover or a filter tab.
    : names.map(n => ({ n, size: (XLSX.utils.sheet_to_csv(wb.Sheets[n]) || '').length }))
           .sort((a, b) => b.size - a.size)[0].n;
  return {
    sheetName: pick,
    sheetNames: names,
    tsv: XLSX.utils.sheet_to_csv(wb.Sheets[pick], { FS: '\t', blankrows: false, defval: '' }),
  };
}

async function importToTable(prisma, opts, res) {
  const { target, keyColumn, sheet, preview, content, contentBase64, filename } = opts;
  const [baseKey, tableKey] = target.split('.');

  const reason = lockReason(baseKey, tableKey);
  if (reason) {
    const e = new Error(`${target} is written by a feed`);
    e.status = 409;
    e.detail = `Not imported: ${reason}. Anything written here would be lost on the next run.`;
    throw e;
  }

  let text = content;
  let sheetName = null;
  let sheetNames = null;
  if (contentBase64) {
    const buffer = Buffer.from(contentBase64, 'base64');
    if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
      // Not a zip container, so not xlsx. Treat it as text (csv/tsv/txt).
      text = buffer.toString('utf8');
    } else {
      const picked = sheetToTsv(buffer, sheet);
      text = picked.tsv;
      sheetName = picked.sheetName;
      sheetNames = picked.sheetNames;
    }
  }

  const parsed = parseGenericTable(text, { keyColumn });

  // Preview stops here: parsed, counted, nothing written. A generic importer
  // that writes before you have seen the grid is how 35 rows end up in the
  // wrong table with no undo.
  if (preview) {
    return res.status(200).json({
      ok: true, preview: true, table: target,
      columns: parsed.columns,
      keyColumn: parsed.keyColumn,
      rowCount: parsed.records.length,
      sample: parsed.rows.slice(0, 5),
      sheetName, sheetNames,
      warnings: parsed.warnings,
    });
  }

  const base = BASES[baseKey];
  const { written, deleted } = await commitTable(prisma, {
    baseKey, tableKey,
    baseId: base.defaultBaseId,
    tableId: base.tables[tableKey],
    records: parsed.records,
    // ALWAYS additive. A hand upload must never delete rows it did not write:
    // the file is usually a slice (one marketplace, one month), and replace
    // would silently destroy everything outside that slice.
    replace: false,
    source: 'upload',
  });

  return res.status(200).json({
    ok: true,
    detected: `Table import → ${parsed.columns.length} columns`,
    table: target,
    written: written ?? parsed.records.length,
    deleted: deleted || 0,
    columns: parsed.columns,
    keyColumn: parsed.keyColumn,
    sheetName,
    filename: filename || null,
    warnings: parsed.warnings,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isConfigured()) return res.status(500).json({ error: 'No database configured (DATABASE_URL missing)' });

  const { filename, content, contentBase64, target, keyColumn, sheet, preview } = req.body || {};
  if ((!content || typeof content !== 'string') && !contentBase64) {
    return res.status(400).json({ error: 'Missing file content' });
  }

  const prisma = getPrisma();

  // ── explicit destination: skip detection entirely ──────────────────────
  // The user has said where this goes, so there is nothing to guess. This is
  // what lets a plain three-column export land in the OS: header detection is
  // the right default for the nightly Sellerboard drops, where writing into the
  // wrong financial series is expensive, and pure obstruction once the
  // destination is named.
  if (isTableTarget(target)) {
    try {
      return await importToTable(prisma, {
        target, keyColumn, sheet, preview,
        content, contentBase64, filename,
      }, res);
    } catch (err) {
      return res.status(err.status || 500).json({
        error: err.status ? err.message : 'Import failed',
        detail: err.status ? err.detail : err.message,
      });
    }
  }

  // Binary files (PDF / XLSX) arrive base64-encoded; sniff the magic bytes.
  if (contentBase64) {
    const buffer = Buffer.from(contentBase64, 'base64');

    // XLSX (zip container, "PK"): convert each worksheet to TSV and run it
    // through the same header detection as pasted/dropped table data. Dated
    // workbooks keep old tabs, so the LAST matching sheet wins (newest tab).
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      try {
        const XLSX = require('xlsx');
        const { parseSellerboardFile } = require('../../lib/sellerboard');
        const { parseSohBatches } = require('../../lib/soh-batches');
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const asinNames = await loadAsinNames(prisma);

        // Warehouse SOH with batches and BBDs. Checked before the sellerboard
        // reports because its shape is distinctive and it is the only source of
        // expiry dates anywhere in the OS.
        for (const sheetName of wb.SheetNames) {
          const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
            header: 1, blankrows: false, defval: '',
          });
          const soh = parseSohBatches(grid, today());
          if (!soh) continue;

          const { written, deleted } = await commitTable(prisma, {
            baseKey: 'UK', tableKey: 'STOCK',
            baseId: BASES.UK.defaultBaseId,
            tableId: BASES.UK.tables.STOCK,
            records: soh.records,
            replace: true,   // a SOH sheet IS the warehouse inventory
            source: 'xlsx',
          });

          const soonest = soh.records
            .map(r => r.fields['Earliest BBD'])
            .filter(Boolean)
            .sort()[0] || null;

          return res.status(200).json({
            ok: true,
            filename: filename || null,
            detected: `Warehouse SOH with batches (sheet “${sheetName}”)`,
            table: 'UK.STOCK',
            written,
            replaced: deleted,
            dateRange: null,
            preview: `${soh.parsedTotal.toLocaleString('en-GB')} units across ${written} SKUs`
              + (soonest ? `, earliest BBD ${soonest}` : ''),
            // Reported, never silently absorbed: a batch total that does not
            // match the stock total is a fact about the sheet, and a batch line
            // nobody could read means expiry is understated.
            warnings: [
              ...soh.unreconciled.map(u =>
                `${u.sku}: ${u.total} in stock but only ${u.batched} attributed to a batch (${u.gap} unbatched)`),
              ...soh.unreadable.map(u => `${u.sku}: could not read batch line “${u.text}”`),
            ],
          });
        }

        // Collect every matching sheet, then prefer the newest dated tab
        // ("27 July" beats "17 July"); fall back to sheet order.
        const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
        const tabDate = name => {
          const m = name.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?$/);
          if (!m || !(m[2].slice(0, 3).toLowerCase() in MONTHS)) return null;
          const year = m[3] ? Number(m[3]) : new Date().getFullYear();
          return new Date(year, MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1])).getTime();
        };

        const matches = [];
        for (const sheetName of wb.SheetNames) {
          const tsv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName], { FS: '\t', blankrows: false });
          const parsed = parseSellerboardFile(tsv, { asinNames });
          if (parsed && parsed.records.length) matches.push({ sheetName, parsed, date: tabDate(sheetName) });
        }
        const match = matches.sort((a, b) => (b.date ?? -1) - (a.date ?? -1))[0] || null;

        if (!match) {
          return res.status(422).json({
            error: 'No recognisable sheet in this workbook',
            detail: `Looked at: ${wb.SheetNames.join(', ')}. A sheet needs the column headings of a supported report: the warehouse SOH sheet (Code / Description / Total QTY / Batch & BBD), a sellerboard export, or the pricing sheet (ASIN / Seller 1 (Buy Box) / RRP).`,
            filename: filename || null,
          });
        }

        const { type, records } = match.parsed;
        const { written, deleted } = await commitTable(prisma, {
          baseKey: 'UK',
          tableKey: type.tableKey,
          baseId: BASES.UK.defaultBaseId,
          tableId: type.tableId,
          records,
          replace: type.replace !== false,
          source: 'xlsx',
        });
        const dates = records.map(r => r.fields.Date).filter(Boolean).sort();
        return res.status(200).json({
          ok: true,
          filename: filename || null,
          detected: `${type.label} (sheet “${match.sheetName}”)`,
          table: `UK.${type.tableKey}`,
          written,
          replaced: deleted,
          dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
        });
      } catch (err) {
        console.error('[api/import-file] xlsx', err.message);
        return res.status(500).json({ error: 'Workbook import failed', detail: err.message });
      }
    }

    // PDF: the only supported layout is the warehouse "Stock Take Report
    // (by Stock Code)" — the authoritative warehouse SOH.
    try {
      const { parseStockTakePdf } = require('../../lib/stock-take-pdf');
      const parsedPdf = parseStockTakePdf(buffer);

      if (!parsedPdf) {
        return res.status(422).json({
          error: 'PDF not recognised',
          detail: 'Only the warehouse "Stock Take Report (by Stock Code)" PDF is supported so far. For other PDFs, export the underlying report as CSV.',
          filename: filename || null,
        });
      }

      const { records, reportDate, parsedTotal, reportTotal } = parsedPdf;
      if (!records.length) {
        return res.status(422).json({ error: 'Recognised the stock take report but found no product rows', filename: filename || null });
      }
      // Refuse a partial parse rather than silently under-reporting stock.
      if (reportTotal !== null && parsedTotal !== reportTotal) {
        return res.status(422).json({
          error: 'Stock take totals do not reconcile',
          detail: `Parsed ${parsedTotal} units but the report says ${reportTotal} — layout may have changed; not imported.`,
        });
      }

      const { written, deleted } = await commitTable(prisma, {
        baseKey: 'UK', tableKey: 'STOCK',
        baseId: BASES.UK.defaultBaseId,
        tableId: BASES.UK.tables.STOCK,
        records,
        replace: true,   // the stock take IS the warehouse inventory
        source: 'pdf',
      });
      return res.status(200).json({
        ok: true,
        filename: filename || null,
        detected: `Warehouse stock take (${reportDate})`,
        table: 'UK.STOCK',
        written,
        replaced: deleted,
        dateRange: null,
        preview: `${parsedTotal.toLocaleString('en-GB')} units across ${written} SKUs`,
      });
    } catch (err) {
      console.error('[api/import-file] pdf', err.message);
      return res.status(500).json({ error: 'PDF import failed', detail: err.message });
    }
  }

  // Explicit destination: build the record(s) from freeform text, additively.
  if (target && target !== 'auto') {
    const spec = FREEFORM_TARGETS[target];
    if (!spec) return res.status(400).json({ error: `Unknown target "${target}"` });
    try {
      const built = spec.build(content).map((r, i) => ({
        recordId: r.recordId
          || 'paste:' + require('crypto').createHash('sha1').update(content).digest('hex').slice(0, 16),
        fields: r.fields,
      }));
      const { written } = await commitTable(prisma, {
        baseKey: 'UK',
        tableKey: spec.tableKey,
        baseId: BASES.UK.defaultBaseId,
        tableId: BASES.UK.tables[spec.tableKey],
        records: built,
        replace: false,   // paste adds — it must never wipe a table
        source: 'paste',
      });
      return res.status(200).json({
        ok: true,
        detected: spec.label,
        table: `UK.${spec.tableKey}`,
        written,
        preview: built[0].fields[Object.keys(built[0].fields)[0]],
      });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.status ? err.message : 'Import failed', detail: err.status ? undefined : err.message });
    }
  }

  try {
    const asinNames = await loadAsinNames(prisma);
    const parsed = parseSellerboardFile(content, { asinNames });

    if (!parsed) {
      return res.status(422).json({
        error: 'File not recognised',
        detail:
          'The header row does not match any known export. Supported: sellerboard ' +
          'Dashboard by day, Dashboard by product, Orders, Stock history, the ' +
          'RSP competitor sheet, and the warehouse SOH sheet with batches ' +
          '(Code / Description / Total QTY / Batch & BBD) — all tab-separated. ' +
          'The SOH sheet is only read from a workbook, not from pasted text, ' +
          'because its header sits below a title block that a paste usually drops.',
        filename: filename || null,
      });
    }
    if (!parsed.records.length) {
      // "No usable rows" on its own sent someone hunting through the parser for
      // an hour: every row of two dashboard exports was being dropped on an
      // unparseable date and the message named neither the column nor a value.
      // Say which export matched, how many rows were read, and what the first
      // row actually looked like — enough to spot a format change from the UI.
      return res.status(422).json({
        error: 'Recognised the file but found no usable rows',
        detail:
          `Matched "${parsed.type.label}" and read ${parsed.rowCount} data row` +
          `${parsed.rowCount === 1 ? '' : 's'}, but every row was skipped — each was ` +
          'missing the date or key column the builder requires. This usually means the ' +
          'export format changed. First row as parsed: ' +
          JSON.stringify(parsed.sample ?? {}).slice(0, 300),
        filename: filename || null,
      });
    }

    const { type, records } = parsed;
    const { written, deleted } = await commitTable(prisma, {
      baseKey: 'UK',
      tableKey: type.tableKey,
      baseId: BASES.UK.defaultBaseId,
      tableId: type.tableId,
      records,
      // Time-series types merge; snapshots replace — see lib/sellerboard.js.
      replace: type.replace !== false,
      source: 'upload',
    });

    const dates = records.map(r => r.fields.Date).filter(Boolean).sort();
    return res.status(200).json({
      ok: true,
      filename: filename || null,
      detected: type.label,
      table: `UK.${type.tableKey}`,
      written,
      replaced: deleted,
      dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    });
  } catch (err) {
    console.error('[api/import-file]', err.message);
    return res.status(500).json({ error: 'Import failed', detail: err.message });
  }
}
