/**
 * POST /api/smart-capture
 *
 *   { text }                    → { proposal }   preview only, writes nothing
 *   { text, confirm, overrides } → { written }   files it
 *
 * Two steps on purpose. A capture tool that silently files things in the wrong
 * place gets abandoned after its first mistake, so the router only ever
 * proposes and the user confirms. Corrections come back as `overrides`, which
 * is also the shape a future learning pass would consume.
 *
 * Costs nothing to run: the router is rules-only (lib/capture-router.js).
 */
import { route, toRecord } from '../../lib/capture-router';
import { commitTable } from '../../lib/mirror-write';
import { getPrisma, isConfigured } from '../../lib/prisma';
import { BASES, resolveBaseId } from '../../lib/airtable-tables';
import { createHash } from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, confirm, overrides } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'Nothing to capture' });

  const proposal = route(text);

  if (!confirm) return res.status(200).json({ proposal });

  if (!isConfigured()) return res.status(500).json({ error: 'No database configured' });

  const final = { ...proposal, ...(overrides || {}) };
  const regionKey = final.region || 'UK';
  const base = BASES[regionKey];
  if (!base) return res.status(400).json({ error: `Unknown region "${regionKey}"` });

  const tableKey = final.tableKey || 'TASKS';
  const tableId = base.tables[tableKey];
  if (!tableId) return res.status(400).json({ error: `${regionKey} has no ${tableKey} table` });

  const baseId = resolveBaseId(base.envVar);
  const record = toRecord(proposal, overrides);
  // Deterministic id: capturing the same text twice updates rather than duplicates.
  record.recordId = `cap:${createHash('sha1').update(String(text).trim()).digest('hex').slice(0, 20)}`;

  try {
    const prisma = getPrisma();
    // replace:false — this adds one row, it is not the whole table.
    const { written } = await commitTable(prisma, {
      baseKey: regionKey, tableKey,
      baseId, tableId,
      records: [record], replace: false, source: 'smart-capture',
    });
    return res.status(200).json({
      written,
      recordId: record.recordId,
      landedIn: `${regionKey}.${tableKey}`,
      proposal: final,
    });
  } catch (e) {
    console.error('[smart-capture]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
