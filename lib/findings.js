/**
 * Read the findings the OS has raised against itself.
 *
 * Findings are written by scripts/findings-pass.js into the os:findings
 * table. This module only reads; the one write the UI is allowed is closing
 * a finding with a reason, and that goes through /api/update-record so it
 * shares the same merge semantics as every other edit.
 *
 * Open findings are returned in the order they should be read: severity
 * first, then oldest first, because a finding that has been open two weeks
 * deserves the top of the list more than one raised this morning.
 */
const { getPrisma, isConfigured } = require('./prisma');
const { BASES } = require('./airtable-tables');

const SEVERITY_RANK = { High: 0, Medium: 1, Low: 2 };

async function getFindings() {
  if (!isConfigured()) return { ok: false, reason: 'No database configured', open: [], other: 0 };

  const g = BASES.GLOBAL;
  const prisma = getPrisma();
  try {
    const rows = await prisma.$queryRaw`
      SELECT "recordId", "fields"::text AS raw
      FROM "AirtableRecord"
      WHERE "baseId" = ${g.defaultBaseId} AND "tableId" = ${g.tables.FINDINGS}`;

    const all = rows.map(r => ({ recordId: r.recordId, ...JSON.parse(r.raw) }));
    const open = all
      .filter(f => f.Status === 'Open')
      .sort((a, b) =>
        (SEVERITY_RANK[a.Severity] ?? 9) - (SEVERITY_RANK[b.Severity] ?? 9) ||
        String(a['First Seen'] || '').localeCompare(String(b['First Seen'] || '')));

    return {
      ok: true,
      open,
      // Closed and stale rows are counted, not listed: the page is for what
      // needs attention, but a disappearing history would be its own lie.
      other: all.length - open.length,
      baseId: g.defaultBaseId,
      tableId: g.tables.FINDINGS,
    };
  } catch (e) {
    return { ok: false, reason: e.message, open: [], other: 0 };
  }
}

module.exports = { getFindings };
