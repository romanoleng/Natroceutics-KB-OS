/**
 * GET /api/destinations — every place a capture or upload may land.
 *
 * Served rather than hard-coded in the components so the paste box, the file
 * drop and Smart Capture cannot drift apart, and so registering a new table in
 * lib/airtable-tables.js is the ONLY step needed to make it a destination.
 *
 * `?includeLocked=1` also returns the feed-owned tables with the reason they
 * are unavailable, so the UI can explain the gap. An option that is simply
 * missing reads as a bug and sends people back to the terminal.
 *
 * Auth: middleware.js gates every /api/* route behind the kb-auth cookie.
 */
import { listDestinations } from '../../lib/destinations';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const includeLocked = req.query.includeLocked === '1';
  const groups = listDestinations({ includeLocked });
  const count = groups.reduce((n, g) => n + g.items.filter(i => !i.locked).length, 0);
  res.status(200).json({ ok: true, groups, count });
}
