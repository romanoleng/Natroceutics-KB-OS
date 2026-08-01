#!/usr/bin/env node
/**
 * Pull Mailchimp into the OS — SA's email channel.
 *
 *   node --env-file-if-exists=.env.local scripts/mailchimp-pull.js
 *   node --env-file-if-exists=.env.local scripts/mailchimp-pull.js --region=SA
 *
 * Writes OS-native tables (os:sa-mailchimp-*), so the Airtable sync cannot
 * touch them.
 *
 * Campaign revenue is only populated when the Mailchimp account has ecommerce
 * tracking connected to the store. Where it is absent we write an empty cell,
 * never 0 — an untracked campaign and a campaign that earned nothing are
 * different facts and must not look the same.
 */
const { getPrisma, isConfigured } = require('../lib/prisma');
const { commitTable } = require('../lib/mirror-write');
const { BASES, resolveBaseId } = require('../lib/airtable-tables');
const mailchimp = require('../lib/mailchimp');

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || null;
const today = () => new Date().toISOString().slice(0, 10);
// Mailchimp returns open_rate as a FRACTION on campaigns (0.4208) but as a
// PERCENT on list stats (42.08). Using one converter for both reported 4208.3%.
const fracToPct = v => (v == null ? '' : Math.round(Number(v) * 1000) / 10);
const alreadyPct = v => (v == null ? '' : Math.round(Number(v) * 10) / 10);

async function main() {
  const region = (arg('region') || 'SA').toUpperCase();
  const base = BASES[region];
  if (!base) { console.error(`Unknown region "${region}"`); return 1; }
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }

  if (!mailchimp.isConfigured()) {
    console.error(
      'MAILCHIMP_API_KEY is not set.\n\n' +
      '  Mailchimp → Account & billing → Extras → API keys → Create A Key\n' +
      '  The key ends with its data centre ("…-us14"); the OS reads that from the key.\n\n' +
      '  npx vercel env add MAILCHIMP_API_KEY production\n' +
      '  npx vercel env pull .env.local\n'
    );
    return 1;
  }

  const prisma = getPrisma();
  const baseId = resolveBaseId(base.envVar);
  console.log(`Pulling Mailchimp for ${region}…\n`);

  const [audiences, campaigns, automations] = await Promise.all([
    mailchimp.getAudiences().catch(e => { console.warn('audiences:', e.message); return []; }),
    mailchimp.getCampaigns().catch(e => { console.warn('campaigns:', e.message); return []; }),
    mailchimp.getAutomations().catch(e => { console.warn('automations:', e.message); return []; }),
  ]);

  const members = audiences.reduce((s, a) => s + (a.members || 0), 0);
  const running = automations.filter(a => String(a.status).toLowerCase() === 'sending').length;
  const earning = campaigns.filter(c => Number(c.revenue) > 0).length;

  console.log(`audiences:   ${audiences.length} (${members.toLocaleString('en-GB')} members)`);
  console.log(`campaigns:   ${campaigns.length} sent`);
  console.log(`automations: ${automations.length} (${running} running)`);
  if (campaigns.length && earning === 0) {
    console.log('revenue:     0 of ' + campaigns.length + ' campaigns report any revenue.');
    console.log('             Mailchimp returns 0 (not null) when no store is connected, so this');
    console.log('             almost certainly means ecommerce tracking is not linked rather than');
    console.log('             that the campaigns earned nothing. Verify in Mailchimp before reading');
    console.log('             it as performance.');
  } else {
    console.log(`revenue:     ${earning} of ${campaigns.length} campaigns report revenue`);
  }

  const jobs = [
    ['MAILCHIMP_AUDIENCES', audiences.map(a => ({
      recordId: `mca:${a.id}`.slice(0, 32),
      fields: {
        Audience: a.name, Members: a.members ?? '', Unsubscribed: a.unsubscribed ?? '',
        'Open Rate %': alreadyPct(a.openRate), 'Click Rate %': alreadyPct(a.clickRate),
        'Last Campaign': a.lastSent ? String(a.lastSent).slice(0, 10) : '',
        Created: a.created || '', Source: 'Mailchimp API', 'Last Updated': today(),
      },
    }))],
    ['MAILCHIMP_CAMPAIGNS', campaigns.map(c => ({
      recordId: `mcc:${c.id}`.slice(0, 32),
      fields: {
        Campaign: c.name, Subject: c.subject, Audience: c.audience,
        Sent: c.sent || '', Emails: c.emails ?? '',
        Opens: c.opens ?? '', 'Open Rate %': fracToPct(c.openRate),
        Clicks: c.clicks ?? '', 'Click Rate %': fracToPct(c.clickRate),
        // Empty, not zero, when ecommerce tracking is not connected.
        // 0 here is indistinguishable from 'no store connected'; the panel
        // reads the all-zero case as untracked rather than as a result.
        'Revenue': c.revenue ?? '', 'Orders': c.orders ?? '',
        Source: 'Mailchimp API', 'Last Updated': today(),
      },
    }))],
    ['MAILCHIMP_AUTOMATIONS', automations.map(a => ({
      recordId: `mcf:${a.id}`.slice(0, 32),
      fields: {
        Automation: a.name, Status: a.status || '', Audience: a.audience,
        'Emails Sent': a.emailsSent ?? '', Started: a.started || '',
        Source: 'Mailchimp API', 'Last Updated': today(),
      },
    }))],
  ];

  for (const [tableKey, records] of jobs) {
    const tableId = base.tables[tableKey];
    if (!tableId) { console.warn(`  (${region} has no ${tableKey} table — skipped)`); continue; }
    const { written } = await commitTable(prisma, {
      baseKey: region, tableKey, baseId, tableId,
      records, replace: true, source: 'mailchimp-pull',
    });
    console.log(`\n${region}.${tableKey.padEnd(22)} ${written} rows`);
  }

  await prisma.$disconnect();
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.error('\n' + e.message); process.exit(1); });
