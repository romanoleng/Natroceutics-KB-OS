#!/usr/bin/env node
/**
 * Normalise UK-format dates (D/M/YYYY) to ISO (YYYY-MM-DD) across the mirror.
 *
 * WHY THIS EXISTS: pages filter and sort with `new Date(row['Order Date'])`.
 * JavaScript reads "7/3/2026" as 3 July (M/D), not 7 March — and "16/6/2026"
 * as Invalid Date. So Airtable-exported rows either landed in the wrong month
 * or vanished from every range. On 2026-07-31 that inflated the UK Shopify MTD
 * order count from the true 66 to 75.
 *
 * Both upstream sources are unambiguously day-first: Airtable UK CSV exports
 * and sellerboard exports. The script asserts that before touching anything —
 * if any value looks month-first (first part > 12), it aborts rather than
 * corrupt data.
 *
 *   node --env-file-if-exists=.env.local scripts/fix-dates.js --dry-run
 *   node --env-file-if-exists=.env.local scripts/fix-dates.js
 */
const { getPrisma, isConfigured } = require('../lib/prisma');

const UK_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** "16/6/2026" → "2026-06-16"; returns null when not a UK-format date. */
function toISO(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(UK_DATE);
  if (!m) return null;
  const [, d, mo, y] = m;
  if (Number(d) > 31 || Number(mo) > 12 || Number(d) < 1 || Number(mo) < 1) return null;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }
  const prisma = getPrisma();

  const rows = await prisma.$queryRaw`
    SELECT "baseId", "tableId", "recordId", "fields"::text AS raw FROM "AirtableRecord"`;
  console.log(`Scanning ${rows.length} records…\n`);

  const updates = [];
  const perField = new Map();
  let ambiguousFirstGt12 = 0;

  for (const row of rows) {
    let fields;
    try { fields = JSON.parse(row.raw); } catch { continue; }
    let changed = false;

    for (const [key, val] of Object.entries(fields)) {
      const iso = toISO(val);
      if (!iso) continue;
      const [, d] = String(val).match(UK_DATE);
      if (Number(d) > 12) ambiguousFirstGt12++;   // proves day-first
      fields[key] = iso;
      perField.set(key, (perField.get(key) || 0) + 1);
      changed = true;
      // Keep a Month field consistent when we just fixed its source date.
      if (/^(Order )?Date$/i.test(key) && typeof fields.Month === 'string') {
        fields.Month = iso.slice(0, 7);
      }
    }
    if (changed) updates.push({ ...row, fields });
  }

  if (!updates.length) { console.log('Nothing to fix — all dates already ISO.\n'); return 0; }

  console.log('Fields containing UK-format dates:');
  for (const [k, n] of [...perField].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
  console.log(`\n${updates.length} records affected.`);
  console.log(`Day-first confirmed by ${ambiguousFirstGt12} values whose first part is > 12 (cannot be a month).`);

  if (dryRun) { console.log('\nDry run — nothing written.\n'); return 0; }

  let done = 0;
  for (const u of updates) {
    await prisma.$executeRaw`
      UPDATE "AirtableRecord" SET "fields" = ${JSON.stringify(u.fields)}::json
      WHERE "baseId" = ${u.baseId} AND "tableId" = ${u.tableId} AND "recordId" = ${u.recordId}`;
    done++;
  }
  console.log(`\nUpdated ${done} records.\n`);
  return 0;
}

main()
  .then(async code => { const p = globalThis.__natroPrisma; if (p) await p.$disconnect().catch(() => {}); process.exit(code); })
  .catch(async err => { console.error(err); const p = globalThis.__natroPrisma; if (p) await p.$disconnect().catch(() => {}); process.exit(1); });
