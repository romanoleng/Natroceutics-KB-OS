#!/usr/bin/env node
/**
 * Subscriptions from live order history — including the recurring revenue that
 * was PENDING until the backfill gave us every order since inception.
 *
 *   node --env-file-if-exists=.env.local scripts/subscriptions-pull.js
 *
 * Recharge writes its state onto Shopify objects, so no Recharge key is needed:
 *   order tag "Subscription First Order"      acquisition
 *   order tag "Subscription Recurring Order"  retention, and the revenue that
 *                                             actually recurs
 *   lineItems.sellingPlan                     cadence and discount
 *   customer tags                             active / inactive / card declined
 *
 * The distinction that matters: first-order revenue is acquisition and happens
 * once, recurring revenue is the annuity. Reporting them together flatters the
 * channel, so they are counted separately here.
 */
const { getPrisma, isConfigured } = require('../lib/prisma');
const { commitTable } = require('../lib/mirror-write');
const { BASES, resolveBaseId } = require('../lib/airtable-tables');
const { shopifyGraphQL, isConfigured: shopifyReady } = require('../lib/shopify-auth');

const UK = BASES.UK;
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const TODAY = new Date();
const BILLING_WINDOW = 45;

const Q = `query S($after: String) {
  orders(first: 50, after: $after, query: "tag:Subscription", sortKey: PROCESSED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      name processedAt tags cancelledAt test
      currentSubtotalPriceSet { shopMoney { amount } }
      totalDiscountsSet { shopMoney { amount } }
      customer { id displayName numberOfOrders tags amountSpent { amount } createdAt }
      lineItems(first: 10) { nodes { sku quantity sellingPlan { name } } }
    }
  }
}`;

async function pullSubscriptionOrders() {
  const out = [];
  let after = null, more = true, dropped = 0;
  while (more) {
    const d = await shopifyGraphQL(Q, { after });
    for (const o of d.orders.nodes) {
      if (o.cancelledAt || o.test) { dropped++; continue; }
      out.push(o);
    }
    ({ hasNextPage: more, endCursor: after } = d.orders.pageInfo);
  }
  if (dropped) console.log(`  (excluded ${dropped} cancelled or test)`);
  return out;
}

const money = m => Number(m?.shopMoney?.amount) || 0;
const daysSince = iso => Math.round((TODAY - new Date(iso)) / 86400000);

