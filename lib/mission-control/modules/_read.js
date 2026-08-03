/**
 * Shared read helper for Mission Control modules.
 *
 * Goes straight to Postgres rather than through fetchFromMirror. That helper
 * gates on whether a table ever recorded a successful SyncRun, which means a
 * readable table with rows can come back null — and a module that treats null
 * as "no data" would report EMPTY for something that is actually there. On this
 * surface that distinction is the entire point, so we ask the database.
 *
 * A failure THROWS rather than returning []. safeLoad turns it into an ERROR
 * state, which is the honest answer; swallowing it would produce a confident
 * empty widget over a broken query.
 *
 * ── Why the cache ─────────────────────────────────────────────────────────
 *
 * Every module is asked three separate questions — its widget, its attention
 * items and its health — and each wants the same tables. Answered naively that
 * was fifteen queries from the tasks module alone for data that had not changed
 * in between. The cache collapses those into one read per table per render.
 *
 * The query itself is deliberately the same plain per-table form every other
 * page in the OS uses. A row-constructor `IN` over (baseId, tableId) pairs was
 * tried and measured far SLOWER, so the clever version was removed: this path
 * is on the critical render of the page Romano opens first, and predictable
 * beats ingenious.
 *
 * The TTL is deliberately tiny. It exists to remove duplicate work inside one
 * render, not to serve stale data: on a surface built to be trusted, quietly
 * reporting a world that has already moved on is worse than being slow.
 */
const { getPrisma, isConfigured } = require('../../prisma');
const { BASES, resolveBaseId } = require('../../airtable-tables');

const TTL_MS = 10_000;
const cache = new Map();      // "baseId::tableId" → { at, promise }

function coords(baseKey, tableKey) {
  const base = BASES[baseKey];
  const tableId = base?.tables?.[tableKey];
  if (!base || !tableId) throw new Error(`Unknown table ${baseKey}.${tableKey}`);
  const baseId = resolveBaseId(base.envVar) || base.defaultBaseId;
  if (!baseId) throw new Error(`No base id for ${baseKey}`);
  return { baseId, tableId };
}

async function query(baseId, tableId) {
  const rows = await getPrisma().$queryRaw`
    SELECT "recordId", "fields"::text AS f
    FROM "AirtableRecord"
    WHERE "baseId" = ${baseId} AND "tableId" = ${tableId}`;
  return rows.map(r => {
    let fields;
    try { fields = JSON.parse(r.f); } catch { fields = {}; }
    return { recordId: r.recordId, ...fields };
  });
}

async function readTable(baseKey, tableKey) {
  if (!isConfigured()) throw new Error('No database configured');
  const { baseId, tableId } = coords(baseKey, tableKey);
  const key = `${baseId}::${tableId}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;

  // Store the in-flight promise, not the result: the three questions run
  // concurrently, so without this they would all miss and fire the same query.
  const promise = query(baseId, tableId);
  cache.set(key, { at: Date.now(), promise });
  // Never cache a failure, or one blip poisons every module for ten seconds.
  promise.catch(() => cache.delete(key));
  return promise;
}

const n = v => (v === '' || v === null || v === undefined ? null : Number(v));
const money = v => (n(v) === null ? '—' : `£${Number(v).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`);

module.exports = { readTable, n, money };
