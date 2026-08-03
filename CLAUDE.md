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
- Colours: Deep Forest `#1d4130`, Mid Green `#406550`, Charcoal `#2d2a26`.
  **The beige is gone.** Romano replaced it on 30 July with cool porcelain:
  white, green and the packaging navy `#414f6d`, no beige anywhere. The tokens
  are still *named* `--cream` so 200-odd usages restyle from one place, but they
  hold `#f4f6f5` and `#dfe4e8`. `#eeebe1` and `#dedad0` are dead and must not
  come back; there is not one instance left in the stylesheet.
- **Page is white, cards are faintly cream** (`--page: #ffffff`,
  `--surface: #f8faf9`), his call on 3 August. All three surface tokens were
  `#ffffff` until then, so a card was separated from the page by a 1px hairline
  and nothing else and the OS read as one flat sheet. Card cream stays lighter
  than `--cream`, because `--cream` fills the chips that sit ON cards and the
  two matching would erase them. Never fill a surface with `var(--white)`
  directly; use `--surface` so the tier stays real.
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

## Two traps found on 3 August

**A table is only served from the mirror if it has a successful `SyncRun`.**
`lib/mirror.js` checks that set before reading, so rows written with a raw
INSERT are invisible to every page while sitting in the database. Always write
through `commitTable`, which records the run as it writes. This cost a
debugging round on `os:me-cost-model`, where the tab was empty and the data was
there the whole time.

**A green build and a clean server render do not prove the page works.** The ME
Cost Model tab compiled, server-rendered and returned 200 while crashing in the
browser on a prop that was passed but never destructured. Only opening it
caught that. For anything touching a page component, look at it in a browser
before calling it done.

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
| Warehouse SOH | "SOH with Batches & BBDs" workbook, dropped on `/capture` |
| Outlook, Granola | Local scheduled task, daily 06:06 |

**The SOH workbook is the only source of expiry in the OS.** Header sits on row
3 under a title block, and each stock code carries up to three (QTY, Batch &
BBD) pairs. `lib/soh-batches.js` reads it into `UK.STOCK` with an Earliest BBD
per SKU, and it supersedes the older stock take PDF, which has no batch data.
Batch text is hand-typed and no two rows are spelled alike, so the pattern is
deliberately loose. Totals are **not** forced to reconcile: where batch
quantities do not sum to the stock total the difference is reported as unbatched
rather than absorbed.

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

## Findings

Shipped 3 August and live on `/status`: `scripts/findings-pass.js` writes into
the `os:findings` table, `lib/findings.js` reads it, `components/FindingsPanel.js`
displays it. 4 findings Open. The VAT check was removed before shipping because
it re-raised a settled question; that decision is recorded in the script itself.

The rule that keeps it useful: **a finding is two records that disagree**, not
an observation, not a metric, not advice. If a check cannot name both sides it
does not belong. Severity is earned by consequence: money, an account, or a
decision taken on a wrong figure. Closing is sacred, a re-run never reopens
what Romano closed, and a finding that stops reproducing goes Stale rather
than being deleted, so a broken check cannot look like a solved problem.

Closing requires a written reason, because the pass never overwrites one: an
empty Resolution would make that permanence pointless. There is no delete and
no snooze on purpose. Verified end to end on 3 August by closing a finding,
re-running the pass, and confirming both status and reason survived.

**Not yet done:** the pass is run by hand. It has no place in the daily
schedule and no row on `/status`'s own feed list, so a pass that stops running
is currently invisible. That is the next piece.

**A stock expiry check does not belong here yet.** "Stock expiring soon" is an
observation, not two records that disagree, so it fails the rule above. It
becomes a finding only when it can name a second side, for example stock whose
BBD lands before the sell-through rate could clear it.

## Admin

`/admin/data` (3 Aug) is the first piece of the self-managed admin programme:
every table in the OS in one grid, editable where that is safe. It works
generically because records are JSON blobs, so a new field appears the moment
something writes it.

It reads Postgres **directly**, not via `fetchFromMirror`. That helper gates on
whether a table ever recorded a successful `SyncRun`, which made `UK.RISKS`
render as empty while holding 11 rows. An unreadable table must never look like
an empty one, so this page queries and reports what it gets, failure included.

Agreed order for the rest: **data (done) → site settings → editable copy with
code-default fallback → theme tokens → navigation from a table.** Held back by
agreement on 3 Aug: the permissions system (one user, and the 31 July no-auth
decision stands), a generic section/dashboard builder (panels encode judgment
that generic widgets cannot hold; offer show/hide and reorder of existing panels
instead), and a visual automation centre (the scheduler runs on Romano's Mac
because cloud sandboxes cannot reach this host, so the OS cannot drive it).

