import { sql } from 'kysely';
import { withTenantTransaction } from '../../../shared/database/db.js';
import type { KyselyTransaction } from '../../../shared/database/db.js';
import type { DB } from '../../../shared/database/schema.js';
import type { ITransactionRepository } from '../domain/interfaces.js';
import type {
  PostTransactionInput,
  TransactionResult,
  UUID,
} from '../domain/types.js';
import {
  LedgerImbalanceError,
  EmptyTransactionError,
  InvalidAmountError,
} from '../domain/errors.js';

/**
 * Fetches an existing transaction by idempotency key and returns it
 * as a TransactionResult. Used for idempotency return-existing behavior.
 */
async function fetchExistingTransaction(
  trx: KyselyTransaction<DB>,
  tenantId: string,
  idempotencyKey: string,
): Promise<TransactionResult | null> {
  const existingTx = await trx
    .selectFrom('transactions')
    .select(['id', 'txHash'])
    .where('tenantId', '=', tenantId)
    .where('idempotencyKey', '=', idempotencyKey)
    .executeTakeFirst();

  if (!existingTx) return null;

  const entries = await trx
    .selectFrom('ledgerEntries')
    .select(['id', 'accountId', 'entryType', 'amount', 'entryHash'])
    .where('transactionId', '=', existingTx.id)
    .execute();

  return {
    transactionId: existingTx.id,
    txHash: existingTx.txHash,
    entries: entries.map((e) => ({
      id: e.id,
      accountId: e.accountId,
      entryType: e.entryType as 'debit' | 'credit',
      amount: e.amount.toString(),
      entryHash: e.entryHash,
    })),
  };
}

