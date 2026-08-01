#!/usr/bin/env node
/**
 * Pull the affiliate programme from GoAffPro and fold commission into the P&L.
 *
 *   node --env-file-if-exists=.env.local scripts/goaffpro-pull.js
 *
 * This replaces the hand-maintained Airtable AFF base as the source of truth.
 * That base had stopped being updated: it held 34 sales ending June 2026, and
 * showed June commission as £24.23. GoAffPro has 43 orders including seven in
 * July worth £221.81 of commission. So the OS was understating a real cost by
 * treating "nothing recorded" as the end of the story.
 *
 * Per-affiliate totals are computed from the order ledger rather than read from
 * the affiliate record: the summary fields come back null on this plan, and a
 * total derived from the rows it is made of can be checked.
 */
const { getPrisma, isConfigured } = require('../lib/prisma');
const { commitTable } = require('../lib/mirror-write');
const { BASES, resolveBaseId } = require('../lib/airtable-tables');
const goaffpro = require('../lib/goaffpro');

const UK = BASES.UK;
const r2 = n => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const num = v => (v === '' || v == null ? 0 : Number(v) || 0);

async function main() {
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }
  if (!goaffpro.isConfigured()) {
    console.error(
      'GOAFFPRO_ACCESS_TOKEN is not set.\n\n' +
      '  GoAffPro → Settings → Advanced → API Keys → generate a token\n' +
      '  npx vercel env add GOAFFPRO_ACCESS_TOKEN development\n'
    );
    return 1;
  }

  const prisma = getPrisma();
  const baseId = resolveBaseId(UK.envVar);

  const [affiliates, orders, payouts] = await Promise.all([
    goaffpro.getAffiliates(),
    goaffpro.getOrders(),
    goaffpro.getPayouts(),
  ]);

  // Roll the ledger up per affiliate and per month.
  const perAff = new Map();
  const perMonth = new Map();
  for (const o of orders) {
    const rev = num(o.revenue), comm = num(o.commission);

    const a = perAff.get(o.affiliateId) || { orders: 0, revenue: 0, commission: 0, last: '' };
    a.orders++; a.revenue += rev; a.commission += comm;
    if (o.date > a.last) a.last = o.date;
    perAff.set(o.affiliateId, a);

    const m = String(o.date).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    const mm = perMonth.get(m) || { orders: 0, revenue: 0, commission: 0 };
    mm.orders++; mm.revenue += rev; mm.commission += comm;
    perMonth.set(m, mm);
  }

  const totalRev = orders.reduce((s, o) => s + num(o.revenue), 0);
  const totalComm = orders.reduce((s, o) => s + num(o.commission), 0);
  const blended = totalRev ? (totalComm / totalRev) * 100 : 0;
  const active = [...perAff.values()].filter(a => a.orders > 0).length;

  console.log(`affiliates: ${affiliates.length} (${active} have ever referred an order)`);
  console.log(`orders:     ${orders.length}`);
  console.log(`revenue:    £${r2(totalRev)}  commission £${r2(totalComm)}  blended ${r2(blended)}%`);
  console.log(`payouts:    ${payouts.length}`);

  const affRows = affiliates.map(a => {
    const t = perAff.get(a.id) || { orders: 0, revenue: 0, commission: 0, last: '' };
    return {
      recordId: `ga:${a.id}`.slice(0, 32),
      fields: {
        Affiliate: a.name, Email: a.email, Status: a.status,
        Coupon: a.coupon, Tags: a.tags,
        Orders: t.orders, 'Revenue (£)': r2(t.revenue), 'Commission (£)': r2(t.commission),
        'Commission Rate %': t.revenue ? r2((t.commission / t.revenue) * 100) : '',
        'Last Referral': t.last || '',
        'Signed Up': a.created,
        Source: 'GoAffPro API', 'Last Updated': today(),
      },
    };
  });

  const monthRows = [...perMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({
    recordId: `affm:${month}`,
    fields: {
      Month: month,
      'Affiliate Sales': v.orders,
      'Affiliate Revenue (£)': r2(v.revenue),
      'Commission (£)': r2(v.commission),
      'Commission Rate %': v.revenue ? r2((v.commission / v.revenue) * 100) : '',
      Source: 'GoAffPro API',
    },
  }));

  for (const [tableKey, records] of [['AFFILIATES_LIVE', affRows], ['AFF_MONTHLY', monthRows]]) {
    const tableId = UK.tables[tableKey];
    if (!tableId) { console.warn(`  (no ${tableKey} table — skipped)`); continue; }
    const { written } = await commitTable(prisma, {
      baseKey: 'UK', tableKey, baseId, tableId,
      records, replace: true, source: 'goaffpro-pull',
    });
    console.log(`\nUK.${tableKey.padEnd(18)} ${written} rows`);
  }

  // Fold the latest month into the cost model as an ACTUAL cost.
  const latest = monthRows[monthRows.length - 1];
  const latestMonth = latest?.fields.Month;
  const costRow = {
    recordId: 'affiliate_commission',
    fields: {
      Key: 'affiliate_commission',
      Label: 'Affiliate commission',
      Value: latest ? latest.fields['Commission (£)'] : '',
      Unit: '£/month',
      Source: 'GoAffPro API',
      Status: 'ACTUAL',
      Note: `Commission on referred orders in ${latestMonth}, read live from GoAffPro. Blended rate ${r2(blended)}% across ${orders.length} orders since inception, which makes affiliates the most expensive acquisition channel the business runs.`,
      'Last Updated': today(),
    },
  };
  const existing = (await prisma.$queryRaw`
    SELECT "recordId", "fields"::text AS f FROM "AirtableRecord"
    WHERE "baseId" = ${baseId} AND "tableId" = ${UK.tables.COST_MODEL}`)
    .map(r => ({ recordId: r.recordId, fields: JSON.parse(r.f) }))
    .filter(r => r.recordId !== 'affiliate_commission');

  await commitTable(prisma, {
    baseKey: 'UK', tableKey: 'COST_MODEL',
    baseId, tableId: UK.tables.COST_MODEL,
    records: [...existing, costRow], replace: true, source: 'goaffpro-pull',
  });
  console.log(`UK.COST_MODEL      affiliate commission = £${costRow.fields.Value} (${latestMonth}), now ACTUAL`);

  await prisma.$disconnect();
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.error('\n' + e.message); process.exit(1); });
