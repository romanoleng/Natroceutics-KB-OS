#!/usr/bin/env node
/**
 * Pull Klaviyo into the OS: lists, flows, campaigns and attributed revenue.
 *
 * Run once KLAVIYO_API_KEY is in place:
 *   node --env-file-if-exists=.env.local scripts/klaviyo-pull.js
 *   node --env-file-if-exists=.env.local scripts/klaviyo-pull.js --region=ME
 *
 * Writes OS-native tables (os:*-klaviyo-*) so the Airtable sync cannot clobber
 * them. ME.KLAVIYO already holds 6 hand-written flow designs from Gamma Waves;
 * that stays as the plan of record, and this is the measured reality beside it.
 *
 * Attributed revenue writes null rather than 0 when the Placed Order metric
 * cannot be read: a channel that earned nothing and a channel we cannot measure
 * must never look the same.
 */
const { getPrisma, isConfigured } = require('../lib/prisma');
const { commitTable } = require('../lib/mirror-write');
const { BASES, resolveBaseId } = require('../lib/airtable-tables');
const klaviyo = require('../lib/klaviyo');

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || null;
const today = () => new Date().toISOString().slice(0, 10);

async function main() {
  const region = (arg('region') || 'UK').toUpperCase();
  const base = BASES[region];
  if (!base) { console.error(`Unknown region "${region}"`); return 1; }
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }

  if (!klaviyo.isConfigured()) {
    console.error(
      'KLAVIYO_API_KEY is not set.\n\n' +
      '  Klaviyo → Settings → Account → API Keys → Create Private API Key\n' +
      '  Read-only scopes are enough: Lists, Flows, Campaigns, Metrics, Profiles.\n\n' +
      '  npx vercel env add KLAVIYO_API_KEY production\n' +
      '  npx vercel env pull .env.local\n'
    );
    return 1;
  }

  const prisma = getPrisma();
  const baseId = resolveBaseId(base.envVar);
  const tableFor = k => base.tables[k];

  console.log(`Pulling Klaviyo for ${region}…\n`);

  const [lists, flows, campaigns, flowPerf, campPerf] = await Promise.all([
    klaviyo.getLists().catch(e => { console.warn('lists:', e.message); return []; }),
    klaviyo.getFlows().catch(e => { console.warn('flows:', e.message); return []; }),
    klaviyo.getCampaigns().catch(e => { console.warn('campaigns:', e.message); return []; }),
    klaviyo.getValueReport('flow').catch(e => { console.warn('flow perf:', e.message); return []; }),
    klaviyo.getValueReport('campaign').catch(e => { console.warn('campaign perf:', e.message); return []; }),
  ]);

  // Attach measured performance to the flow/campaign records by id, so the
  // panel shows what each one EARNED rather than only that it exists.
  const perfBy = rows => new Map(rows.map(r => [r.id, r]));
  const fp = perfBy(flowPerf), cp = perfBy(campPerf);
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const pctOf = v => (v == null ? '' : Math.round(Number(v) * 1000) / 10);
  const flowRevenue = flowPerf.reduce((s, f) => s + (Number(f.revenue) || 0), 0);
  const campRevenue = campPerf.reduce((s, c) => s + (Number(c.revenue) || 0), 0);
  console.log(`flow revenue (12mo):     £${r2(flowRevenue)} across ${flowPerf.length} flows`);
  console.log(`campaign revenue (12mo): £${r2(campRevenue)} across ${campPerf.length} campaigns`);

  const since = `${new Date().getFullYear()}-01-01T00:00:00`;
  const until = `${today()}T00:00:00`;
  const revenue = await klaviyo.getOrderMetric(since, until)
    .catch(e => { console.warn('revenue:', e.message); return null; });

  const live = flows.filter(f => String(f.status).toLowerCase() === 'live' && !f.archived);
  console.log(`lists:     ${lists.length}`);
  console.log(`flows:     ${flows.length} (${live.length} live)`);
  console.log(`campaigns: ${campaigns.length}`);
  console.log(`revenue:   ${revenue ? revenue.length + ' months' : 'NOT MEASURABLE (metric unavailable)'}`);

  const jobs = [
    ['KLAVIYO_LISTS', lists.map(l => ({
      recordId: `kl:${l.id}`.slice(0, 32),
      fields: {
        List: l.name, Profiles: l.profiles ?? '', Created: l.created ? String(l.created).slice(0, 10) : '',
        Source: 'Klaviyo API', 'Last Updated': today(),
      },
    }))],
    ['KLAVIYO_FLOWS', flows.map(f => ({
      recordId: `kf:${f.id}`.slice(0, 32),
      fields: {
        Flow: f.name, Status: f.status || '', Trigger: f.trigger || '',
        Archived: f.archived ? 'Yes' : '',
        Updated: f.updated ? String(f.updated).slice(0, 10) : '',
        Recipients: fp.get(f.id)?.recipients ?? '',
        'Open Rate %': pctOf(fp.get(f.id)?.openRate),
        'Click Rate %': pctOf(fp.get(f.id)?.clickRate),
        Conversions: fp.get(f.id)?.conversions ?? '',
        'Revenue (£)': fp.has(f.id) ? r2(fp.get(f.id).revenue) : '',
        Source: 'Klaviyo API', 'Last Updated': today(),
      },
    }))],
    ['KLAVIYO_CAMPAIGNS', campaigns.map(c => ({
      recordId: `kc:${c.id}`.slice(0, 32),
      fields: {
        Campaign: c.name, Status: c.status || '',
        Sent: c.sent ? String(c.sent).slice(0, 10) : '',
        Created: c.created ? String(c.created).slice(0, 10) : '',
        Recipients: cp.get(c.id)?.recipients ?? '',
        'Open Rate %': pctOf(cp.get(c.id)?.openRate),
        'Click Rate %': pctOf(cp.get(c.id)?.clickRate),
        Conversions: cp.get(c.id)?.conversions ?? '',
        'Revenue (£)': cp.has(c.id) ? r2(cp.get(c.id).revenue) : '',
        Source: 'Klaviyo API', 'Last Updated': today(),
      },
    }))],
  ];

  if (revenue) {
    // The aggregate can return the same month more than once (one row per
    // bucket boundary). Upserting duplicates in a single statement is a hard
    // Postgres error, so fold them here rather than letting the write fail.
    const byMonth = new Map();
    for (const r of revenue) {
      const cur = byMonth.get(r.month) || { month: r.month, revenue: 0, orders: 0, seen: false };
      if (r.revenue != null) { cur.revenue += Number(r.revenue) || 0; cur.seen = true; }
      if (r.orders != null) { cur.orders += Number(r.orders) || 0; cur.seen = true; }
      byMonth.set(r.month, cur);
    }
    const merged = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
    jobs.push(['KLAVIYO_REVENUE', merged.map(r => ({
      recordId: `kr:${r.month}`,
      fields: {
        Month: r.month,
        'Order Value (£)': r.seen ? Math.round(r.revenue * 100) / 100 : '',
        'Orders Recorded': r.seen ? r.orders : '',
        Source: 'Klaviyo Placed Order metric (ALL orders, not email-attributed)',
        'Last Updated': today(),
      },
    }))]);
  }

  for (const [tableKey, records] of jobs) {
    const tableId = tableFor(tableKey);
    if (!tableId) { console.warn(`  (${region} has no ${tableKey} table — skipped)`); continue; }
    const { written } = await commitTable(prisma, {
      baseKey: region, tableKey, baseId, tableId,
      records, replace: true, source: 'klaviyo-pull',
    });
    console.log(`\n${region}.${tableKey.padEnd(20)} ${written} rows`);
  }

  await prisma.$disconnect();
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.error('\n' + e.message); process.exit(1); });
