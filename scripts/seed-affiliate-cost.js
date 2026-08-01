#!/usr/bin/env node
/**
 * Fold affiliate commission into the UK cost model, and summarise the
 * affiliate programme by month.
 *
 * Affiliate commission was the one cost scaling with revenue that appeared
 * NOWHERE in the Shopify P&L, so the contribution figure on the Performance
 * tab and /report/shopify-uk was overstated by whatever affiliates were paid.
 * The AFF base carries per-sale commission, so this is an ACTUAL figure, not a
 * model.
 *
 * It turns out to be small right now (June £24.23), but the rate is not: the
 * programme pays a blended 24.2%, which is the single most expensive
 * acquisition channel the business runs. Small today because volume is low.
 *
 * CAVEAT recorded on every row: the AFF tables are Airtable-maintained and the
 * last recorded sale is June 2026. A zero for July means "no sale recorded",
 * which is not the same as "no commission due" — this needs GoAffPro's API to
 * become authoritative.
 *
 *   node --env-file-if-exists=.env.local scripts/seed-affiliate-cost.js
 */
const { getPrisma, isConfigured } = require('../lib/prisma');
const { commitTable } = require('../lib/mirror-write');
const { BASES, resolveBaseId } = require('../lib/airtable-tables');

const UK = BASES.UK, AFF = BASES.AFF;
const UK_BASE_ID = resolveBaseId(UK.envVar);
const r2 = n => Math.round(n * 100) / 100;

async function main() {
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }
  const prisma = getPrisma();

  const affBaseId = resolveBaseId(AFF.envVar);
  const rows = (await prisma.$queryRaw`
    SELECT "fields"::text AS f FROM "AirtableRecord"
    WHERE "baseId" = ${affBaseId} AND "tableId" = ${AFF.tables.SALES}`).map(r => JSON.parse(r.f));

  // Rejected sales earn no commission; counting them would overstate the cost.
  const approved = rows.filter(r => String(r.Status || '').toLowerCase() === 'approved');

  const byMonth = new Map();
  for (const r of approved) {
    const m = String(r.Date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    const v = byMonth.get(m) || { sales: 0, revenue: 0, commission: 0, subs: 0 };
    v.sales++;
    v.revenue += Number(r.Revenue) || 0;
    v.commission += Number(r.Commission) || 0;
    if (r.Subscription === true) v.subs++;
    byMonth.set(m, v);
  }

  const totalRev = approved.reduce((s, r) => s + (Number(r.Revenue) || 0), 0);
  const totalComm = approved.reduce((s, r) => s + (Number(r.Commission) || 0), 0);
  const blended = totalRev ? (totalComm / totalRev) * 100 : 0;
  const lastMonth = [...byMonth.keys()].sort().pop() || null;

  const monthly = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({
      recordId: `affm:${month}`,
      fields: {
        Month: month,
        'Affiliate Sales': v.sales,
        'Affiliate Revenue (£)': r2(v.revenue),
        'Commission (£)': r2(v.commission),
        'Commission Rate %': v.revenue ? r2((v.commission / v.revenue) * 100) : '',
        'Subscription Sales': v.subs,
        Source: 'AFF.SALES, approved only',
      },
    }));

  console.log(`approved affiliate sales: ${approved.length} of ${rows.length}`);
  console.log(`revenue £${r2(totalRev)} | commission £${r2(totalComm)} | blended ${r2(blended)}%`);
  console.log(`last recorded sale month: ${lastMonth}`);

  await commitTable(prisma, {
    baseKey: 'UK', tableKey: 'AFF_MONTHLY',
    baseId: UK_BASE_ID, tableId: UK.tables.AFF_MONTHLY,
    records: monthly, replace: true, source: 'affiliate-cost',
  });
  console.log(`\nUK.AFF_MONTHLY    ${monthly.length} rows`);

  // Fold into the cost model so the Performance tab stops omitting it.
  const jun = byMonth.get('2026-06');
  const jul = byMonth.get('2026-07');
  const costRow = {
    recordId: 'affiliate_commission',
    fields: {
      Key: 'affiliate_commission',
      Label: 'Affiliate commission',
      Value: jul ? r2(jul.commission) : (jun ? r2(jun.commission) : ''),
      Unit: '£/month',
      Source: 'AFF.SALES (GoAffPro, via Airtable)',
      Status: jul ? 'ACTUAL' : 'STALE',
      Note: jul
        ? `Actual commission on approved affiliate sales. Blended rate ${r2(blended)}%.`
        : `No affiliate sale recorded after ${lastMonth}. June commission was £${jun ? r2(jun.commission) : 0} at a blended ${r2(blended)}% rate. A zero here means "nothing recorded", not "nothing owed" — the AFF tables are maintained by hand and need GoAffPro's API to become authoritative.`,
      'Last Updated': new Date().toISOString().slice(0, 10),
    },
  };

  const existing = (await prisma.$queryRaw`
    SELECT "recordId", "fields"::text AS f FROM "AirtableRecord"
    WHERE "baseId" = ${UK_BASE_ID} AND "tableId" = ${UK.tables.COST_MODEL}`)
    .map(r => ({ recordId: r.recordId, fields: JSON.parse(r.f) }))
    .filter(r => r.recordId !== 'affiliate_commission');

  await commitTable(prisma, {
    baseKey: 'UK', tableKey: 'COST_MODEL',
    baseId: UK_BASE_ID, tableId: UK.tables.COST_MODEL,
    records: [...existing, costRow], replace: true, source: 'affiliate-cost',
  });
  console.log(`UK.COST_MODEL     ${existing.length + 1} rows (affiliate commission added)`);

  await prisma.$disconnect();
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.error(e); process.exit(1); });