async function main() {
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }
  if (!shopifyReady()) { console.error('Shopify credentials missing.'); return 1; }

  const prisma = getPrisma();
  const baseId = resolveBaseId(UK.envVar);

  const orders = await pullSubscriptionOrders();
  console.log(`subscription orders: ${orders.length}`);

  const monthly = new Map();
  const customers = new Map();
  const skus = new Map();

  for (const o of orders) {
    const month = String(o.processedAt).slice(0, 7);
    const tags = (o.tags || []).map(t => t.toLowerCase());
    const isFirst = tags.some(t => t.includes('first order'));
    const isRecurring = tags.some(t => t.includes('recurring'));
    const value = money(o.currentSubtotalPriceSet);

    const m = monthly.get(month) || { first: 0, recurring: 0, firstRev: 0, recurringRev: 0 };
    if (isRecurring) { m.recurring++; m.recurringRev += value; }
    else if (isFirst) { m.first++; m.firstRev += value; }
    monthly.set(month, m);

    const c = o.customer;
    if (c?.id) {
      const rec = customers.get(c.id) || {
        name: c.displayName || '(unknown)',
        tags: (c.tags || []).map(t => String(t)),
        spent: Number(c.amountSpent?.amount) || 0,
        since: c.createdAt ? String(c.createdAt).slice(0, 10) : '',
        cycles: 0, lastOrder: '', firstOrder: '',
      };
      if (isRecurring) rec.cycles++;
      const d = String(o.processedAt).slice(0, 10);
      if (!rec.firstOrder || d < rec.firstOrder) rec.firstOrder = d;
      if (d > rec.lastOrder) rec.lastOrder = d;
      customers.set(c.id, rec);
    }

    for (const li of o.lineItems?.nodes || []) {
      if (!li.sellingPlan) continue;
      const key = li.sku || '(no sku)';
      const s = skus.get(key) || { units: 0, plan: li.sellingPlan.name, orders: 0 };
      s.units += li.quantity || 0;
      s.orders++;
      skus.set(key, s);
    }
  }

  /* ── monthly: acquisition vs annuity ─────────────────────── */
  const monthRows = [...monthly.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({
    recordId: month,
    fields: {
      Month: month,
      'New Subscribers': v.first,
      'First Order Revenue (£)': r2(v.firstRev),
      'Recurring Orders': v.recurring,
      'Recurring Revenue (£)': r2(v.recurringRev),
      'Total Subscription Revenue (£)': r2(v.firstRev + v.recurringRev),
      'Recurring Share %': (v.firstRev + v.recurringRev)
        ? r2((v.recurringRev / (v.firstRev + v.recurringRev)) * 100) : '',
      Basis: 'First-order revenue is acquisition and happens once; recurring revenue is the annuity. Counted separately on purpose.',
      Source: 'Shopify order tags (Recharge)',
    },
  }));

  console.log('\nMONTH      NEW   FIRST-ORDER    RECURRING   RECURRING REV   SHARE');
  for (const r of monthRows) {
    const f = r.fields;
    console.log(
      f.Month.padEnd(10), String(f['New Subscribers']).padStart(4),
      ('£' + f['First Order Revenue (£)']).padStart(13),
      String(f['Recurring Orders']).padStart(12),
      ('£' + f['Recurring Revenue (£)']).padStart(15),
      (f['Recurring Share %'] === '' ? '—' : f['Recurring Share %'] + '%').padStart(8)
    );
  }

  /* ── customers ───────────────────────────────────────────── */
  const custRows = [...customers.entries()].map(([id, c]) => {
    const lower = c.tags.map(t => t.toLowerCase());
    const declined = lower.some(t => t.includes('declined'));
    const inactive = lower.some(t => t.includes('inactive'));
    const activeTag = lower.some(t => t === 'active subscriber');
    const age = c.lastOrder ? daysSince(c.lastOrder) : null;
    const billing = activeTag && age != null && age <= BILLING_WINDOW;
    return {
      recordId: `sub:${id.split('/').pop()}`.slice(0, 32),
      fields: {
        Customer: c.name,
        Status: declined ? 'CARD DECLINED' : inactive ? 'Churned'
          : billing ? 'Active' : activeTag ? 'Tagged active, not billing' : 'Unknown',
        'Renewals': c.cycles,
        'Lifetime Value (£)': r2(c.spent),
        'Subscribed Since': c.firstOrder || c.since,
        'Last Order': c.lastOrder,
        'Days Since Last Order': age ?? '',
        'Card Declined': declined ? 'Yes' : '',
        Source: 'Shopify customer + order tags',
        'Last Updated': today(),
      },
    };
  });

  const billingNow = custRows.filter(r => r.fields.Status === 'Active').length;
  const stale = custRows.filter(r => r.fields.Status === 'Tagged active, not billing').length;
  const declined = custRows.filter(r => r.fields['Card Declined'] === 'Yes').length;
  const totalRecurring = monthRows.reduce((s, r) => s + r.fields['Recurring Revenue (£)'], 0);

  console.log(`\nsubscribers: ${custRows.length} (${billingNow} billing, ${stale} tagged active but not, ${declined} card declined)`);
  console.log(`recurring revenue since inception: £${r2(totalRecurring)}`);

  const skuRows = [...skus.entries()]
    .sort((a, b) => b[1].units - a[1].units)
    .map(([sku, v]) => ({
      recordId: `subsku:${sku}`.slice(0, 32),
      fields: { SKU: sku, Plan: v.plan, Units: v.units, Orders: v.orders,
                Source: 'Shopify sellingPlan', 'Last Updated': today() },
    }));

  for (const [tableKey, records] of [
    ['SUBS_MONTHLY', monthRows], ['SUBS_CUSTOMERS', custRows], ['SUBS_PRODUCTS', skuRows],
  ]) {
    const { written } = await commitTable(prisma, {
      baseKey: 'UK', tableKey, baseId, tableId: UK.tables[tableKey],
      records, replace: true, source: 'subscriptions-pull',
    });
    console.log(`\nUK.${tableKey.padEnd(16)} ${written} rows`);
  }

  await prisma.$disconnect();
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.error('\n' + e.message); process.exit(1); });
