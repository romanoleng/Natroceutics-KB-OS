#!/usr/bin/env node
/**
 * Discover Airtable bases and tables, and report what the OS registry misses.
 *
 * Written after finding on 1 Aug 2026 that six Natroceutics bases existed
 * outside lib/airtable-tables.js. "Are we off Airtable?" cannot be answered by
 * checking the tables we already know about: that only proves we synced what we
 * registered. This checks the other direction.
 *
 *   node --env-file-if-exists=.env.local scripts/discover-bases.js
 *   node --env-file-if-exists=.env.local scripts/discover-bases.js --emit
 *
 * --emit prints ready-to-paste registry blocks for unregistered bases.
 *
 * Uses the Airtable META API, which has its own limit and does not consume the
 * 1,000/month record-API budget. One call per base plus one to list them.
 */
const { BASES, resolveBaseId, realEnv } = require('../lib/airtable-tables');

const KEY = realEnv('AIRTABLE_API_KEY');
const emit = process.argv.includes('--emit');

/** Non-Natroceutics bases: Romano's other ventures, deliberately out of scope. */
const OUT_OF_SCOPE = [
  /finance \/ wealth/i, /family/i, /creativedigital/i, /9styles/i,
  /roms ecosystem/i, /curatedhealth/i,
];

async function api(path) {
  const res = await fetch(`https://api.airtable.com/v0/meta/${path}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.slice(0, 160));
  return res.json();
}

/** TABLE_KEY from a table name: upper snake, emoji and punctuation stripped. */
const toKey = name => String(name)
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .trim().toUpperCase()
  .replace(/\s+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40) || 'UNTITLED';

async function main() {
  if (!KEY) { console.error('AIRTABLE_API_KEY not set.'); return 1; }

  const known = new Map();
  for (const [k, b] of Object.entries(BASES)) known.set(resolveBaseId(b.envVar), k);

  const { bases } = await api('bases');
  const scoped = bases.filter(b => !OUT_OF_SCOPE.some(rx => rx.test(b.name)));

  console.log(`${bases.length} bases visible, ${scoped.length} in Natroceutics scope\n`);

  const missing = [];
  for (const b of scoped) {
    const reg = known.get(b.id);
    let tables = [];
    try { ({ tables } = await api(`bases/${b.id}/tables`)); }
    catch (e) { console.log(`  ${b.name}: could not read (${e.message})`); continue; }

    const deprecated = tables.filter(t => /deprecated/i.test(t.name) || /deprecated/i.test(t.description || ''));
    const live = tables.filter(t => !deprecated.includes(t));

    if (reg) {
      const regTables = Object.keys(BASES[reg].tables).length;
      console.log(`✓ ${reg.padEnd(7)} ${b.name}`);
      console.log(`          ${tables.length} tables upstream, ${regTables} registered`);
      const regIds = new Set(Object.values(BASES[reg].tables));
      const unreg = live.filter(t => !regIds.has(t.id));
      if (unreg.length) {
        console.log(`          ⚠ ${unreg.length} live table(s) NOT registered: ${unreg.map(t => t.name).join(', ')}`);
      }
    } else if (live.length === 0) {
      console.log(`· (skip)  ${b.name}`);
      console.log(`          all ${tables.length} tables deprecated — archive candidate`);
    } else {
      console.log(`✗ MISSING ${b.name}  (${b.id})`);
      console.log(`          ${live.length} live table(s)${deprecated.length ? `, ${deprecated.length} deprecated` : ''}`);
      missing.push({ base: b, live });
    }
    console.log();
  }

  if (!missing.length) { console.log('Every in-scope base is registered.'); return 0; }

  console.log(`\n${missing.length} base(s) need registering.\n`);
  if (!emit) { console.log('Re-run with --emit for paste-ready registry blocks.'); return 0; }

  for (const { base, live } of missing) {
    const key = toKey(base.name).split('_').slice(0, 2).join('_');
    console.log(`/* ── ${base.name} (${base.id}) ── */`);
    console.log(`const ${key}_TABLES = {`);
    for (const t of live) console.log(`  ${toKey(t.name)}: '${t.id}',`);
    console.log(`};\n`);
  }
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.error(e.message); process.exit(1); });
