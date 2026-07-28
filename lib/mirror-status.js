/**
 * Live status of the Postgres mirror, for the /guide page.
 *
 * Degrades cleanly at every stage: no database configured, database configured
 * but empty, or database unreachable all return a well-formed answer rather
 * than throwing, because the guide page has to render precisely when things are
 * broken.
 */
const { getPrisma, isConfigured } = require('./prisma');
const { BASES } = require('./airtable-tables');

/** Latest run per table, most recent first. 500 covers ~95 tables several runs deep. */
const RUN_SAMPLE = 500;

function emptyStatus(reason) {
  return {
    configured: false,
    active: false,
    reason,
    bases: Object.values(BASES).map(b => ({
      key: b.key,
      label: b.label,
      totalTables: Object.keys(b.tables).length,
      syncedTables: 0,
      failedTables: 0,
      rows: 0,
      lastSync: null,
    })),
    totals: { syncedTables: 0, totalTables: Object.values(BASES).reduce((n, b) => n + Object.keys(b.tables).length, 0), rows: 0 },
  };
}

async function getMirrorStatus() {
  if (process.env.DATA_SOURCE === 'airtable') {
    return { ...emptyStatus('disabled'), configured: isConfigured() };
  }
  if (!isConfigured()) return emptyStatus('not-configured');

  const prisma = getPrisma();
  if (!prisma) return emptyStatus('not-configured');

  try {
    const [runs, rowCounts] = await Promise.all([
      prisma.syncRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: RUN_SAMPLE,
        select: { baseKey: true, tableKey: true, status: true, startedAt: true, finishedAt: true, error: true },
      }),
      prisma.airtableRecord.groupBy({ by: ['baseId'], _count: { _all: true } }),
    ]);

    // Collapse to the most recent run per table — the list is already sorted
    // newest-first, so the first sighting of a table wins.
    const latest = new Map();
    for (const r of runs) {
      const key = `${r.baseKey}.${r.tableKey}`;
      if (!latest.has(key)) latest.set(key, r);
    }

    const rowsByBaseId = new Map(rowCounts.map(r => [r.baseId, r._count._all]));

    const bases = Object.values(BASES).map(b => {
      const mine = [...latest.values()].filter(r => r.baseKey === b.key);
      const ok = mine.filter(r => r.status === 'ok');
      const failed = mine.filter(r => r.status !== 'ok');
      const lastSync = ok.reduce((max, r) => {
        const t = r.finishedAt || r.startedAt;
        return !max || (t && t > max) ? t : max;
      }, null);

      return {
        key: b.key,
        label: b.label,
        totalTables: Object.keys(b.tables).length,
        syncedTables: ok.length,
        failedTables: failed.length,
        failures: failed.slice(0, 5).map(r => ({ table: r.tableKey, error: r.error || 'unknown error' })),
        rows: rowsByBaseId.get(b.defaultBaseId) || 0,
        lastSync: lastSync ? lastSync.toISOString() : null,
      };
    });

    const totals = bases.reduce(
      (acc, b) => ({
        syncedTables: acc.syncedTables + b.syncedTables,
        totalTables: acc.totalTables + b.totalTables,
        rows: acc.rows + b.rows,
      }),
      { syncedTables: 0, totalTables: 0, rows: 0 }
    );

    return {
      configured: true,
      active: totals.syncedTables > 0,
      reason: totals.syncedTables > 0 ? 'ok' : 'empty',
      bases,
      totals,
    };
  } catch (err) {
    console.error('[mirror-status]', err.message);
    return { ...emptyStatus('unreachable'), configured: true };
  }
}

module.exports = { getMirrorStatus };
