/**
 * Shopify access tokens, minted on demand.
 *
 * Shopify retired admin-created custom apps: you can no longer generate the
 * long-lived `shpat_` token the OS was originally built around. Apps now live
 * in the Dev Dashboard and authenticate with a CLIENT CREDENTIALS grant, which
 * returns a token that **expires after 24 hours**.
 *
 * That is why a token pasted into an env var kept failing: it was valid when
 * created and dead by the next day. So we stop storing tokens and store
 * credentials instead, exchanging them for a fresh token per run. The upshot is
 * better than before — nothing to rotate by hand, ever.
 *
 *   SHOPIFY_CLIENT_ID      from Dev Dashboard → your app → Settings
 *   SHOPIFY_CLIENT_SECRET  same page (sensitive)
 *   SHOPIFY_SHOP_URL       natroceutics.myshopify.com
 *
 * A legacy `SHOPIFY_ADMIN_TOKEN` still works if one exists: older stores keep
 * their admin-created apps, so we prefer it when present and fall back to the
 * grant otherwise.
 */
const { realEnv } = require('./airtable-tables');

const API_VERSION = '2025-01';
let cached = null;   // { token, expiresAt } — process-lifetime only

const shopHost = () => {
  const shop = realEnv('SHOPIFY_SHOP_URL');
  if (!shop) throw new Error('SHOPIFY_SHOP_URL not set');
  return shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
};

/**
 * @returns {Promise<string>} a valid Admin API access token.
 */
async function getAccessToken() {
  // A legacy admin-created token, if the store still has one.
  const legacy = realEnv('SHOPIFY_ADMIN_TOKEN');
  if (legacy && legacy.startsWith('shpat_')) return legacy;

  // Re-use within its life, minus a minute of slack so a long run cannot
  // straddle the expiry.
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const id = realEnv('SHOPIFY_CLIENT_ID');
  const secret = realEnv('SHOPIFY_CLIENT_SECRET');
  if (!id || !secret) {
    throw new Error(
      'No usable Shopify credentials.\n' +
      '  Shopify no longer issues long-lived custom-app tokens. Create an app in the\n' +
      '  Dev Dashboard, install it on the store, then set from its Settings page:\n' +
      '    SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET\n' +
      (legacy ? `  (SHOPIFY_ADMIN_TOKEN is set but starts "${legacy.slice(0, 5)}", not "shpat_", so it is not an Admin API token.)\n` : '')
    );
  }

  const res = await fetch(`https://${shopHost()}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Shopify token request ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error(`Shopify returned no access_token: ${JSON.stringify(json).slice(0, 200)}`);

  cached = {
    token: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 86399) * 1000,
    scope: json.scope,
  };
  return cached.token;
}

/** Scopes granted to the last minted token, for diagnostics. */
const grantedScopes = () => cached?.scope || null;

/** POST a GraphQL query with a freshly-valid token. */
async function shopifyGraphQL(query, variables) {
  const token = await getAccessToken();
  const res = await fetch(`https://${shopHost()}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors).slice(0, 300));
  return json.data;
}

const isConfigured = () =>
  !!realEnv('SHOPIFY_SHOP_URL') &&
  (!!(realEnv('SHOPIFY_CLIENT_ID') && realEnv('SHOPIFY_CLIENT_SECRET')) ||
   String(realEnv('SHOPIFY_ADMIN_TOKEN') || '').startsWith('shpat_'));

module.exports = { getAccessToken, shopifyGraphQL, grantedScopes, isConfigured, API_VERSION, shopHost };
