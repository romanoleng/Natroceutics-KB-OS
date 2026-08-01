#!/usr/bin/env node
/**
 * Shopify UK finance in depth: payouts, fees and a year-to-date P&L.
 *
 *   node --env-file-if-exists=.env.local scripts/shopify-finance-pull.js
 *
 * The point is reconciliation, which is the one thing a revenue dashboard can
 * never do for itself. Shopify Payments deposits real money into the bank on a
 * schedule; the P&L says what the orders were worth. If those two disagree,
 * something is wrong and nobody finds out until a bank statement is read by
 * hand months later.
 *
 * So this stores payouts alongside the P&L and computes the gap per month:
 *
 *   payout gross            what Shopify actually sent
 *   payout fees             what Shopify actually charged
 *   order-derived fees      what we computed from transaction records
 *   variance                the two fee figures, subtracted
 *
 * A variance near zero is the strongest evidence the finance engine is right.
 * A variance that grows is the earliest warning that it is not.
 *
 * Payout dates lag order dates (a Friday order pays out the following week), so
 * monthly totals will never tie exactly. That is expected and stated, not
 * smoothed away.
 */
const { getPrisma, isConfigured } = require('../lib/prisma');
const { commitTable } = require('../lib/mirror-write');
const { BASES, resolveBaseId } = require('../lib/airtable-tables');
const { shopifyGraphQL, isConfigured: shopifyReady } = require('../lib/shopify-auth');

const UK = BASES.UK;
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const M = '{ amount currencyCode }';

const PAYOUTS_Q = `query P($after: String) {
  shopifyPaymentsAccount {
    defaultCurrency
    payouts(first: 50, after: $after, sortKey: ISSUED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id status issuedAt
        net ${M} gross ${M}
        summary {
          chargesGross ${M} chargesFee ${M}
          refundsFeeGross ${M} refundsFee ${M}
          adjustmentsGross ${M} adjustmentsFee ${M}
        }
      }
    }
  }
}`;

async function pullPayouts(cap = 30) {
  const out = [];
  let after = null, more = true, pages = 0;
  while (more && pages++ < cap) {
    const d = await shopifyGraphQL(PAYOUTS_Q, { after });
    const acct = d.shopifyPaymentsAccount;
    if (!acct) break;
    out.push(...acct.payouts.nodes);
    ({ hasNextPage: more, endCursor: after } = acct.payouts.pageInfo);
  }
  return out;
}

const amt = m => Number(m?.amount) || 0;

