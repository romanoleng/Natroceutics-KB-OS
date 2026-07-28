/**
 * Read side of the Postgres mirror.
 *
 * lib/airtable.js calls fetchFromMirror() before touching the Airtable API.
 * A null return means "not mirrored / not available" and the caller falls back
 * to a live Airtable request, so:
 *
 *   - an empty database behaves exactly like today (everything hits Airtable)
 *   - a table starts being served from Postgres the moment it is first synced,
 *     which is what makes the region-by-region rollout possible with no code
 *     changes per region
 *   - if Postgres is down, dashboards degrade to live Airtable rather than 500
 *
 * Set DATA_SOURCE=airtable to bypass the mirror entirely (instant rollback
 * without a redeploy).
 */
const { Prisma } = require('@prisma/client');
const { getPrisma, isConfigured } = require('./prisma');
const { deriveUpdatedAt } = require('./airtable-tables');

const MIRROR_DISABLED = () => process.env.DATA_SOURCE === 'airtable';

/* ── "which tables have been synced at least once?" cache ── */
const MIRRORED_TTL_MS = 60_000;
let mirroredSet = null;
let mirroredAt = 0;
let mirroredInflight = null;

async function loadMirroredTables(prisma) {
  const rows = await prisma.syncRun.findMany({
    where: { status: 'ok' },
    distinct: ['baseId', 'tableId'],
    select: { baseId: true, tableId: true },
  });
  return new Set(rows.map(r => `${r.baseId}::${r.tableId}`));
}

async function getMirroredTables(prisma) {
  const now = Date.now();
  if (mirroredSet && now - mirroredAt < MIRRORED_TTL_MS) return mirroredSet;
  if (mirroredInflight) return mirroredInflight;

  mirroredInflight = loadMirroredTables(prisma)
    .then(set => {
      mirroredSet = set;
      mirroredAt = Date.now();
      return set;
    })
    .finally(() => { mirroredInflight = null; });

  return mirroredInflight;
}

/** Drop the cache — used by the sync job so a fresh backfill is visible at once. */
function invalidateMirrorCache() {
  mirroredSet = null;
  mirroredAt = 0;
}

/* ── ORDER BY construction ───────────────────────────────── */
// Sort fields come from lib/airtable.js's own call sites, never from user
// input, but they are still validated and quoted before being interpolated.
const SAFE_FIELD = /^[A-Za-z0-9 _().,&/%+'-]+$/;

function orderByClause(sortField, sortDir) {
  const dir = String(sortDir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  if (!sortField || !SAFE_FIELD.test(sortField)) {
    // No sort field: reproduce Airtable's default view order.
    return '"position" ASC';
  }
  const literal = `'${sortField.replace(/'/g, "''")}'`;
  // COALESCE to '' so blanks sort first ascending / last descending, which is
  // how Airtable orders empty cells. Ties broken by view order for stability.
  return `COALESCE("fields"->>${literal}, '') ${dir}, "position" ASC`;
}

/* ── record hydration ────────────────────────────────────── */
// Must produce the exact shape normaliseRecord() + the _baseId/_tableId
// injection produced, including key order.
function hydrate(row, baseId, tableId) {
  const fields = row.fields || {};
  const { updatedAt, syncSourced } = deriveUpdatedAt(fields);
  const rec = { id: row.recordId, ...fields };
  rec.createdTime = row.createdTime || null;
  rec._updatedAt = updatedAt;
  rec._syncSourced = syncSourced;
  rec._baseId = baseId;
  rec._tableId = tableId;
  return rec;
}

/**
 * @returns {Promise<Array|null>} mirrored records, or null to fall back to Airtable.
 */
async function fetchFromMirror(baseId, tableId, opts = {}) {
  if (MIRROR_DISABLED() || !isConfigured() || !baseId || !tableId) return null;

  const prisma = getPrisma();
  if (!prisma) return null;

  const { sortField = null, maxRecords = null, sortDir = 'asc' } = opts;

  try {
    const mirrored = await getMirroredTables(prisma);
    if (!mirrored.has(`${baseId}::${tableId}`)) return null;

    const orderBy = Prisma.raw(orderByClause(sortField, sortDir));
    const limit = maxRecords ? Prisma.sql`LIMIT ${Number(maxRecords)}` : Prisma.empty;

    const rows = await prisma.$queryRaw`
      SELECT "recordId", "fields", "createdTime"
      FROM "AirtableRecord"
      WHERE "baseId" = ${baseId} AND "tableId" = ${tableId}
      ORDER BY ${orderBy}
      ${limit}
    `;

    return rows.map(r => hydrate(r, baseId, tableId));
  } catch (err) {
    // Never let a mirror problem take a dashboard down — fall back to Airtable.
    console.error(`[mirror] read failed for ${baseId}/${tableId}:`, err.message);
    return null;
  }
}

module.exports = { fetchFromMirror, invalidateMirrorCache, orderByClause, hydrate };