## What is safe to make editable

**Check before adding any edit control.** The test is not "does a feed touch
this table", it is **does the writer REPLACE the table or add to it**. A
hand-typed value on a replaced table survives until the next run and then
vanishes, which is worse than never offering the edit, because it is trusted in
the meantime.

- **`commitTable(..., replace: true)` with a freshly built record set** destroys
  edits. Off limits: `UK.SHOPIFY_*`, `UK.SUBS_*`, `UK.KLAVIYO_*`, `UK.AMAZON*`,
  `UK.ORDERS`, `UK.STOCK`, `UK.AFFILIATES_LIVE`, `UK.AFF_MONTHLY`,
  `UK.MEETINGS`, `SA.MAILCHIMP_*`.
- **Add-only or upsert writers** preserve edits. `/api/ingest`, Outlook, Granola
  and Smart Capture add rows without replacing, so `UK.TASKS`, `ME.TASKS`,
  `GLOBAL.KNOWLEDGE`, `ME.RISKS`, `ME.PARTNERS` are safe to edit.
- **Read-back-then-replace also preserves.** `scripts/goaffpro-pull.js` uses
  `replace: true` but reads every other row out of the mirror first and writes it
  back untouched, so `UK.COST_MODEL` is editable on **every row except
  `affiliate_commission`**, which it recomputes daily. `FEED_OWNED` in
  `components/ShopifyPerformance.js` is that list; keep it in step with the
  script.
- **Airtable is retired**, so a table whose only `SyncRun` source is `airtable`
  has no live writer and is now hand-owned. That covers most region tables:
  PRIORITIES, RISKS, B2B, PARTNERS, CUSTOMERS, INVENTORY, MARKETING, CS,
  REPORTING, REGISTRATIONS, and the whole GLOBAL knowledge set.
- **`GLOBAL.FINDINGS`** is written by a script, but `Status` and `Resolution`
  are deliberately preserved on re-run, which is what makes closing sacred.

`components/EditableValue.js` is the shared control. It takes `locked` plus a
`lockReason` so a feed-owned value renders as plain text with an explanation
rather than a control that would lose the value.

**Unit costs are the exception worth naming.** They live in Shopify and arrive
via `shopify-pull`, so they can never be edited in the OS. Romano sets those in
Shopify itself.

## Tasks: status is a place, not a label

Section decks group tasks into lanes (`LANES` / `buildLanes` / `laneOf` in
`lib/tasks.js`), rendered by `components/TaskGroup.js`, which Today shares.
Before 3 August the deck sorted on urgency and **status was not a sort key**, so
moving a task to Blocked repainted its chip and left the card where it was.
If you add a status, add it to a lane, or it becomes invisible.

Sort inside a lane is **overdue → due → priority → newest added**. Priority
outranks arrival date on purpose: priority is set on every open task while due
dates are set on about 15%, so leading with newest would bury a Critical task
under a Medium one filed this morning.

`Added` is the arrival date, distinct from due. `/api/ingest` and `/api/create`
stamp it. It was backfilled from `syncToken`, which embeds the millisecond
timestamp of the creating write, because `createdTime` is empty on every open UK
task. Run `scripts/normalise-tasks.js` if stored status or `Added` ever drift.

**Stored values, not just displayed ones.** Read-normalisation made cards look
tidy for a month while `"In Progress"` and `"🟡 In Progress"` stayed two
different strings underneath. Anything that groups or sorts on a stored field
needs that field cleaned in the database first. `Business Area` still has this
problem: "Amazon" and "🛒 Amazon UK" are the same thing to a reader and not to a
`GROUP BY`.

## Regions: Finance versus Cost Model

Finance is bills and revenue. What it costs to RUN a store is a cost model and
lives in its own table and tab: `os:uk-cost-model` and `os:me-cost-model`. The
Gamma Waves 3-region quote sat in `ME.FINANCE` until 3 August sharing none of
its fields, so ten fully populated rows rendered as ten rows of dashes through
the revenue table. `ME.FINANCE` is now empty, which is the honest state until
the ME store is live. The quote is a **draft for internal review** in USD, not
measured cost, and the UI says so.

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

**August, agreed 3 August.** Romano chose all four themes, so they are a
sequence rather than a menu: the OS talks back (findings surfaced, the pass
scheduled, Sellerboard economics mapped so dead capital becomes a check) ·
close the money gaps (the seven unit costs, the five PENDING cost lines, the
secret rotation) · task-first daily driver · hold and harden. The first is
underway; nothing below it should start before the piece above it is verified
working.

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
