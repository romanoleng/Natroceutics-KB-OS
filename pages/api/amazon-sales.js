import { getUKAmazonDailyPnL, getUKAmazonAsinDaily, getUKAmazonOrders } from '../../lib/airtable';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const [dailyPnl, asinDaily, amazonOrders] = await Promise.all([
      getUKAmazonDailyPnL(),
      getUKAmazonAsinDaily(),
      getUKAmazonOrders(),
    ]);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ dailyPnl, asinDaily, amazonOrders });
  } catch (e) {
    console.error('[api/amazon-sales]', e.message);
    res.status(500).json({ dailyPnl: [], asinDaily: [], amazonOrders: [], error: e.message });
  }
}
