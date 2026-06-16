import { createItem } from '../../lib/airtable';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { fields } = req.body;
  if (!fields?.title) return res.status(400).json({ error: 'title is required' });
  try {
    const created = await createItem(fields);
    res.status(200).json({ success: true, id: created[0]?.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
