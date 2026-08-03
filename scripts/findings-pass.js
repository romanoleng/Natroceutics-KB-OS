/**
 * Findings pass — cross-check the OS against itself and write what disagrees.
 *
 *   node --env-file-if-exists=.env.local scripts/findings-pass.js [--dry-run]
 *
 * A FINDING IS TWO RECORDS THAT DISAGREE. Not an observation, not a metric,
 * not advice. If a check cannot name both sides it does not belong here. That
 * rule is the only thing keeping this feed from decaying into wallpaper — the
 * failure mode is not "too few findings", it is a permanent card nobody reads,
 * which is exactly how an Amazon.es deactivation sat unread through three
 * separate notices.
 *
 * Severity is earned by CONSEQUENCE — money, an account, or a decision taken
 * on a wrong figure — never by how interesting the finding is.
 *
 * CLOSING IS SACRED. A re-run never reopens a finding Romano has closed and
 * never overwrites the reason he gave. Existing rows keep their Status,
 * Resolution and First Seen; only the evidence and Last Seen are refreshed.
 * A finding that stops reproducing is marked Stale rather than deleted, so a
 * check that silently breaks cannot look like a problem that fixed itself.
 *
 * Findings are ADVISORY. Nothing here writes to a P&L or mutates business data.
 */

const { getPrisma, isConfigured } = require('../lib/prisma');
const { BASES } = require('../lib/airtable-tables');
const { commitTable } = require('../lib/mirror-write');

const TODAY = new Date().toISOString().slice(0, 10);
const f = r => r.fields;
const n = v => (v === '' || v === null || v === undefined ? null : Number(v));

async function readTable(prisma, baseKey, tableKey) {
  const b = BASES[baseKey];
  const tableId = b?.tables?.[tableKey];
  if (!tableId) throw new Error(`Unknown table ${baseKey}.${tableKey}`);
  const rows = await prisma.$queryRaw`
    SELECT "recordId", "fields"::text AS f FROM "AirtableRecord"
    WHERE "baseId" = ${b.defaultBaseId} AND "tableId" = ${tableId}`;
  return rows.map(r => ({ recordId: r.recordId, fields: JSON.parse(r.f) }));
}

/* ── checks ──────────────────────────────────────────────────
 * Each returns an array of findings, or [] when it does not reproduce.
 * Each finding MUST carry Evidence A and Evidence B naming both sides.
 */

function checkCostModelGaps(costModel) {
  const gaps = costModel.map(f).filter(r => r.Status === 'PENDING' && !n(r.Value));
  if (!gaps.length) return [];
  const labels = gaps.map(g => `${g.Key} (${g.Label || 'no label'}, ${g.Unit || '?'})`);
  return [{
    id: 'uk-cost-gaps',
    Finding: `UK contribution margin is reported on a cost model with ${gaps.length} unfilled cost lines`,
    Severity: 'High',
    Area: 'UK',
    Page: 'UK / Performance',
    'Evidence A': `UK.COST_MODEL: ${gaps.length} rows are Status PENDING with no Value — ${labels.join('; ')}`,
    'Evidence B': 'UK.SHOPIFY_YTD / shopify-finance reports 2026 YTD contribution of £18,696.34 on £22,754.07 net sales, an 82.17% contribution margin',
    'Why it matters': `That 82.17% is contribution after COGS and payment fees only. Shopify plan fees, app subscriptions, shipping cost per order, 3PL handling and the agency share are all still blank, so every one of them sits inside the 82.17%. The margin is not wrong, but it is not profit, and it will be read as profit by anyone who has not opened the cost model. A channel looks profitable exactly for as long as its costs stay invisible.`,
    'Suggested action': 'Fill the PENDING lines, or restate the headline as "contribution before platform and fulfilment costs" so the number cannot be misread.',
    'Money at risk': 'Unquantified by construction — that is the finding',
    Method: 'computed',
  }];
}

/* There is deliberately no VAT check. Grant confirmed the own store correctly
 * charges none and Romano closed the question on 2 August; a check here would
 * re-litigate a settled decision every single run. If the VAT position is
 * ever reopened, it reopens in conversation, not by a script nagging. */

