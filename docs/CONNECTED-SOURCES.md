# Connected sources

Every feed into the OS, what it needs, and how to tell whether it ran.

The live version of this is **/status** in the OS. This file explains the
parts a page cannot: what each credential is, where it comes from, and the
failure modes that have actually bitten.

Last verified: 1 August 2026.

---

## How to tell whether the OS is up to date

Open **/status**. It lists every feed with its last arrival, age, cadence and
state, grouped so anything needing attention is at the top. The home page
carries the headline above everything else.

Three rules it keeps:

- **Silence is never read as success.** A feed that has never run says so.
- **Feeds with no schedule to miss are never shown red.** Sellerboard is a
  manual upload; Airtable is retired. Marking healthy things red teaches you
  to ignore the panel.
- **It reports when data arrived, not whether it is correct.** A feed can be
  current and still be wrong if the source is wrong.

---

## The feeds

| Feed | Region | Cadence | Credentials |
|---|---|---|---|
| Shopify orders | UK | Daily | `SHOPIFY_SHOP_URL`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` |
| Shopify finance | UK | Daily | same |
| Subscriptions | UK | Daily | same (derived from Shopify, no Recharge key needed) |
| Klaviyo | UK | Daily | `KLAVIYO_API_KEY` |
| GoAffPro affiliates | UK | Daily | `GOAFFPRO_ACCESS_TOKEN` |
| Mailchimp | SA | Weekly | `MAILCHIMP_API_KEY` |
| Amazon UK | UK | Manual | Sellerboard exports, uploaded via /capture |
| Capture and paste | All | Manual | none |
| Outlook | UK | Daily 05:00 UTC | `INGEST_TOKEN_SCHEDULER` (runs outside this repo) |
| Granola | All | Daily 05:00 UTC | same |

Nothing runs on a schedule inside this repo yet. Every pull to date has been
run by hand from `scripts/`. Outlook and Granola are scheduled externally.

---

## Environment variables: the trap that cost a day

**A variable must exist in the environment that runs the code.**

Vercel keeps three: Development, Preview, Production. Local scripts read
Development via `.env.local`. The live site reads **Production**. A key added
only to Development works perfectly from the terminal and fails silently in
the app, which is exactly how the in-app Shopify sync spent a day reporting
failure while every terminal pull succeeded.

Production values read back as `[SENSITIVE]`, so they cannot be compared by
eye. That is why `lib/shopify-auth.js` reports credential **fingerprints**
(length plus a short prefix or suffix) on failure rather than nothing.

**Never let an error echo an env value.** The host-shape check first fired on
a Production environment where the client secret had been pasted into
`SHOPIFY_SHOP_URL`, and the error returned that secret in an API response.
Fingerprints only, from here on.

### Setting one

Run the add on its own line. Chaining it after `&&` has repeatedly caused the
value prompt to swallow a stray character; one attempt stored a client ID of
literally `/`.

```bash
npx vercel env add SHOPIFY_CLIENT_ID production
```

Then redeploy, or the running functions keep the old values:

```bash
npx vercel --prod --yes
```

---

## Shopify specifically

Shopify **retired admin-created custom apps**, so the long-lived `shpat_`
token the OS was originally built around no longer exists. Apps live in the
Dev Dashboard and authenticate with a **client credentials grant** returning a
token that expires after 24 hours. `lib/shopify-auth.js` mints one per run and
caches it in-process, so there is nothing to rotate by hand.

Values, and how to tell them apart when they end up in the wrong variable:

- `SHOPIFY_SHOP_URL` — `natroceutics.myshopify.com`. No scheme, no slash.
- `SHOPIFY_CLIENT_ID` — 32 hex characters. Public, not a secret.
- `SHOPIFY_CLIENT_SECRET` — starts `shpss_`. Sensitive.

`SHOPIFY_ADMIN_TOKEN` is dead. It is only read when no client credentials
exist. It used to win outright, which meant Production authenticated with a
stale token and failed every call.

### Reading the errors

| Shopify says | It means |
|---|---|
| `application_cannot_be_found` | The client ID is not an app on that store, or the store is the wrong one. The error names the host. |
| `invalid_client` | The secret does not match the client ID. |
| `invalid_request` | The pair is malformed. In practice one value is truncated or the two are swapped. |
| `fetch failed` | The host does not resolve. Check `SHOPIFY_SHOP_URL` for whitespace. |

Scope note: `read_all_orders` is required, or Shopify silently returns only the
last 60 days without erroring.

---

## Ingest tokens

`/api/ingest` accepts two credentials:

- `INGEST_TOKEN` — the Capture page and anything inside this repo.
- `INGEST_TOKEN_SCHEDULER` — the external Outlook and Granola scheduler.

They are separate on purpose. The scheduler's config lives in another system,
so if it leaks that token is revoked on its own without breaking every other
ingest path.

Body shape:

```json
{ "table": "UK.MEETINGS", "records": [], "keyField": "Granola ID", "replace": false }
```

Keep `replace: false` on external callers so a partial run cannot delete rows
it did not write.
