/**
 * GET /api/search?q= — one search across everything the OS holds.
 *
 * The mirror stores every record's fields as a JSON document, so a single
 * text match over that document reaches every table at once without needing to
 * know what any of them contain. That is the whole point: the OS spans twelve
 * bases and a hundred tables, and remembering which one holds a thing is
 * exactly the work a search is supposed to remove.
 *
 * Three characters minimum. Below that the result set is everything, which is
 * not a search, and the query is expensive for no benefit.
 *
 * Auth: middleware.js gates every /api/* route behind the kb-auth cookie.
 */
import { getPrisma, isConfigured } from '../../lib/prisma';
import { BASES } from '../../lib/airtable-tables';

const MIN = 3;
const LIMIT = 40;

/** baseId+tableId -> { baseKey, tableKey, label, href }, built once per process. */
let index = null;
function tableIndex() {
  if (index) return index;
  index = new Map();
  for (const [baseKey, base] of Object.entries(BASES)) {
    for (const [tableKey, tableId] of Object.entries(base.tables || {})) {
      index.set(`${base.defaultBaseId}:${tableId}`, {
        baseKey,
        tableKey,
        label: `${base.label || baseKey} · ${tableKey.replace(/_/g, ' ').toLowerCase()}`,
        // Deep-link to the region; the table is named on the result so the
        // destination is never a surprise.
        href: base.href || `/${baseKey.toLowerCase()}`,
      });
    }
  }
  return index;
}

/**
 * The most useful thing to show for a record, without knowing its schema.
 * Tries the fields that tend to be titles, then falls back to the first
 * string that reads like a name rather than an id.
 */
function titleOf(fields) {
  const named = ['Task', 'Title', 'Name', 'Product Name', 'Order Number',
                 'Campaign', 'Subject', 'Customer Name', 'SKU', 'Key'];
  for (const k of named) {
    if (typeof fields[k] === 'string' && fields[k].trim()) return fields[k].trim();
  }
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string' && v.trim().length > 2 && !/id$/i.test(k)) return v.trim();
  }
  return 'Untitled record';
}

/** The matching text with a little context either side, for the result line. */
function snippet(fields, q) {
  const lower = q.toLowerCase();
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v !== 'string') continue;
    const at = v.toLowerCase().indexOf(lower);
    if (at === -1) continue;
    const from = Math.max(0, at - 30);
    return {
      field: k,
      text: (from > 0 ? '…' : '') + v.slice(from, at + q.length + 50).trim() +
            (at + q.length + 50 < v.length ? '…' : ''),
    };
  }
  return null;
}

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim();
  if (q.length < MIN) {
    return res.status(200).json({ ok: true, q, results: [], tooShort: true });
  }
  if (!isConfigured()) return res.status(500).json({ error: 'No database configured' });

  try {
    const prisma = getPrisma();
    // Parameterised, so the term is never concatenated into SQL. `fields::text`
    // matches the whole document, which is what makes one query cover every
    // table rather than one query per table.
    // Deliberately over-fetch. Ordering purely by recency let one big table
    // (orders, always the freshest) fill the page and bury the single matching
    // task, which is usually the thing being looked for.
    const raw = await prisma.$queryRaw`
      SELECT "baseId", "tableId", "recordId", "fields", "syncedAt"
      FROM "AirtableRecord"
      WHERE "fields"::text ILIKE ${'%' + q + '%'}
      ORDER BY "syncedAt" DESC
      LIMIT ${LIMIT * 4}
    `;

    // Round-robin across tables, so every table that matched is represented
    // before any table gets a second row.
    const byTable = new Map();
    for (const r of raw) {
      const k = `${r.baseId}:${r.tableId}`;
      if (!byTable.has(k)) byTable.set(k, []);
      byTable.get(k).push(r);
    }
    const queues = [...byTable.values()];
    const rows = [];
    for (let round = 0; rows.length < LIMIT; round++) {
      let took = false;
      for (const qu of queues) {
        if (qu[round]) { rows.push(qu[round]); took = true; }
        if (rows.length >= LIMIT) break;
      }
      if (!took) break;
    }

    const idx = tableIndex();
    const results = rows.map(r => {
      const where = idx.get(`${r.baseId}:${r.tableId}`);
      const fields = r.fields || {};
      return {
        id: r.recordId,
        title: titleOf(fields),
        snippet: snippet(fields, q),
        where: where ? where.label : 'Unmapped table',
        href: where ? where.href : null,
        syncedAt: r.syncedAt,
      };
    });

    return res.status(200).json({
      ok: true, q, results,
      // Say when the list is capped rather than implying it is everything.
      capped: raw.length >= LIMIT * 4,
    });
  } catch (err) {
    console.error('[api/search]', err.message);
    return res.status(500).json({ error: 'Search failed', detail: err.message });
  }
}