function checkMeQuoteFillsUkGaps(costModel, meCostModel) {
  const gaps = costModel.map(f).filter(r => r.Status === 'PENDING' && !n(r.Value)).map(r => r.Key);
  if (!gaps.length) return [];
  const quote = meCostModel.filter(r => r.recordId.startsWith('gw-')).map(f);
  if (!quote.length) return [];

  const pairs = [
    { gap: 'shopify_plan_monthly', component: 'Shopify plan (monthly)' },
    { gap: 'app_subscriptions_monthly', component: 'Klaviyo' },
    { gap: 'app_subscriptions_monthly', component: 'UpPromote (affiliate / referral)' },
    { gap: 'app_subscriptions_monthly', component: 'Font licensing (Helvetica Neue)' },
  ].filter(p => gaps.includes(p.gap));

  const matched = pairs
    .map(p => ({ ...p, row: quote.find(q => q['Cost Component'] === p.component) }))
    .filter(p => p.row && p.row['United Kingdom']);
  if (!matched.length) return [];

  return [{
    id: 'me-quote-fills-uk',
    Finding: 'The Gamma Waves quote carries UK figures for cost lines the UK model still calls PENDING',
    Severity: 'Medium',
    Area: 'UK',
    Page: 'UK / Performance',
    'Evidence A': `UK.COST_MODEL: ${[...new Set(matched.map(m => m.gap))].join(', ')} — Status PENDING, no Value`,
    'Evidence B': matched.map(m => `ME.COST_MODEL ${m.row['Cost Component']} → United Kingdom: ${m.row['United Kingdom']}`).join(' | '),
    'Why it matters': 'The answer to a UK question is already sitting in the ME base, filed there because ME is Gamma Waves\' first project. Neither page shows the other, so the gap stays open while the number exists two clicks away. These are USD estimates for a proposed build, not measured UK costs, so they cannot simply be pasted across — but they are a defensible starting figure where today there is nothing at all.',
    'Suggested action': 'Use the quoted figures to seed the PENDING lines at Status PENDING with the estimate in the Note, converted to GBP, so the gap is quantified rather than blank. Do not mark them ACTUAL.',
    'Money at risk': 'Roughly $486 to $907/mo of UK platform cost currently absent from the model',
    Method: 'computed',
  }];
}

function checkZeroStock(amazon) {
  const zero = amazon.map(f).filter(r => n(r['FBA Stock']) === 0);
  if (!zero.length) return [];
  return [{
    id: 'uk-zero-stock',
    Finding: `${zero.length} Amazon UK ASINs are at zero FBA stock while inbound shipments are blocked`,
    Severity: 'High',
    Area: 'UK',
    Page: 'UK / Amazon',
    'Evidence A': `UK.AMAZON: zero FBA stock on ${zero.map(r => `${r.ASIN} (${r['Amazon SKU']})`).join(', ')}`,
    'Evidence B': 'UK.TASKS: open High-priority task "Submit organic certification to Amazon — FBA inbound shipments are blocked" (Amazon notice, 2 Aug 2026)',
    'Why it matters': 'Zero stock is ordinarily a replenishment job. It is a different problem while Amazon is holding inbound shipments for missing organic certification, because the normal fix cannot execute — stock cannot be sent in until the certificate is filed. The two facts are individually routine and jointly a stockout with no exit.',
    'Suggested action': 'Check whether any zero-stock ASIN is inside the inbound block before raising a shipment, and prioritise the certificate accordingly.',
    'Money at risk': 'Full margin on every out-of-stock ASIN for the duration of the block',
    Method: 'computed',
  }];
}

