# Postgres mirror — Phase 1 runbook

## Why

Every dashboard page calls Airtable live from `getServerSideProps`, so Airtable
API usage grew with how often the team opened the site. On 2026-07-27 that hit
the account-level monthly cap (`429 — API billing plan limit exceeded`) and took
down both the website and the daily scheduler at once.

Phase 1 removes read traffic from Airtable entirely. A scheduled job mirrors the
bases into Postgres once a day; the site reads Postgres. Airtable stays the
source of truth and the editing surface — nothing changes for the people
entering data, and all writes still go straight to Airtable.

## How it fits together

```
Airtable  ──(scripts/sync-airtable.js, scheduled)──▶  Postgres
                                                          │
pages/*.js ──▶ lib/airtable.js ──▶ lib/mirror.js ─────────┘
                     │
                     └─(fallback)─▶ Airtable API
```

`lib/airtable.js` keeps every getter it had. Both of its internal fetch
functions now try the mirror first and fall through to a live Airtable request
whenever the mirror says "I don't have this". **No page imports changed.**

The mirror declines, and Airtable serves the request, when:

- the table has never been synced (no successful `SyncRun` row for it)
- `DATA_SOURCE=airtable` is set
- no `DATABASE_URL` is configured
- Postgres errors or is unreachable

That last one matters: a database outage degrades the site to today's behaviour
rather than breaking it. The first one is what makes the rollout incremental —
a table stops using Airtable quota the moment it is first backfilled, so you can
migrate one base at a time without touching code.

## Schema

Two tables. `AirtableRecord` holds one row per Airtable record with the fields
as a JSON document; `SyncRun` records each table's sync attempt and doubles as
the "is this table mirrored yet?" signal.

This is a generic mirror rather than one typed model per Airtable table, because
the pages read arbitrary and frequently-changing Airtable columns — `pages/uk.js`
alone is ~240KB of field access. ~95 typed models would need a migration every
time someone adds a column in Airtable, and there is currently no way to
introspect the field types anyway while the API quota is exhausted.

Three details in the schema are load-bearing:

- **`fields` is `json`, not `jsonb`.** Nine pages build their table column order
  from `Object.keys(rows[0])`. `jsonb` re-orders keys (shortest first, then
  bytewise), which would scramble the columns of every generic table on the
  site. `json` stores the document verbatim.
- **`position`** records each record's index in Airtable's default view order at
  sync time, so the getters that pass no sort field render in the same order
  they do today.
- **`syncToken`**, not a timestamp, drives stale-row deletion. Binding a JS
  `Date` into a raw `INSERT` is interpreted in the Postgres server's local
  timezone and lands offset by its UTC offset — with timestamp comparison,
  deletion silently did nothing when running east of UTC, and would have deleted
  rows it had just written west of it. A token has no clock semantics.

## First-time setup

### 1. Provision the database

In the Vercel dashboard for **the project that actually serves
`natro-os.romsbuild.com`**: Storage → Create → Postgres (Neon). Attach it to
that project so `DATABASE_URL` is injected automatically.

> Confirm which Vercel account owns the live domain before doing this. The
> connected tooling only sees team `CreativeDigital Online Projects`, whose
> `natroceutics-creativedigital` project reports `live: false` and lists no
> `romsbuild.com` domain, while the deployment URL references a
> `natroceutics-os` account slug. Attaching the database to the wrong project
> means the live site never sees it.

### 2. Create the tables

```bash
npm run db:push
```

Against Neon, run this with `DATABASE_URL` pointed at the **unpooled** endpoint
(`DATABASE_URL_UNPOOLED` in Neon's dashboard). The pooled endpoint can reject
DDL. `directUrl` is deliberately not declared in `schema.prisma`: Prisma treats
it as mandatory once present, so an unset `DIRECT_URL` would fail
`prisma generate` and therefore every Vercel build.

### 3. Backfill

Start with UK — the base that broke first and carries the most traffic:

```bash
npm run sync -- --bases=UK
```

Expect one line per table with a row count. Cross-check a few against Airtable's
own record counts before moving on.

### 4. Verify, then cut over

The UK tables are now served from Postgres automatically — there is nothing to
deploy for the cutover itself, because the fallback flips per-table as soon as
data exists. Load `/uk` and confirm it renders identically. Then:

```bash
npm run sync -- --bases=SA
npm run sync -- --bases=ME
npm run sync -- --bases=GLOBAL
npm run sync -- --bases=PT
npm run sync -- --bases=AFF,PB
```

one at a time, checking the corresponding page after each.

### 5. Schedule it

Set `SYNC_BASES=all` once every base is backfilled, and run

```bash
node --env-file-if-exists=.env scripts/sync-airtable.js
```

daily. The simplest wiring is to add it to the existing
`natroceutics-email-capture` scheduler, which already has a stable daily cadence
and the Airtable credentials.

Do **not** run this as a Vercel serverless function: a full sync of ~95 tables
runs far longer than the function timeout. If you want it on Vercel Cron, use
`--tables=` or `--bases=` to fan out one small slice per invocation.

The script exits non-zero if any table failed, so a scheduler can alert on it.

## Day-to-day

```bash
npm run sync -- --bases=UK              # sync one base
npm run sync -- --tables=UK.ORDERS      # sync one table
npm run sync -- --bases=UK --dry-run    # fetch and report, write nothing
npm run sync:stats                      # row counts + last sync, no Airtable calls
```

## Rollback

Set `DATA_SOURCE=airtable` in Vercel and redeploy. Every read goes straight back
to the Airtable API, exactly as before this change. No code revert needed.

## What is still on Airtable

Unchanged and intentionally so — all of it is low-volume and none of it scales
with page views:

- `pages/api/update-record.js` — record edits
- `pages/api/record-comments.js` — reading and posting comments
- `createItem()` in `lib/airtable.js` — new knowledge items

Because writes bypass the mirror, an edit made in the UI will not appear on the
dashboard until the next sync. If that lag is a problem for a specific table,
the fix is to sync that table more often rather than to route reads back to
Airtable.

## Known differences from live Airtable

- **Freshness.** Data is as of the last sync, not live.
- **Sort on multi-value fields.** Sorting by a field holding multiple values
  orders by its JSON text rather than Airtable's rendered display value. None of
  the current getters sort on such a field.
- **Default view order.** Reproduced from the order recorded at sync time, so
  manually reordering a view in Airtable shows up after the next sync.
