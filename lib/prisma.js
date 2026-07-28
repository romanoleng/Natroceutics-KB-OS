/**
 * Prisma client singleton.
 *
 * CommonJS so both Next (bundled) and scripts/sync-airtable.js (plain node)
 * can require it.
 *
 * Connection string precedence:
 *   DATABASE_URL          — preferred (Neon / Vercel Postgres integration sets this)
 *   POSTGRES_PRISMA_URL   — older Vercel Postgres naming (pooled)
 *   POSTGRES_URL          — older Vercel Postgres naming
 *
 * Use the pooled URL here. The unpooled one belongs in DIRECT_URL and is only
 * read by `prisma migrate` / `prisma db push`.
 */
const { PrismaClient } = require('@prisma/client');

function connectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    null
  );
}

/** True when a Postgres connection string is configured at all. */
function isConfigured() {
  return Boolean(connectionString());
}

const globalForPrisma = globalThis;

/** @returns {import('@prisma/client').PrismaClient|null} */
function getPrisma() {
  const url = connectionString();
  if (!url) return null;
  if (globalForPrisma.__natroPrisma) return globalForPrisma.__natroPrisma;

  const client = new PrismaClient({
    datasourceUrl: url,
    log: process.env.PRISMA_LOG === '1' ? ['query', 'warn', 'error'] : ['error'],
  });

  // Cache on globalThis so Next's dev-mode module reloading — and warm lambda
  // reuse in production — doesn't open a new pool per request.
  globalForPrisma.__natroPrisma = client;
  return client;
}

module.exports = { getPrisma, isConfigured, connectionString };