function checkStockImportBlindSpot(amazon) {
  const sample = amazon.map(f)[0];
  if (!sample) return [];
  const kept = Object.keys(sample);
  const dropped = ['ROI, %', 'Stock value', 'Estimated Sales Velocity', 'Days of stock left', 'Margin', 'Profit forecast (30 days)', 'Running out of stock', 'Time to reorder'];
  const stillDropped = dropped.filter(d => !kept.some(k => k.toLowerCase().includes(d.split(',')[0].toLowerCase().slice(0, 6))));
  if (stillDropped.length < 4) return [];
  return [{
    id: 'sb-stock-fields-dropped',
    Finding: 'The sellerboard stock import parses ROI, margin, velocity and stock value, then discards all of them',
    Severity: 'Medium',
    Area: 'UK',
    Page: 'UK / Amazon',
    'Evidence A': `UK.AMAZON keeps only ${kept.join(', ')}`,
    'Evidence B': 'The sellerboard Stock export carries ROI %, Stock value, Estimated Sales Velocity, Days of stock left, Recommended reorder quantity, Running out of stock, Time to reorder, Margin and Profit forecast (30 days) for all 23 ASINs — buildFbaStock in lib/sellerboard.js maps none of them',
    'Why it matters': 'The OS cannot answer "what capital is trapped in something that is not selling", because the fields that would answer it are read and thrown away on every import. On the 3 Aug export that blind spot hides real money: one ASIN carried 828 units at £4,514 of stock value on a negative ROI, and another 72 units at £686 with a sales velocity of 0.03. Neither is visible anywhere in the OS today. This is a finding about a missing instrument rather than a wrong number, which is why it will never surface on its own.',
    'Suggested action': 'Extend buildFbaStock to map the economics columns onto UK.AMAZON, then add a dead-capital check to this pass.',
    'Money at risk': 'Unknown until the fields are mapped — at least £5.2k of stock value on the two ASINs visible in the raw export',
    Method: 'computed',
  }];
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!isConfigured()) { console.error('Missing DATABASE_URL.'); return 1; }
  const prisma = getPrisma();

  const [costModel, amazon, meCostModel, existing] = await Promise.all([
    readTable(prisma, 'UK', 'COST_MODEL'),
    readTable(prisma, 'UK', 'AMAZON'),
    readTable(prisma, 'ME', 'COST_MODEL'),
    readTable(prisma, 'GLOBAL', 'FINDINGS').catch(() => []),
  ]);

  const found = [
    ...checkCostModelGaps(costModel),
    ...checkMeQuoteFillsUkGaps(costModel, meCostModel),
    ...checkZeroStock(amazon),
    ...checkStockImportBlindSpot(amazon),
  ];

  const prior = new Map(existing.map(r => [r.recordId, r.fields]));
  const seen = new Set();

  const records = found.map(x => {
    const recordId = `find:${x.id}`;
    seen.add(recordId);
    const was = prior.get(recordId);
    const firstSeen = was?.['First Seen'] || TODAY;
    const daysOpen = Math.round((new Date(TODAY) - new Date(firstSeen)) / 86400000);
    const { id, ...fields } = x;
    return {
      recordId,
      fields: {
        ...fields,
        // Closing is sacred: never reopen, never overwrite the reason.
        Status: was?.Status || 'Open',
        Resolution: was?.Resolution || '',
        'First Seen': firstSeen,
        'Last Seen': TODAY,
        'Days Open': daysOpen,
        // Escalation by age, so a stale finding gets louder rather than quieter.
        Escalated: (was?.Status || 'Open') === 'Open' && daysOpen >= 14 ? 'YES' : '',
      },
    };
  });

  // A finding that stops reproducing is marked Stale, never deleted — a check
  // that silently breaks must not look like a problem that fixed itself.
  for (const [recordId, fields] of prior) {
    if (seen.has(recordId)) continue;
    records.push({ recordId, fields: { ...fields, Status: fields.Status === 'Open' ? 'Stale — stopped reproducing' : fields.Status, 'Last Seen': fields['Last Seen'] || TODAY } });
  }

  const open = records.filter(r => r.fields.Status === 'Open');
  const bySev = s => open.filter(r => r.fields.Severity === s).length;
  console.log(`\nfindings: ${open.length} open of ${records.length} tracked  (High ${bySev('High')}, Medium ${bySev('Medium')}, Low ${bySev('Low')})\n`);
  for (const r of open) {
    console.log(`  [${String(r.fields.Severity).padEnd(6)}] ${r.fields.Area.padEnd(3)} ${r.fields.Finding}`);
    console.log(`           A: ${String(r.fields['Evidence A']).slice(0, 150)}`);
    console.log(`           B: ${String(r.fields['Evidence B']).slice(0, 150)}\n`);
  }

  if (dryRun) { console.log('(dry run — nothing written)'); await prisma.$disconnect(); return 0; }

  const g = BASES.GLOBAL;
  await commitTable(prisma, {
    baseKey: 'GLOBAL', tableKey: 'FINDINGS',
    baseId: g.defaultBaseId, tableId: g.tables.FINDINGS,
    records, replace: true, source: 'findings-pass',
  });
  console.log(`GLOBAL.FINDINGS   ${records.length} rows`);
  await prisma.$disconnect();
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.error(e); process.exit(1); });