export class TransactionRepository implements ITransactionRepository {
  /**
   * Posts a balanced double-entry transaction atomically.
   *
   * Hardened implementation:
   *   1. Runs inside withTenantTransaction (SET LOCAL app.tenant_id for RLS).
   *   2. Acquires FOR UPDATE lock on tenant_ledger_state (MVCC serialization).
   *   3. Idempotency: if idempotencyKey already exists, returns existing transaction.
   *   4. Computes SHA-256 hash chain using the locked previous hash.
   *   5. Updates tenant_ledger_state atomically after insert.
   *   6. DB DEFERRED trigger verifies double-entry balance at COMMIT.
   */
  async postTransaction(input: PostTransactionInput): Promise<TransactionResult> {
    const { lines } = input;

    // ── Pre-flight validations (fail fast before hitting DB) ──
    if (lines.length < 2) {
      throw new EmptyTransactionError();
    }

    let debitSum = 0n;
    let creditSum = 0n;
    for (const line of lines) {
      if (line.amount <= 0n) {
        throw new InvalidAmountError();
      }
      if (line.entryType === 'debit') {
        debitSum += line.amount;
      } else {
        creditSum += line.amount;
      }
    }

    if (debitSum !== creditSum) {
      throw new LedgerImbalanceError(debitSum, creditSum);
    }

    const currency = input.currency ?? 'COP';

    // ── Execute inside tenant-scoped transaction (RLS + MVCC) ──
    return withTenantTransaction(input.tenantId, async (trx) => {
      // ── Step 1: Idempotency check — return existing if already posted ──
      const existing = await fetchExistingTransaction(
        trx,
        input.tenantId,
        input.idempotencyKey,
      );
      if (existing) {
        return existing;
      }

      // ── Step 2: Acquire MVCC lock on tenant_ledger_state ──
      // This serializes hash chain computation for this tenant.
      // Other tenants are NOT blocked (lock is per-tenant row).
      // FOR UPDATE ensures only one transaction computes the next hash at a time.
      const ledgerState = await sql<{
        current_hash: string;
        tx_count: string;
      }>`
        SELECT current_hash, tx_count
        FROM tenant_ledger_state
        WHERE tenant_id = ${input.tenantId}::uuid
        FOR UPDATE
      `.execute(trx);

      const stateRow = ledgerState.rows[0];
      if (!stateRow) {
        throw new Error(
          `tenant_ledger_state row missing for tenant ${input.tenantId}. ` +
          'Run migration 002 backfill or verify tenant creation trigger.',
        );
      }

      const prevHash = stateRow.current_hash === 'GENESIS' ? null : stateRow.current_hash;
      const effectiveDateStr = input.effectiveDate.toISOString().split('T')[0] ?? '';

      // ── Step 3: Compute transaction hash via DB function ──
      const hashResult = await sql<{ hash: string }>`
        SELECT fn_compute_tx_hash(
          ${prevHash},
          ${input.tenantId}::uuid,
          ${input.transactionType}::transaction_type,
          ${effectiveDateStr}::date,
          ${input.idempotencyKey}::uuid,
          ${input.createdBy}
        ) as hash
      `.execute(trx);

      const txHash = hashResult.rows[0]?.hash;
      if (!txHash) throw new Error('Failed to compute transaction hash');

      // ── Step 4: Insert transaction header ──
      const txRow = await trx
        .insertInto('transactions')
        .values({
          tenantId: input.tenantId,
          transactionType: input.transactionType,
          description: input.description,
          periodId: input.periodId ?? null,
          effectiveDate: effectiveDateStr,
          idempotencyKey: input.idempotencyKey,
          sourceType: input.sourceType ?? null,
          sourceId: input.sourceId ?? null,
          metadata: input.metadata ? JSON.stringify(input.metadata) : '{}',
          createdBy: input.createdBy,
          prevTxHash: prevHash,
          txHash,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // ── Step 5: Insert ledger entries ──
      const entryResults: TransactionResult['entries'] = [];

      for (const line of lines) {
        const entryHashResult = await sql<{ hash: string }>`
          SELECT fn_compute_entry_hash(
            ${txRow.id}::uuid,
            ${line.accountId}::uuid,
            ${line.entryType}::entry_type,
            ${line.amount.toString()}::bigint,
            ${currency}
          ) as hash
        `.execute(trx);

        const entryHash = entryHashResult.rows[0]?.hash;
        if (!entryHash) throw new Error('Failed to compute entry hash');

        const entryRow = await trx
          .insertInto('ledgerEntries')
          .values({
            transactionId: txRow.id,
            tenantId: input.tenantId,
            accountId: line.accountId,
            entryType: line.entryType,
            amount: line.amount.toString(),
            currency,
            description: line.description ?? null,
            metadata: '{}',
            entryHash,
          })
          .returning(['id', 'accountId', 'entryType', 'amount', 'entryHash'])
          .executeTakeFirstOrThrow();

        entryResults.push({
          id: entryRow.id,
          accountId: entryRow.accountId,
          entryType: entryRow.entryType as 'debit' | 'credit',
          amount: entryRow.amount.toString(),
          entryHash: entryRow.entryHash,
        });
      }

      // ── Step 6: Update tenant_ledger_state with new hash ──
      // This must happen AFTER the transaction insert succeeds.
      const newTxCount = BigInt(stateRow.tx_count) + 1n;
      await sql`
        UPDATE tenant_ledger_state
        SET current_hash = ${txHash},
            tx_count = ${newTxCount.toString()}::bigint,
            last_tx_id = ${txRow.id}::uuid,
            updated_at = now()
        WHERE tenant_id = ${input.tenantId}::uuid
      `.execute(trx);

      return {
        transactionId: txRow.id,
        txHash,
        entries: entryResults,
      };
    });
    // The DEFERRED constraint trigger verifies double-entry balance at COMMIT.
  }

  async getTransaction(
    tenantId: UUID,
    transactionId: UUID,
  ): Promise<TransactionResult | null> {
    // Use withTenantTransaction for RLS enforcement
    return withTenantTransaction(tenantId, async (trx) => {
      const tx = await trx
        .selectFrom('transactions')
        .select(['id', 'txHash'])
        .where('id', '=', transactionId)
        .executeTakeFirst();

      if (!tx) return null;

      const entries = await trx
        .selectFrom('ledgerEntries')
        .select(['id', 'accountId', 'entryType', 'amount', 'entryHash'])
        .where('transactionId', '=', transactionId)
        .execute();

      return {
        transactionId: tx.id,
        txHash: tx.txHash,
        entries: entries.map((e) => ({
          id: e.id,
          accountId: e.accountId,
          entryType: e.entryType as 'debit' | 'credit',
          amount: e.amount.toString(),
          entryHash: e.entryHash,
        })),
      };
    });
  }

  async getLatestTxHash(tenantId: UUID): Promise<string | null> {
    return withTenantTransaction(tenantId, async (trx) => {
      const row = await trx
        .selectFrom('transactions')
        .select('txHash')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirst();

      return row?.txHash ?? null;
    });
  }
}
