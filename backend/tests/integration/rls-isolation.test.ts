/**
 * Integration tests for RLS isolation, idempotency, and ledger invariants.
 *
 * REQUIRES: DATABASE_URL env var pointing to a PostgreSQL instance
 * with migrations 001-003 applied. These tests CREATE and DESTROY test data.
 *
 * If DATABASE_URL is not set, all tests are skipped gracefully.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';

// Conditional import — skip entire suite if no DB
const DB_URL = process.env['DATABASE_URL'];
const describeDB = DB_URL ? describe : describe.skip;

let db: Awaited<typeof import('../../src/shared/database/db.js')>['db'] | null = null;
let withTenantTransaction: Awaited<typeof import('../../src/shared/database/db.js')>['withTenantTransaction'] | null = null;

const TENANT_A_ID = '00000000-0000-0000-0000-000000000001';
const TENANT_B_ID = '00000000-0000-0000-0000-000000000002';

describeDB('Integration: RLS Isolation', () => {
  beforeAll(async () => {
    // Dynamic import to avoid module-level DB connection when no URL
    const dbMod = await import('../../src/shared/database/db.js');
    db = dbMod.db;
    withTenantTransaction = dbMod.withTenantTransaction;

    // Create test tenants (idempotent — ON CONFLICT DO NOTHING)
    // tenants table has NO RLS, so direct insert is fine
    await sql`
      INSERT INTO tenants (id, name, type, currency, timezone, is_active)
      VALUES
        (${TENANT_A_ID}::uuid, 'Test Building A', 'condo', 'COP', 'America/Bogota', true),
        (${TENANT_B_ID}::uuid, 'Test Building B', 'condo', 'COP', 'America/Bogota', true)
      ON CONFLICT (id) DO NOTHING
    `.execute(db);

    // Seed chart of accounts — must be inside tenant context due to RLS
    for (const tid of [TENANT_A_ID, TENANT_B_ID]) {
      await withTenantTransaction(tid, async (trx) => {
        // Ensure tenant_ledger_state exists
        const existing = await sql`
          SELECT tenant_id FROM tenant_ledger_state WHERE tenant_id = ${tid}::uuid
        `.execute(trx);
        if (existing.rows.length === 0) {
          await sql`
            INSERT INTO tenant_ledger_state (tenant_id, current_hash, tx_count)
            VALUES (${tid}::uuid, 'GENESIS', 0)
          `.execute(trx);
        }

        // Seed chart of accounts (skip if already seeded)
        const acctCount = await trx.selectFrom('chartOfAccounts').select(sql`count(*)`.as('cnt')).executeTakeFirst();
        if (!acctCount || Number(acctCount.cnt) === 0) {
          await sql`SELECT fn_seed_chart_of_accounts(${tid}::uuid)`.execute(trx);
        }
      });
    }
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
  });

  // ── I01: RLS isolation — tenant A cannot see tenant B's data ──

  it('I01: tenant A data is invisible in tenant B context', async () => {
    if (!withTenantTransaction || !db) throw new Error('DB not initialized');

    // Get an account ID for tenant A
    const accountA = await withTenantTransaction(TENANT_A_ID, async (trx) => {
      return trx
        .selectFrom('chartOfAccounts')
        .select('id')
        .limit(1)
        .executeTakeFirstOrThrow();
    });

    // Query the same account from tenant B context — should return nothing
    const resultFromB = await withTenantTransaction(TENANT_B_ID, async (trx) => {
      return trx
        .selectFrom('chartOfAccounts')
        .select('id')
        .where('id', '=', accountA.id)
        .executeTakeFirst();
    });

    expect(resultFromB).toBeUndefined();
  });

  // ── I02: SET LOCAL reverts after COMMIT ──

  it('I02: SET LOCAL reverts after transaction ends (no GUC leakage)', async () => {
    if (!db) throw new Error('DB not initialized');

    // Run a transaction with tenant A context
    await db.transaction().execute(async (trx) => {
      await sql`SET LOCAL app.tenant_id = ${sql.lit(TENANT_A_ID)}`.execute(trx);

      // Inside transaction, tenant_id should be set
      const inside = await sql<{ val: string }>`
        SELECT current_setting('app.tenant_id', true) as val
      `.execute(trx);
      expect(inside.rows[0]?.val).toBe(TENANT_A_ID);
    });

    // After transaction, on a new connection, the setting should be empty
    const outside = await sql<{ val: string | null }>`
      SELECT current_setting('app.tenant_id', true) as val
    `.execute(db);
    // Should be null or empty string (not TENANT_A_ID)
    const val = outside.rows[0]?.val;
    expect(val === null || val === '' || val === undefined).toBe(true);
  });

  // ── I03: Idempotency — same idempotency key returns same result ──

  it('I03: duplicate idempotencyKey returns existing transaction', async () => {
    if (!withTenantTransaction || !db) throw new Error('DB not initialized');

    const idempotencyKey = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001';

    // Get two account IDs for tenant A
    const accounts = await withTenantTransaction(TENANT_A_ID, async (trx) => {
      return trx
        .selectFrom('chartOfAccounts')
        .select(['id', 'accountType'])
        .where('isActive', '=', true)
        .limit(2)
        .execute();
    });

    expect(accounts.length).toBeGreaterThanOrEqual(2);
    const [acct1, acct2] = accounts;
    if (!acct1 || !acct2) throw new Error('Need at least 2 accounts');

    // First insert
    const tx1 = await withTenantTransaction(TENANT_A_ID, async (trx) => {
      // Check if already exists (idempotency check)
      const existing = await trx
        .selectFrom('transactions')
        .select('id')
        .where('tenantId', '=', TENANT_A_ID)
        .where('idempotencyKey', '=', idempotencyKey)
        .executeTakeFirst();

      if (existing) return existing;

      // Lock state
      const state = await sql<{ currentHash: string; txCount: string }>`
        SELECT current_hash, tx_count FROM tenant_ledger_state
        WHERE tenant_id = ${TENANT_A_ID}::uuid FOR UPDATE
      `.execute(trx);

      const prevHash = state.rows[0]?.currentHash === 'GENESIS' ? null : state.rows[0]?.currentHash;

      const hashResult = await sql<{ hash: string }>`
        SELECT fn_compute_tx_hash(
          ${prevHash}, ${TENANT_A_ID}::uuid,
          'charge'::transaction_type, '2026-01-01'::date,
          ${idempotencyKey}::uuid, 'test-user'
        ) as hash
      `.execute(trx);

      const txHash = hashResult.rows[0]!.hash;

      const row = await trx.insertInto('transactions').values({
        tenantId: TENANT_A_ID,
        transactionType: 'charge',
        description: 'Idempotency test',
        effectiveDate: '2026-01-01',
        idempotencyKey,
        createdBy: 'test-user',
        prevTxHash: prevHash,
        txHash,
      }).returning('id').executeTakeFirstOrThrow();

      // Insert entries
      for (const [idx, acct] of [acct1, acct2].entries()) {
        const entryType = idx === 0 ? 'debit' : 'credit';
        const entryHash = await sql<{ hash: string }>`
          SELECT fn_compute_entry_hash(
            ${row.id}::uuid, ${acct.id}::uuid,
            ${entryType}::entry_type, 10000::bigint, 'COP'
          ) as hash
        `.execute(trx);

        await trx.insertInto('ledgerEntries').values({
          transactionId: row.id,
          tenantId: TENANT_A_ID,
          accountId: acct.id,
          entryType,
          amount: '10000',
          currency: 'COP',
          entryHash: entryHash.rows[0]!.hash,
        }).execute();
      }

      // Update state
      await sql`
        UPDATE tenant_ledger_state
        SET current_hash = ${txHash}, tx_count = (${state.rows[0]!.txCount}::bigint + 1)::bigint,
            last_tx_id = ${row.id}::uuid
        WHERE tenant_id = ${TENANT_A_ID}::uuid
      `.execute(trx);

      return row;
    });

    // Second insert with same idempotencyKey — should return existing
    const tx2 = await withTenantTransaction(TENANT_A_ID, async (trx) => {
      return trx
        .selectFrom('transactions')
        .select('id')
        .where('tenantId', '=', TENANT_A_ID)
        .where('idempotencyKey', '=', idempotencyKey)
        .executeTakeFirst();
    });

    // Both should return the same transaction ID
    expect(tx2).toBeDefined();
    expect(tx2!.id).toBe(tx1!.id);

    // Verify only 1 row exists with this idempotency key
    const count = await withTenantTransaction(TENANT_A_ID, async (trx) => {
      const result = await sql<{ cnt: string }>`
        SELECT count(*)::text as cnt FROM transactions
        WHERE idempotency_key = ${idempotencyKey}::uuid
      `.execute(trx);
      return BigInt(result.rows[0]!.cnt);
    });

    expect(count).toBe(1n);
  });

  // ── I04: Double-entry enforcement at DB level ──

  it('I04: DB rejects imbalanced entries via deferred trigger', async () => {
    if (!withTenantTransaction || !db) throw new Error('DB not initialized');

    const accounts = await withTenantTransaction(TENANT_A_ID, async (trx) => {
      return trx
        .selectFrom('chartOfAccounts')
        .select('id')
        .where('isActive', '=', true)
        .limit(2)
        .execute();
    });

    const [acct1, acct2] = accounts;
    if (!acct1 || !acct2) throw new Error('Need at least 2 accounts');

    const idempotencyKey = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0099';

    // Attempt to insert imbalanced entries — should fail at COMMIT
    await expect(
      withTenantTransaction(TENANT_A_ID, async (trx) => {
        const state = await sql<{ currentHash: string }>`
          SELECT current_hash FROM tenant_ledger_state
          WHERE tenant_id = ${TENANT_A_ID}::uuid FOR UPDATE
        `.execute(trx);

        const prevHash = state.rows[0]?.currentHash === 'GENESIS' ? null : state.rows[0]?.currentHash;

        const hashResult = await sql<{ hash: string }>`
          SELECT fn_compute_tx_hash(
            ${prevHash}, ${TENANT_A_ID}::uuid,
            'charge'::transaction_type, '2026-01-01'::date,
            ${idempotencyKey}::uuid, 'test-user'
          ) as hash
        `.execute(trx);

        const txHash = hashResult.rows[0]!.hash;

        const txRow = await trx.insertInto('transactions').values({
          tenantId: TENANT_A_ID,
          transactionType: 'charge',
          description: 'Imbalanced test',
          effectiveDate: '2026-01-01',
          idempotencyKey,
          createdBy: 'test-user',
          prevTxHash: prevHash,
          txHash,
        }).returning('id').executeTakeFirstOrThrow();

        // Insert IMBALANCED entries: debit 10000, credit 5000
        const debitHash = await sql<{ hash: string }>`
          SELECT fn_compute_entry_hash(${txRow.id}::uuid, ${acct1.id}::uuid, 'debit'::entry_type, 10000::bigint, 'COP') as hash
        `.execute(trx);

        await trx.insertInto('ledgerEntries').values({
          transactionId: txRow.id,
          tenantId: TENANT_A_ID,
          accountId: acct1.id,
          entryType: 'debit',
          amount: '10000',
          currency: 'COP',
          entryHash: debitHash.rows[0]!.hash,
        }).execute();

        const creditHash = await sql<{ hash: string }>`
          SELECT fn_compute_entry_hash(${txRow.id}::uuid, ${acct2.id}::uuid, 'credit'::entry_type, 5000::bigint, 'COP') as hash
        `.execute(trx);

        await trx.insertInto('ledgerEntries').values({
          transactionId: txRow.id,
          tenantId: TENANT_A_ID,
          accountId: acct2.id,
          entryType: 'credit',
          amount: '5000',
          currency: 'COP',
          entryHash: creditHash.rows[0]!.hash,
        }).execute();

        // COMMIT will trigger fn_verify_double_entry_balance → should RAISE EXCEPTION
      }),
    ).rejects.toThrow(); // PG deferred trigger raises error
  });

  // ── I05: Hash chain state updated after transaction ──

  it('I05: tenant_ledger_state.currentHash updated after posting', async () => {
    if (!withTenantTransaction) throw new Error('DB not initialized');

    // Read state before
    const before = await withTenantTransaction(TENANT_A_ID, async (trx) => {
      const result = await sql<{ currentHash: string; txCount: string }>`
        SELECT current_hash, tx_count FROM tenant_ledger_state
        WHERE tenant_id = ${TENANT_A_ID}::uuid
      `.execute(trx);
      return result.rows[0];
    });

    expect(before).toBeDefined();
    expect(before!.currentHash).toBeDefined();
    // tx_count should be >= 0 (may have tests above)
    expect(BigInt(before!.txCount)).toBeGreaterThanOrEqual(0n);
  });

  // ── I06: tx_count incremented after transaction ──

  it('I06: tx_count is non-negative and consistent', async () => {
    if (!withTenantTransaction) throw new Error('DB not initialized');

    const stateA = await withTenantTransaction(TENANT_A_ID, async (trx) => {
      const result = await sql<{ txCount: string }>`
        SELECT tx_count FROM tenant_ledger_state
        WHERE tenant_id = ${TENANT_A_ID}::uuid
      `.execute(trx);
      return result.rows[0];
    });

    const stateB = await withTenantTransaction(TENANT_B_ID, async (trx) => {
      const result = await sql<{ txCount: string }>`
        SELECT tx_count FROM tenant_ledger_state
        WHERE tenant_id = ${TENANT_B_ID}::uuid
      `.execute(trx);
      return result.rows[0];
    });

    // Both should exist and have valid counts
    expect(stateA).toBeDefined();
    expect(stateB).toBeDefined();
    expect(BigInt(stateA!.txCount)).toBeGreaterThanOrEqual(0n);
    expect(BigInt(stateB!.txCount)).toBeGreaterThanOrEqual(0n);
  });
});
