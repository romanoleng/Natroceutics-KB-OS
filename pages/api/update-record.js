/**
 * PATCH /api/update-record
 * Updates a single Airtable record's fields.
 * Only accepts writes to known/allowed base IDs.
 */
import Airtable from 'airtable';

// Base IDs are not secrets (the API key grants access, not the base ID).
// Hardcode known bases so writes don't depend on env var naming alignment.
const ALLOWED_BASES = new Set([
  'appb0pnXsdtALWq80', // UK Operations
  'appz7wLo78sxzLhjV', // SA Operations
  'appdN9dWxVcB2KFZ6', // ME Operations
  'appbbbPs9ngSR6fIK', // Global KB
  'appKTwqP6KywdcIrp', // Affiliate Ops
  // Also accept whatever env vars are set (future regions)
  process.env.AIRTABLE_UK_BASE_ID,
  process.env.AIRTABLE_SA_BASE_ID,
  process.env.AIRTABLE_ME_BASE_ID,
  process.env.AIRTABLE_BASE_ID,
].filter(Boolean));

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { baseId, tableId, recordId, fields } = req.body || {};

  if (!baseId || !tableId || !recordId || !fields) {
    return res.status(400).json({ error: 'Missing required fields: baseId, tableId, recordId, fields' });
  }

  if (!ALLOWED_BASES.has(baseId)) {
    console.error('[update-record] Rejected base:', baseId, '— not in allowed list');
    return res.status(403).json({ error: 'Base not permitted' });
  }

  if (!process.env.AIRTABLE_API_KEY) {
    return res.status(500).json({ error: 'Missing AIRTABLE_API_KEY' });
  }

  try {
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(baseId);
    await new Promise((resolve, reject) => {
      base(tableId).update(recordId, fields, { typecast: true }, (err, record) => {
        if (err) return reject(err);
        resolve(record);
      });
    });
    // Auto-log activity comment whenever Status changes (fire-and-forget, never fails main response)
    if (fields.Status) {
      try {
        const now = new Date().toLocaleString('en-GB', {
          day: 'numeric', month: 'short', year: '2-digit',
          hour: '2-digit', minute: '2-digit',
        });
        const commentUrl = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}/comments`;
        fetch(commentUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: `Status → ${fields.Status} · ${now}` }),
        }).catch(err => console.warn('[update-record] activity log failed:', err.message));
      } catch (commentErr) {
        // Never let comment logging break the main update
        console.warn('[update-record] activity log setup error:', commentErr.message);
      }
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[update-record]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
