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
 * A legacy `SHOPIFY_ADMIN_TOKEN` is used ONLY when no client credentials are
 * set. It used to win outright, which quietly broke the in-app sync button on
 * production: a stale `shpat_` token was still sitting in the Production
 * environment, so every call authenticated with a dead credential and 401'd
 * rather than falling through to the grant. Credentials that renew themselves
 * beat a token that cannot.
 */
const { realEnv } = require('./airtable-tables');

const API_VERSION = '2025-01';
let cached = null;   // { token, expiresAt } — process-lifetime only

/**
 * The shop hostname, defensively parsed. Env vars get pasted by hand, and a
 * stray space or newline turns a valid host into a DNS failure that surfaces
 * only as "fetch failed" — which tells you nothing. Strip the scheme, any
 * path, and all whitespace, then check the shape before using it.
 */
const shopHost = () => {
  const raw = realEnv('SHOPIFY_SHOP_URL');
  if (!raw) throw new Error('SHOPIFY_SHOP_URL not set');
  const host = String(raw)
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\s+/g, '');
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(host)) {
    // Never echo the value itself. This check first fired on a production env
    // where the client SECRET had been pasted into SHOPIFY_SHOP_URL, and the
    // error handed that secret straight back in an API response. A shape
    // description is enough to diagnose a paste into the wrong prompt.
    throw new Error(
      `SHOPIFY_SHOP_URL is not a myshopify host (got ${host.length} characters ` +
      `starting "${host.slice(0, 4)}"). Expected natroceutics.myshopify.com, ` +
      'with no https:// and no trailing slash.'
    );
  }
  return host;
};

/**
 * @returns {Promise<string>} a valid Admin API access token.
 */
async function getAccessToken() {
  const legacy = realEnv('SHOPIFY_ADMIN_TOKEN');
  const id = realEnv('SHOPIFY_CLIENT_ID');
  const secret = realEnv('SHOPIFY_CLIENT_SECRET');

  // Legacy admin-created token, used only as a fallback — see file comment.
  if ((!id || !secret) && legacy && legacy.startsWith('shpat_')) return legacy;

  // Re-use within its life, minus a minute of slack so a long run cannot
  // straddle the expiry.
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  if (!id || !secret) {
    throw new Error(
      'No usable Shopify credentials.\n' +
      '  Shopify no longer issues long-lived custom-app tokens. Create an app in the\n' +
      '  Dev Dashboard, install it on the store, then set from its Settings page:\n' +
      '    SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET\n' +
      (legacy ? `  (SHOPIFY_ADMIN_TOKEN is set but starts "${legacy.slice(0, 5)}", not "shpat_", so it is not an Admin API token.)\n` : '')
    );
  }

  const host = shopHost();
  // Node's fetch reports every transport failure as the bare string "fetch
  // failed". Naming the host turns an unreadable error into an obvious one.
  const res = await fetch(`https://${host}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  }).catch(err => {
    throw new Error(`Could not reach https://${host} (${err.message}). Check SHOPIFY_SHOP_URL.`);
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Shopify's OAuth errors are HTML and never name the store. Without the
    // host, "application_cannot_be_found" cannot be told apart from the app
    // being installed on a DIFFERENT myshopify store, which is the likelier
    // cause when the same credentials work elsewhere. The host is a public
    // name, so saying it discloses nothing.
    const why = /application_cannot_be_found/.test(body)
      ? `no app with this SHOPIFY_CLIENT_ID is installed on ${host}`
      : /invalid_client/.test(body)
        ? 'SHOPIFY_CLIENT_SECRET does not match this client ID'
        : body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new Error(`Shopify token request ${res.status} for ${host}: ${why}`);
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