async function main() {
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }
  if (!shopifyReady()) { console.error('Shopify credentials missing.'); return 1; }

  const prisma = getPrisma();
  const baseId = resolveBaseId(UK.envVar);

  const payouts = await pullPayouts();
  console.log(`payouts: ${payouts.length}`);

  const paid = payouts.filter(p => p.status === 'PAID');
  const pending = payouts.filter(p => p.status !== 'PAID');
  console.log(`  ${paid.length} paid, ${pending.length} scheduled or in transit`);

  // Roll payouts up by the month they were ISSUED.
  const byMonth = new Map();
  for (const p of payouts) {
    const m = String(p.issuedAt).slice(0, 7);
    const v = byMonth.get(m) || { count: 0, net: 0, gross: 0, fees: 0, refundFees: 0, adjustments: 0, pendingNet: 0 };
    v.count++;
    v.net += amt(p.net);
    v.gross += amt(p.gross);
    v.fees += amt(p.summary?.chargesFee) + amt(p.summary?.refundsFee) + amt(p.summary?.adjustmentsFee);
    v.refundFees += amt(p.summary?.refundsFeeGross);
    v.adjustments += amt(p.summary?.adjustmentsGross);
    if (p.status !== 'PAID') v.pendingNet += amt(p.net);
    byMonth.set(m, v);
  }

  // The P&L's own fee figure, computed from order transactions.
  const pnl = (await prisma.$queryRaw`
    SELECT "fields"::text AS f FROM "AirtableRecord"
    WHERE "baseId" = ${baseId} AND "tableId" = ${UK.tables.SHOPIFY_PNL}`)
    .map(r => JSON.parse(r.f));
  const pnlBy = new Map(pnl.map(r => [r.Month, r]));

  const rows = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => {
    const p = pnlBy.get(month) || {};
    const orderFees = Number(p['Payment Fees (£)']) || null;
    const variance = orderFees == null ? null : r2(v.fees - orderFees);
    return {
      recordId: `payout:${month}`,
      fields: {
        Month: month,
        Payouts: v.count,
        'Paid Out (£)': r2(v.net),
        'Gross (£)': r2(v.gross),
        'Shopify Fees (£)': r2(v.fees),
        'Refund Fees (£)': r2(v.refundFees),
        'Adjustments (£)': r2(v.adjustments),
        'Still Scheduled (£)': r2(v.pendingNet),
        // Reconciliation: our computed fees against what Shopify charged.
        'Fees per P&L (£)': orderFees ?? '',
        'Fee Variance (£)': variance ?? '',
        'Net Sales per P&L (£)': p['Net Sales (£)'] ?? '',
        Basis: 'Payouts are grouped by issue date. Orders pay out days later, so a month of payouts never equals a month of sales; the fee variance is the meaningful comparison.',
        Source: 'Shopify Payments API',
        'Last Updated': today(),
      },
    };
  });

  console.log('\nMONTH     PAYOUTS   PAID OUT     SHOPIFY FEES   P&L FEES   VARIANCE');
  for (const r of rows) {
    const f = r.fields;
    console.log(
      f.Month.padEnd(9),
      String(f.Payouts).padStart(6),
      ('£' + f['Paid Out (£)']).padStart(11),
      ('£' + f['Shopify Fees (£)']).padStart(14),
      (f['Fees per P&L (£)'] === '' ? '—' : '£' + f['Fees per P&L (£)']).padStart(11),
      (f['Fee Variance (£)'] === '' ? '—' : '£' + f['Fee Variance (£)']).padStart(10)
    );
  }

  const { written } = await commitTable(prisma, {
    baseKey: 'UK', tableKey: 'SHOPIFY_PAYOUTS',
    baseId, tableId: UK.tables.SHOPIFY_PAYOUTS,
    records: rows, replace: true, source: 'shopify-finance',
  });
  console.log(`\nUK.SHOPIFY_PAYOUTS  ${written} rows`);

  /* ── year to date ─────────────────────────────────────────── */
  const year = new Date().getFullYear();
  const ytd = pnl.filter(r => String(r.Month).startsWith(String(year)))
    .sort((a, b) => a.Month.localeCompare(b.Month));
  const sum = k => r2(ytd.reduce((s, r) => s + (Number(r[k]) || 0), 0));

  const ytdRow = {
    recordId: `ytd:${year}`,
    fields: {
      Period: `${year} year to date`,
      Months: ytd.length,
      Orders: ytd.reduce((s, r) => s + (Number(r.Orders) || 0), 0),
      'Gross Sales (£)': sum('Gross Sales (£)'),
      'Discounts (£)': sum('Discounts (£)'),
      'Returns (£)': sum('Returns (£)'),
      'Net Sales (£)': sum('Net Sales (£)'),
      'COGS (£)': sum('COGS (£)'),
      'Payment Fees (£)': sum('Payment Fees (£)'),
      'Contribution (£)': sum('Contribution (£)'),
      'Shipping Charged (£)': sum('Shipping Charged (£)'),
      // Weighted, not a mean of percentages: a £100 month and a £4,000 month
      // must not count equally.
      'COGS Coverage %': (() => {
        const net = ytd.reduce((s, r) => s + (Number(r['Net Sales (£)']) || 0), 0);
        if (!net) return '';
        return r2(ytd.reduce((s, r) =>
          s + (Number(r['Net Sales (£)']) || 0) * (Number(r['COGS Coverage %']) || 0), 0) / net);
      })(),
      Source: 'Derived from UK.SHOPIFY_PNL',
      'Last Updated': today(),
    },
  };
  const margin = ytdRow.fields['Net Sales (£)']
    ? r2((ytdRow.fields['Contribution (£)'] / ytdRow.fields['Net Sales (£)']) * 100) : '';
  ytdRow.fields['Contribution Margin %'] = margin;

  await commitTable(prisma, {
    baseKey: 'UK', tableKey: 'SHOPIFY_YTD',
    baseId, tableId: UK.tables.SHOPIFY_YTD,
    records: [ytdRow], replace: true, source: 'shopify-finance',
  });

  const y = ytdRow.fields;
  console.log(`\n${year} YEAR TO DATE (${y.Months} months)`);
  console.log(`  orders            ${y.Orders}`);
  console.log(`  net sales         £${y['Net Sales (£)']}`);
  console.log(`  cost of goods     £${y['COGS (£)']}   (covering ${y['COGS Coverage %']}% of revenue)`);
  console.log(`  payment fees      £${y['Payment Fees (£)']}`);
  console.log(`  contribution      £${y['Contribution (£)']}   margin ${margin}%`);
  console.log(`  shipping charged  £${y['Shipping Charged (£)']}`);

  await prisma.$disconnect();
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.error('\n' + e.message); process.exit(1); });
