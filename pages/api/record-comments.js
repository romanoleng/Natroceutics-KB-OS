/**
 * /api/record-comments
 * GET  ?baseId=&tableId=&recordId=   — list comments on a record
 * POST { baseId, tableId, recordId, text } — add a comment
 */
export default async function handler(req, res) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server misconfigured' });

  const { baseId, tableId, recordId } =
    req.method === 'GET' ? req.query : req.body;

  if (!baseId || !tableId || !recordId) {
    return res.status(400).json({ error: 'Missing baseId, tableId, or recordId' });
  }

  const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}/comments`;

  /* ── GET: list comments ─── */
  if (req.method === 'GET') {
    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err?.error?.message || 'Airtable error' });
      }
      const data = await r.json();
      return res.json({ comments: data.comments || [] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ── POST: add comment ─── */
  if (req.method === 'POST') {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'No text provided' });
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err?.error?.message || 'Airtable error' });
      }
      const comment = await r.json();
      return res.json({ comment });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
