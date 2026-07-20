import { getUKShopifyDailyPnL, getUKProductCosts } from '../../lib/airtable';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const [dailyPnl, productCosts] = await Promise.all([
      getUKShopifyDailyPnL(),
      getUKProductCosts(),
    ]);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ dailyPnl, productCosts });
  } catch (e) {
    console.error('[api/shopify-pnl]', e.message);
    res.status(500).json({ dailyPnl: [], productCosts: [], error: e.message });
  }
}
