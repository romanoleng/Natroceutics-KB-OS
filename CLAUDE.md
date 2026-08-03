# Natroceutics OS

Internal operations platform for Natroceutics®. Next.js 14 (pages router),
Prisma 6, Neon Postgres (Frankfurt), deployed on Vercel at
**natro-os.romsbuild.com**.

Romano runs this business largely alone across four regions. The OS exists so
that what he knows does not have to live in his head, and so a figure can be
trusted without re-deriving it. Treat it as a working tool first and a
showcase second, though it is both.

Written 2 August 2026, carrying forward the July build and the 1 August
Airtable migration.

---

## How to work here

**Ask before building something large.** Romano's standing instruction: "let me
know if I'm on the right track, don't just do it, ask me questions, be my
expert." He wants a recommendation, not a menu. Give one, say why, then build.

**Be honest about what is not done.** Every serious problem in this project has
been a silent failure dressed as success: a sync button that reported failure
for a day, a feed that stopped writing while the page looked fine, a `.os-subtab-btn`
class that never existed so five panels rendered raw browser buttons for two
days. Say what did not happen as plainly as what did.

**Verify before claiming.** Curl the deployed route, query the database, read
the response. "Should work" is not a result.

---

## Writing and brand

Load the `natroceutics-brand` skill for anything brand-facing. The essentials:

- **Never use the em dash.** Not in code comments, not in copy, not anywhere.
- British English throughout: colour, optimise, standardised, fibre.
- It is **nature-based therapeutics**, never "supplements".
- Locked: *We are efficacy first.* / *Enhancing health through nature-based
  therapeutics and nutrition.*
- Colours: Deep Forest `#1d4130`, Mid Green `#406550`, Charcoal `#2d2a26`,
  Cream `#eeebe1`, hairline `#dedad0`. White is for cards only.
- Manrope for text, DM Mono for data. No emoji in brand-facing copy.

Code comments should explain **why**, especially why something is not the
obvious approach. The comments in `lib/mirror-write.js`, `prisma/schema.prisma`
and `lib/sync-health.js` are the house style: they record the trap that made
the decision necessary.

---

## Architecture

**A generic JSON mirror, not a typed schema.** `AirtableRecord` holds
`{baseId, tableId, recordId, fields Json, createdTime, position, syncToken,
syncedAt}`. Pages read arbitrary, frequently-changing columns, so ~95 typed
models would break every time a field changed.

Two rules that look like mistakes and are not:

- **`json`, not `jsonb`.** jsonb reorders keys, and nine pages derive their
  column order from `Object.keys(rows[0])`. Under jsonb every generic table
  would render scrambled.
- **`syncToken` is a string, not a timestamp.** Binding a JS Date into a raw
  INSERT goes through Postgres' local timezone, which made staleness deletion
  silently do nothing east of UTC.

`recordId` is **varchar(32)**. Anything longer must be hashed. A Granola ID is
a 36-character UUID and overflowed it; `/api/ingest` now hashes over-long keys
deterministically.

OS-native tables use an `os:` prefix (`os:findings`, `os:time-sessions`).
`isNativeTable()` makes the Airtable sync skip them, which matters because a
full sync deletes anything it did not write.

`realEnv()` guards against Vercel's `[SENSITIVE]` placeholders.

---

## Environment variables: the trap that cost a day

**A key must exist in the Vercel environment that RUNS the code.** Local
scripts read Development via `.env.local`; the live site reads **Production**.
A key set only in Development works perfectly from the terminal and fails
silently in the app.

Production values read back as `[SENSITIVE]`, so they cannot be compared by
eye. Report **fingerprints** (length plus a short prefix) on failure instead.

**Never let an error echo an env value.** A host-shape check once fired on a
Production environment holding a client secret in `SHOPIFY_SHOP_URL` and
returned that secret in an API response.

**Romano adds all keys himself.** Never paste a credential into chat. When a
value must move between environments, give him a command that pipes it from
`.env.local` rather than asking him to paste: manual pasting has produced a
client ID of literally `/`, a secret in the shop-URL variable, and an ID and
secret swapped, across three separate attempts.

Run `vercel env add` on its own line, never chained after `&&`.

---

## Connected sources

See `docs/CONNECTED-SOURCES.md` for the full table. In short:

| Feed | How it arrives |
|---|---|
| Shopify orders, finance, subscriptions | Client-credentials grant, 24h tokens |
| Klaviyo, GoAffPro, Mailchimp | API keys, `scripts/*-pull.js` |
| Amazon UK | Sellerboard report emails, nightly |
| Outlook, Granola | Local scheduled task, daily 06:06 |

