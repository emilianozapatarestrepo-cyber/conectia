import { Kysely, PostgresDialect, CamelCasePlugin, sql } from 'kysely';
import type { Transaction as KyselyTransaction } from 'kysely';
import { Pool } from 'pg';
import { env } from '../../config/env.js';
import type { DB } from './schema.js';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  min: env.DB_POOL_MIN,
  max: env.DB_POOL_MAX,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});

// Log pool errors (don't crash)
pool.on('error', (err) => {
  console.error('[DB Pool] Unexpected error on idle client:', err.message);
});

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool }),
  plugins: [new CamelCasePlugin()],
  log: env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});

// ─── Tenant-Scoped Transaction Helper ─────────────────────────────────────────
//
// Every financial operation MUST run inside withTenantTransaction().
// This sets SET LOCAL app.tenant_id = '<uuid>' at the start of the
// PostgreSQL transaction, enabling RLS policies to enforce isolation.
//
// SET LOCAL ensures the GUC variable is scoped to the current transaction
// and automatically reverts on COMMIT/ROLLBACK, preventing tenant_id
// leakage between pooled connections.

/**
 * Executes a callback inside a Kysely transaction with RLS tenant context.
 *
 * @param tenantId - The UUID of the tenant. Obtained from req.user.tenantId
 *                   (resolved server-side via tenant_memberships, NOT from client).
 * @param callback - Async function receiving the scoped Kysely transaction.
 * @returns The result of the callback.
 */
export async function withTenantTransaction<T>(
  tenantId: string,
  callback: (trx: KyselyTransaction<DB>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    // SET LOCAL is transaction-scoped — reverts automatically on COMMIT/ROLLBACK.
    await sql`SET LOCAL app.tenant_id = ${sql.lit(tenantId)}`.execute(trx);
    return callback(trx);
  });
}

/**
 * Sets the tenant context on an already-open Kysely transaction.
 * Use when you need to call SET LOCAL inside an existing trx.
 */
export async function setTenantContext(
  trx: KyselyTransaction<DB>,
  tenantId: string,
): Promise<void> {
  await sql`SET LOCAL app.tenant_id = ${sql.lit(tenantId)}`.execute(trx);
}

/** Re-export the Transaction type for use in repository signatures */
export type { KyselyTransaction };

/** Verify connection on startup */
export async function checkDatabaseConnection(): Promise<void> {
  try {
    await db.selectFrom('tenants').select('id').limit(1).execute();
    console.log('[DB] Connection verified ✓');
  } catch (error) {
    console.error('[DB] Connection FAILED:', (error as Error).message);
    throw error;
  }
}

/** Graceful shutdown */
export async function destroyDatabase(): Promise<void> {
  await db.destroy();
  console.log('[DB] Connection pool destroyed');
}
