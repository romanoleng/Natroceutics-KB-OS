#!/usr/bin/env node
/**
 * Sellerboard exports → Postgres mirror (Amazon UK data) — CLI flavour.
 *
 * The same engine as the /upload page (lib/sellerboard.js + lib/mirror-write),
 * pointed at a folder of export files. Detection is by header signature, never
 * filename; the source directory is read-only.
 *
 * Usage
 *   node --env-file-if-exists=.env.local scripts/import-sellerboard.js --dir="/path/to/AMAZON-UK"
 *   ... --rsp=<file.tsv>   also load an RSP competitor sheet (tab-separated)
 *   ... --dry-run          parse and report, write nothing
 *
 * recordIds are natural keys (sb:<date>, sb:<date>_<ASIN>, order id, SKU,
 * ASIN), so re-running with a newer export upserts in place. When the real
 * Airtable sync later covers the same tables, its deleteStale pass replaces
 * these rows with authoritative ones.
 */
const fs = require('fs');
const path = require('path');
const { getPrisma, isConfigured } = require('../lib/prisma');
const { BASES } = require('../lib/airtable-tables');
const { parseSellerboardFile, buildRsp } = require('../lib/sellerboard');
const { commitTable } = require('../lib/mirror-write');
const { parseDelimited, toObjects } = require('./lib/csv');
const { UK_TABLES } = require('../lib/airtable-tables');

function pad(s, n) { return String(s).padEnd(n); }

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

  /* Pass 1: parse + classify (read-only). Build the ASIN→name map first so a
   * by-product file in the same folder names the orders. */
  const parsedFiles = [];
  const asinNames = new Map();

  if (args.dir) {
    const files = fs.readdirSync(args.dir).filter(f => f.toLowerCase().endsWith('.csv')).sort();
    console.log(`\nScanning ${files.length} CSV file(s) in ${args.dir}\n`);

    // First sweep just to harvest ASIN names from any by-product export.
    for (const file of files) {
      const text = fs.readFileSync(path.join(args.dir, file), 'utf8');
      const probe = parseSellerboardFile(text, { asinNames: new Map() });
      if (probe?.type.key === 'byProduct') {
        for (const rec of probe.records) {
          if (rec.fields.ASIN && rec.fields['Product Name'] && !asinNames.has(rec.fields.ASIN)) {
            asinNames.set(rec.fields.ASIN, rec.fields['Product Name']);
          }
        }
      }
      parsedFiles.push({ file, text });
    }

    for (const { file, text } of parsedFiles) {
      const parsed = parseSellerboardFile(text, { asinNames });
      const shortName = file.length > 55 ? file.slice(0, 52) + '…' : file;
      if (!parsed) { console.log(`  skip       ${shortName}`); continue; }
      console.log(`  ${pad(parsed.type.key, 10)} ${shortName} (${parsed.rowCount} rows)`);
      parsedFiles.find(p => p.file === file).parsed = parsed;
    }
  }

  /* Duplicate exports of the same report: keep the one with the most records. */
  const byType = new Map();
  for (const { parsed } of parsedFiles) {
    if (!parsed) continue;
    const prev = byType.get(parsed.type.key);
    if (!prev || parsed.records.length > prev.records.length) byType.set(parsed.type.key, parsed);
  }

  const jobs = [...byType.values()].map(p => ({
    tableKey: p.type.tableKey, tableId: p.type.tableId, records: p.records,
    replace: p.type.replace !== false,
  }));

  if (args.rsp) {
    const rows = toObjects(parseDelimited(fs.readFileSync(args.rsp, 'utf8'), '\t'));
    jobs.push({
      tableKey: 'RSP_TRACKER',
      tableId: UK_TABLES.RSP_TRACKER,
      records: buildRsp(rows, new Date().toISOString().slice(0, 10)),
    });
  }

  console.log('');
  let written = 0;
  for (const job of jobs) {
    process.stdout.write(pad(`UK.${job.tableKey}`, 26));
    if (!job.records.length) { console.log('SKIP  0 usable rows'); continue; }
    if (args.dryRun) {
      const dates = job.records.map(r => r.fields.Date).filter(Boolean).sort();
      console.log(`ok    ${job.records.length} records${dates.length ? `  (${dates[0]} → ${dates[dates.length - 1]})` : ''}  (dry run)`);
      continue;
    }
    const { deleted } = await commitTable(prisma, {
      baseKey: 'UK', tableKey: job.tableKey,
      baseId: BASES.UK.defaultBaseId, tableId: job.tableId,
      records: job.records, replace: job.replace !== false, source: 'sb',
    });
    console.log(`ok    ${job.records.length} records${deleted ? `  (-${deleted} replaced)` : ''}`);
    written++;
  }

  console.log(`\n${args.dryRun ? jobs.length + ' table(s) parsed.' : written + ' table(s) written.'}\n`);
  return 0;
}

async function disconnect() {
  const p = globalThis.__natroPrisma;
  if (p) await p.$disconnect().catch(() => {});
}

main()
  .then(async code => { await disconnect(); process.exit(code); })
  .catch(async err => { console.error(err); await disconnect(); process.exit(1); });