**Shopify retired long-lived `shpat_` tokens.** `lib/shopify-auth.js` mints one
per run from client credentials. `read_all_orders` is required or Shopify
silently returns only 60 days. Cancelled and test orders must be excluded or
the P&L disagrees with Shopify's own admin.

**Klaviyo** returns metric-aggregate buckets in UTC while we request
Europe/London, which under BST shifted every month from April. `lib/klaviyo.js`
nudges +12h before taking the month. `page_size` must be >= 500. Placed Order
counts ALL orders, not email-attributed ones: use flow and campaign value
reports for attribution.

**Mailchimp** `open_rate` is a fraction on campaigns and a percent on list
stats.

**Scheduling lives on Romano's Mac**, in Claude Routines, not in a cloud
session. Cloud sandboxes have no network route to natro-os.romsbuild.com: their
egress proxy 403s the CONNECT tunnel for any non-allowlisted host, on the
custom domain and the `vercel.app` alias alike. The Mac has the Outlook and
Granola connectors *and* the network path, which is the only place the whole
job completes. Do not try to revive a cloud scheduler for this.

---

## What is live

Off Airtable entirely (12 bases, 102 tables, ~5,400 rows). Shopify finance
engine with payout reconciliation. Subscriptions, Klaviyo, GoAffPro,
Mailchimp. Full task layer: cards with editable owner and due chips, comment
badges, rename, delete, status hierarchy. Board report. Passive time tracking
(`/time`). Site-wide search (`/menu`). Data status (`/status`).

`/status` is the honesty surface. Three rules it keeps:

1. Silence is never read as success. A feed that never ran says so.
2. Feeds with no schedule to miss are never shown red. A panel that cries
   wolf is one you stop reading.
3. It reports when data **arrived**, not whether it is **correct**.

---

## In flight

`scripts/findings-pass.js` plus the `os:findings` table shipped 3 August:
committed, run live, 4 findings Open in the database. The VAT check was
removed before shipping because it re-raised a settled question; that
decision is recorded in the script itself.

The rule that keeps it useful: **a finding is two records that disagree**, not
an observation, not a metric, not advice. If a check cannot name both sides it
does not belong. Severity is earned by consequence: money, an account, or a
decision taken on a wrong figure. Closing is sacred, a re-run never reopens
what Romano closed, and a finding that stops reproducing goes Stale rather
than being deleted, so a broken check cannot look like a solved problem.

**The gap: nothing in the UI reads `os:findings` yet.** Findings land in the
database invisibly, which is the exact silent-failure pattern this project
exists to kill. The display surface is an agreed August decision, not an
oversight.

---

## Open items

**Romano's, not the code's:**

- Set "Cost per item" in Shopify for seven products (Curcumin Fortified,
  Curcumin Complete 30s and 60s, Activated B-Complex, OPTI-VITA, Magnesium
  Glycinate, Coenzyme Q10, Vitamin C Complete). They carry 91% of £10,334.65
  of revenue with no cost attached, so margin stays partial until they land.
- Rotate the Shopify client secret starting `shpss_5901`. It was returned in
  an API response on 1 August before the error output was hardened.
- Amazon.es listings deactivated 2 August for an excluded-products policy
  violation. Flagged by the daily routine.

**Deferred by Romano:** bottom-bar swipe tabs, Natro AI v1, EN to Arabic
translator. Tab reordering for Shopify UK and Amazon UK is waiting on `/time`
evidence rather than guesswork.

**Settled, do not re-raise:** VAT is closed (Grant confirmed the own store
correctly charges none). Mailchimp has no SA store to connect, so zero tracked
revenue is the expected state. Klaviyo's Shopify integration is fine, an
earlier claim that it was broken was a bucketing bug of mine.

---

## Commands

```bash
npm run dev                  # local
npm run build                # prisma generate && next build
npm run sync -- --stats      # Airtable sync stats (retired, kept for history)
npx vercel --prod --yes      # deploy
```

Pull scripts live in `scripts/` and run with
`node --env-file-if-exists=.env.local scripts/<name>.js`.

Deploy verification, since a green build does not prove a working page:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://natro-os.romsbuild.com/status
```

A `307` means the login redirect, which is correct for an unauthenticated
request. Pass `-H "Cookie: kb-auth=$(grep -m1 '^KB_PASSWORD=' .env.local | cut -d= -f2-)"`
to reach the page itself.
