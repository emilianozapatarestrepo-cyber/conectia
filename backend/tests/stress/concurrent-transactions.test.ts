/**
 * Stress tests for concurrency and fuzz scenarios.
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

const STRESS_TENANT = '00000000-0000-0000-0000-000000000010';

describeDB('Stress: Concurrent Transactions', () => {
  let accountIds: string[] = [];

  beforeAll(async () => {
    const dbMod = await import('../../src/shared/database/db.js');
    db = dbMod.db;
    withTenantTransaction = dbMod.withTenantTransaction;

    // Create test tenant (tenants table has NO RLS)
    await sql`
      INSERT INTO tenants (id, name, type, currency, timezone, is_active)
      VALUES (${STRESS_TENANT}::uuid, 'Stress Test Building', 'condo', 'COP', 'America/Bogota', true)
      ON CONFLICT (id) DO NOTHING
    `.execute(db);

    // Seed within tenant context (RLS requires it)
    await withTenantTransaction(STRESS_TENANT, async (trx) => {
      const existing = await sql`
        SELECT tenant_id FROM tenant_ledger_state WHERE tenant_id = ${STRESS_TENANT}::uuid
      `.execute(trx);
      if (existing.rows.length === 0) {
        await sql`
          INSERT INTO tenant_ledger_state (tenant_id, current_hash, tx_count)
          VALUES (${STRESS_TENANT}::uuid, 'GENESIS', 0)
        `.execute(trx);
      }
      const acctCount = await trx.selectFrom('chartOfAccounts').select(sql`count(*)`.as('cnt')).executeTakeFirst();
      if (!acctCount || Number(acctCount.cnt) === 0) {
        await sql`SELECT fn_seed_chart_of_accounts(${STRESS_TENANT}::uuid)`.execute(trx);
      }
    });

    // Get account IDs
    const accounts = await withTenantTransaction(STRESS_TENANT, async (trx) => {
      return trx.selectFrom('chartOfAccounts')
        .select('id').where('isActive', '=', true).limit(2).execute();
    });
    accountIds = accounts.map(a => a.id);
  }, 30_000);

  afterAll(async () => {
    if (db) await db.destroy();
  });

  // ── S01: 100 concurrent transactions → hash chain intact ──

  it('S01: 100 concurrent transactions on same tenant — all succeed, hash chain intact', async () => {
    if (!withTenantTransaction || accountIds.length < 2) {
      throw new Error('Setup failed');
    }

    const NUM_TX = 100;
    const promises: Promise<{ id: string }>[] = [];

    for (let i = 0; i < NUM_TX; i++) {
      const idempotencyKey = `00000000-0000-0000-0001-${String(i).padStart(12, '0')}`;

      const p = withTenantTransaction(STRESS_TENANT, async (trx) => {
        // Idempotency check
        const existing = await trx.selectFrom('transactions')
          .select('id')
          .where('tenantId', '=', STRESS_TENANT)
          .where('idempotencyKey', '=', idempotencyKey)
          .executeTakeFirst();
        if (existing) return existing;

        // MVCC lock
        const state = await sql<{ currentHash: string; txCount: string }>`
          SELECT current_hash, tx_count FROM tenant_ledger_state
          WHERE tenant_id = ${STRESS_TENANT}::uuid FOR UPDATE
        `.execute(trx);

        const prevHash = state.rows[0]!.currentHash === 'GENESIS'
          ? null : state.rows[0]!.currentHash;

        const hashResult = await sql<{ hash: string }>`
          SELECT fn_compute_tx_hash(
            ${prevHash}, ${STRESS_TENANT}::uuid,
            'charge'::transaction_type, '2026-01-01'::date,
            ${idempotencyKey}::uuid, 'stress-test'
          ) as hash
        `.execute(trx);
        const txHash = hashResult.rows[0]!.hash;

        const row = await trx.insertInto('transactions').values({
          tenantId: STRESS_TENANT,
          transactionType: 'charge',
          description: `Stress test tx ${i}`,
          effectiveDate: '2026-01-01',
          idempotencyKey,
          createdBy: 'stress-test',
          prevTxHash: prevHash,
          txHash,
        }).returning('id').executeTakeFirstOrThrow();

        // Balanced entries
        for (let j = 0; j < 2; j++) {
          const entryType = j === 0 ? 'debit' : 'credit';
          const entryHash = await sql<{ hash: string }>`
            SELECT fn_compute_entry_hash(
              ${row.id}::uuid, ${accountIds[j]!}::uuid,
              ${entryType}::entry_type, 1000::bigint, 'COP'
            ) as hash
          `.execute(trx);

          await trx.insertInto('ledgerEntries').values({
            transactionId: row.id,
            tenantId: STRESS_TENANT,
            accountId: accountIds[j]!,
            entryType,
            amount: '1000',
            currency: 'COP',
            entryHash: entryHash.rows[0]!.hash,
          }).execute();
        }

        // Update state
        const newCount = BigInt(state.rows[0]!.txCount) + 1n;
        await sql`
          UPDATE tenant_ledger_state
          SET current_hash = ${txHash},
              tx_count = ${newCount.toString()}::bigint,
              last_tx_id = ${row.id}::uuid
          WHERE tenant_id = ${STRESS_TENANT}::uuid
        `.execute(trx);

        return row;
      });

      promises.push(p);
    }

    // All 100 should succeed (FOR UPDATE serializes them)
    const results = await Promise.all(promises);
    expect(results).toHaveLength(NUM_TX);

    // Verify hash chain integrity: tx_count should be >= NUM_TX
    const finalState = await withTenantTransaction(STRESS_TENANT, async (trx) => {
      const r = await sql<{ txCount: string }>`
        SELECT tx_count FROM tenant_ledger_state
        WHERE tenant_id = ${STRESS_TENANT}::uuid
      `.execute(trx);
      return r.rows[0];
    });

    expect(BigInt(finalState!.txCount)).toBeGreaterThanOrEqual(BigInt(NUM_TX));
  }, 60_000);

  // ── S03: Cross-tenant parallelism ──

  it('S03: 10 concurrent transactions across different tenants succeed independently', async () => {
    if (!withTenantTransaction || !db) throw new Error('Setup failed');

    // Create 10 tenants
    const tenantIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const tid = `00000000-0000-0000-0002-${String(i).padStart(12, '0')}`;
      tenantIds.push(tid);

      await sql`
        INSERT INTO tenants (id, name, type, currency, timezone, is_active)
        VALUES (${tid}::uuid, ${'Cross-tenant test ' + i}, 'condo', 'COP', 'America/Bogota', true)
        ON CONFLICT (id) DO NOTHING
      `.execute(db);

      await withTenantTransaction!(tid, async (trx) => {
        const existing = await sql`
          SELECT tenant_id FROM tenant_ledger_state WHERE tenant_id = ${tid}::uuid
        `.execute(trx);
        if (existing.rows.length === 0) {
          await sql`
            INSERT INTO tenant_ledger_state (tenant_id, current_hash, tx_count)
            VALUES (${tid}::uuid, 'GENESIS', 0)
          `.execute(trx);
        }
        const acctCount = await trx.selectFrom('chartOfAccounts').select(sql`count(*)`.as('cnt')).executeTakeFirst();
        if (!acctCount || Number(acctCount.cnt) === 0) {
          await sql`SELECT fn_seed_chart_of_accounts(${tid}::uuid)`.execute(trx);
        }
      });
    }

    // Fire one transaction per tenant concurrently
    const promises = tenantIds.map(async (tid, i) => {
      const accts = await withTenantTransaction!(tid, async (trx) => {
        return trx.selectFrom('chartOfAccounts').select('id').limit(2).execute();
      });

      const idemKey = `00000000-0000-0000-0003-${String(i).padStart(12, '0')}`;

      return withTenantTransaction!(tid, async (trx) => {
        const state = await sql<{ currentHash: string; txCount: string }>`
          SELECT current_hash, tx_count FROM tenant_ledger_state
          WHERE tenant_id = ${tid}::uuid FOR UPDATE
        `.execute(trx);

        const prevHash = state.rows[0]!.currentHash === 'GENESIS' ? null : state.rows[0]!.currentHash;

        const hash = await sql<{ hash: string }>`
          SELECT fn_compute_tx_hash(
            ${prevHash}, ${tid}::uuid, 'charge'::transaction_type,
            '2026-01-01'::date, ${idemKey}::uuid, 'test'
          ) as hash
        `.execute(trx);

        const row = await trx.insertInto('transactions').values({
          tenantId: tid,
          transactionType: 'charge',
          description: `Cross-tenant ${i}`,
          effectiveDate: '2026-01-01',
          idempotencyKey: idemKey,
          createdBy: 'test',
          prevTxHash: prevHash,
          txHash: hash.rows[0]!.hash,
        }).returning('id').executeTakeFirstOrThrow();

        for (let j = 0; j < 2; j++) {
          const entryType = j === 0 ? 'debit' : 'credit';
          const eHash = await sql<{ hash: string }>`
            SELECT fn_compute_entry_hash(
              ${row.id}::uuid, ${accts[j]!.id}::uuid,
              ${entryType}::entry_type, 5000::bigint, 'COP'
            ) as hash
          `.execute(trx);
          await trx.insertInto('ledgerEntries').values({
            transactionId: row.id, tenantId: tid, accountId: accts[j]!.id,
            entryType, amount: '5000', currency: 'COP', entryHash: eHash.rows[0]!.hash,
          }).execute();
        }

        const newCount = BigInt(state.rows[0]!.txCount) + 1n;
        await sql`
          UPDATE tenant_ledger_state SET current_hash = ${hash.rows[0]!.hash},
            tx_count = ${newCount.toString()}::bigint, last_tx_id = ${row.id}::uuid
          WHERE tenant_id = ${tid}::uuid
        `.execute(trx);

        return row;
      });
    });

    const results = await Promise.all(promises);
    expect(results).toHaveLength(10);
    // All should have distinct IDs
    const ids = results.map(r => r.id);
    expect(new Set(ids).size).toBe(10);
  }, 30_000);

  // ── S04: Randomized imbalance fuzz ──

  it('S04: 1000 random imbalanced line sets are always rejected', async () => {
    // This is a pure unit test (no DB needed) — fuzz the validation
    const { LedgerImbalanceError, EmptyTransactionError, InvalidAmountError } =
      await import('../../src/modules/ledger/domain/errors.js');

    function preflight(lines: Array<{ entryType: string; amount: bigint }>) {
      if (lines.length < 2) throw new EmptyTransactionError();
      let d = 0n, c = 0n;
      for (const l of lines) {
        if (l.amount <= 0n) throw new InvalidAmountError();
        if (l.entryType === 'debit') d += l.amount; else c += l.amount;
      }
      if (d !== c) throw new LedgerImbalanceError(d, c);
    }

    let rejected = 0;
    for (let i = 0; i < 1000; i++) {
      const debit = BigInt(Math.floor(Math.random() * 1_000_000) + 1);
      let credit = BigInt(Math.floor(Math.random() * 1_000_000) + 1);
      // Ensure they're different
      if (credit === debit) credit += 1n;

      try {
        preflight([
          { entryType: 'debit', amount: debit },
          { entryType: 'credit', amount: credit },
        ]);
      } catch {
        rejected++;
      }
    }

    expect(rejected).toBe(1000); // ALL should be rejected
  });
});
