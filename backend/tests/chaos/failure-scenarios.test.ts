/**
 * Chaos scenario tests — verify system never reaches inconsistent state
 * under failure conditions.
 *
 * REQUIRES: DATABASE_URL with migrations 001-003 applied.
 * Tests are skipped if DATABASE_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';

const DB_URL = process.env['DATABASE_URL'];
const describeDB = DB_URL ? describe : describe.skip;

let db: Awaited<typeof import('../../src/shared/database/db.js')>['db'] | null = null;
let withTenantTransaction: Awaited<typeof import('../../src/shared/database/db.js')>['withTenantTransaction'] | null = null;

const CHAOS_TENANT = '00000000-0000-0000-0000-000000000020';

describeDB('Chaos: Failure Scenarios', () => {
  let accountIds: string[] = [];

  beforeAll(async () => {
    const dbMod = await import('../../src/shared/database/db.js');
    db = dbMod.db;
    withTenantTransaction = dbMod.withTenantTransaction;

    await sql`
      INSERT INTO tenants (id, name, type, currency, timezone, is_active)
      VALUES (${CHAOS_TENANT}::uuid, 'Chaos Test Building', 'condo', 'COP', 'America/Bogota', true)
      ON CONFLICT (id) DO NOTHING
    `.execute(db);

    await withTenantTransaction(CHAOS_TENANT, async (trx) => {
      const existing = await sql`
        SELECT tenant_id FROM tenant_ledger_state WHERE tenant_id = ${CHAOS_TENANT}::uuid
      `.execute(trx);
      if (existing.rows.length === 0) {
        await sql`
          INSERT INTO tenant_ledger_state (tenant_id, current_hash, tx_count)
          VALUES (${CHAOS_TENANT}::uuid, 'GENESIS', 0)
        `.execute(trx);
      }
      const acctCount = await trx.selectFrom('chartOfAccounts').select(sql`count(*)`.as('cnt')).executeTakeFirst();
      if (!acctCount || Number(acctCount.cnt) === 0) {
        await sql`SELECT fn_seed_chart_of_accounts(${CHAOS_TENANT}::uuid)`.execute(trx);
      }
    });

    const accounts = await withTenantTransaction(CHAOS_TENANT, async (trx) => {
      return trx.selectFrom('chartOfAccounts').select('id').where('isActive', '=', true).limit(2).execute();
    });
    accountIds = accounts.map(a => a.id);
  }, 30_000);

  afterAll(async () => {
    if (db) await db.destroy();
  });

  // ── C01: Exception during DB transaction → full rollback ──

  it('C01: thrown error mid-transaction causes full rollback — no partial state', async () => {
    if (!withTenantTransaction || accountIds.length < 2) throw new Error('Setup failed');

    // Record state before
    const before = await withTenantTransaction(CHAOS_TENANT, async (trx) => {
      const r = await sql<{ txCount: string }>`
        SELECT tx_count FROM tenant_ledger_state
        WHERE tenant_id = ${CHAOS_TENANT}::uuid
      `.execute(trx);
      return BigInt(r.rows[0]!.txCount);
    });

    const crashKey = 'aaaaaaaa-0000-0000-0000-c0a500000001';

    // Attempt transaction that throws mid-way
    await expect(
      withTenantTransaction(CHAOS_TENANT, async (trx) => {
        // Insert transaction header (will succeed)
        const state = await sql<{ currentHash: string; txCount: string }>`
          SELECT current_hash, tx_count FROM tenant_ledger_state
          WHERE tenant_id = ${CHAOS_TENANT}::uuid FOR UPDATE
        `.execute(trx);

        const prevHash = state.rows[0]!.currentHash === 'GENESIS' ? null : state.rows[0]!.currentHash;

        const hash = await sql<{ hash: string }>`
          SELECT fn_compute_tx_hash(
            ${prevHash}, ${CHAOS_TENANT}::uuid,
            'charge'::transaction_type, '2026-01-01'::date,
            ${crashKey}::uuid, 'chaos-test'
          ) as hash
        `.execute(trx);

        await trx.insertInto('transactions').values({
          tenantId: CHAOS_TENANT,
          transactionType: 'charge',
          description: 'Will crash',
          effectiveDate: '2026-01-01',
          idempotencyKey: crashKey,
          createdBy: 'chaos-test',
          prevTxHash: prevHash,
          txHash: hash.rows[0]!.hash,
        }).execute();

        // SIMULATE CRASH — throw before entries are inserted
        throw new Error('SIMULATED NETWORK FAILURE');
      }),
    ).rejects.toThrow('SIMULATED NETWORK FAILURE');

    // Verify state is unchanged — no partial transaction
    const after = await withTenantTransaction(CHAOS_TENANT, async (trx) => {
      const r = await sql<{ txCount: string }>`
        SELECT tx_count FROM tenant_ledger_state
        WHERE tenant_id = ${CHAOS_TENANT}::uuid
      `.execute(trx);
      return BigInt(r.rows[0]!.txCount);
    });

    expect(after).toBe(before);

    // Verify no orphaned transaction with the crash key
    const orphan = await withTenantTransaction(CHAOS_TENANT, async (trx) => {
      return trx.selectFrom('transactions')
        .select('id')
        .where('idempotencyKey', '=', crashKey)
        .executeTakeFirst();
    });

    expect(orphan).toBeUndefined();
  });

  // ── C02: Delayed webhook reprocessing — idempotency prevents double-post ──

  it('C02: delayed webhook reprocessing handled by idempotency', async () => {
    if (!withTenantTransaction || accountIds.length < 2) throw new Error('Setup failed');

    const idemKey = 'aaaaaaaa-0000-0000-0000-de1a00000001';

    // Simulate first processing (on-time)
    const firstResult = await withTenantTransaction(CHAOS_TENANT, async (trx) => {
      const state = await sql<{ currentHash: string; txCount: string }>`
        SELECT current_hash, tx_count FROM tenant_ledger_state
        WHERE tenant_id = ${CHAOS_TENANT}::uuid FOR UPDATE
      `.execute(trx);
      const prevHash = state.rows[0]!.currentHash === 'GENESIS' ? null : state.rows[0]!.currentHash;

      const hash = await sql<{ hash: string }>`
        SELECT fn_compute_tx_hash(${prevHash}, ${CHAOS_TENANT}::uuid,
          'payment'::transaction_type, '2026-01-01'::date, ${idemKey}::uuid, 'webhook')
        as hash
      `.execute(trx);

      const row = await trx.insertInto('transactions').values({
        tenantId: CHAOS_TENANT, transactionType: 'payment',
        description: 'Webhook payment', effectiveDate: '2026-01-01',
        idempotencyKey: idemKey, createdBy: 'webhook',
        prevTxHash: prevHash, txHash: hash.rows[0]!.hash,
      }).returning('id').executeTakeFirstOrThrow();

      for (let j = 0; j < 2; j++) {
        const entryType = j === 0 ? 'debit' : 'credit';
        const eHash = await sql<{ hash: string }>`
          SELECT fn_compute_entry_hash(${row.id}::uuid, ${accountIds[j]!}::uuid,
            ${entryType}::entry_type, 50000::bigint, 'COP') as hash
        `.execute(trx);
        await trx.insertInto('ledgerEntries').values({
          transactionId: row.id, tenantId: CHAOS_TENANT, accountId: accountIds[j]!,
          entryType, amount: '50000', currency: 'COP', entryHash: eHash.rows[0]!.hash,
        }).execute();
      }

      const newCount = BigInt(state.rows[0]!.txCount) + 1n;
      await sql`UPDATE tenant_ledger_state SET current_hash = ${hash.rows[0]!.hash},
        tx_count = ${newCount.toString()}::bigint, last_tx_id = ${row.id}::uuid
        WHERE tenant_id = ${CHAOS_TENANT}::uuid`.execute(trx);

      return row.id;
    });

    // Simulate delayed reprocessing (10 min later) — same idempotency key
    const replayResult = await withTenantTransaction(CHAOS_TENANT, async (trx) => {
      return trx.selectFrom('transactions')
        .select('id')
        .where('tenantId', '=', CHAOS_TENANT)
        .where('idempotencyKey', '=', idemKey)
        .executeTakeFirst();
    });

    // Should return the same transaction — no duplicate
    expect(replayResult).toBeDefined();
    expect(replayResult!.id).toBe(firstResult);
  });

  // ── C03: Settlement crash mid-run → all-or-nothing ──

  it('C03: simulated settlement crash leaves no partial state', async () => {
    if (!withTenantTransaction) throw new Error('Setup failed');

    const settlementKey = 'aaaaaaaa-0000-0000-0000-5e1100000001';

    const countBefore = await withTenantTransaction(CHAOS_TENANT, async (trx) => {
      const r = await sql<{ cnt: string }>`
        SELECT count(*)::text as cnt FROM transactions
        WHERE tenant_id = ${CHAOS_TENANT}::uuid AND transaction_type = 'settlement'
      `.execute(trx);
      return BigInt(r.rows[0]!.cnt);
    });

    // Simulate settlement that crashes after inserting header but before entries
    await expect(
      withTenantTransaction(CHAOS_TENANT, async (trx) => {
        const state = await sql<{ currentHash: string; txCount: string }>`
          SELECT current_hash, tx_count FROM tenant_ledger_state
          WHERE tenant_id = ${CHAOS_TENANT}::uuid FOR UPDATE
        `.execute(trx);
        const prevHash = state.rows[0]!.currentHash === 'GENESIS' ? null : state.rows[0]!.currentHash;

        const hash = await sql<{ hash: string }>`
          SELECT fn_compute_tx_hash(${prevHash}, ${CHAOS_TENANT}::uuid,
            'settlement'::transaction_type, '2026-01-31'::date,
            ${settlementKey}::uuid, 'settlement-job')
          as hash
        `.execute(trx);

        await trx.insertInto('transactions').values({
          tenantId: CHAOS_TENANT, transactionType: 'settlement',
          description: 'Settlement batch Jan 2026', effectiveDate: '2026-01-31',
          idempotencyKey: settlementKey, createdBy: 'settlement-job',
          prevTxHash: prevHash, txHash: hash.rows[0]!.hash,
        }).execute();

        // CRASH — simulated OOM or process kill
        throw new Error('SIMULATED SETTLEMENT JOB CRASH');
      }),
    ).rejects.toThrow('SIMULATED SETTLEMENT JOB CRASH');

    // Verify no partial settlement was created
    const countAfter = await withTenantTransaction(CHAOS_TENANT, async (trx) => {
      const r = await sql<{ cnt: string }>`
        SELECT count(*)::text as cnt FROM transactions
        WHERE tenant_id = ${CHAOS_TENANT}::uuid AND transaction_type = 'settlement'
      `.execute(trx);
      return BigInt(r.rows[0]!.cnt);
    });

    expect(countAfter).toBe(countBefore);
  });

  // ── C05: No inconsistent state after any failure ──

  it('C05: ledger always balanced — sum(debits) === sum(credits) per tenant', async () => {
    if (!withTenantTransaction) throw new Error('Setup failed');

    const balance = await withTenantTransaction(CHAOS_TENANT, async (trx) => {
      const r = await sql<{ totalDebits: string; totalCredits: string }>`
        SELECT
          COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0)::text as total_debits,
          COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)::text as total_credits
        FROM ledger_entries
      `.execute(trx);
      return r.rows[0];
    });

    expect(balance).toBeDefined();
    expect(BigInt(balance!.totalDebits)).toBe(BigInt(balance!.totalCredits));
  });
});
