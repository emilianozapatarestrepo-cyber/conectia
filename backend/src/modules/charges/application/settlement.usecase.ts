import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { withTenantTransaction } from '../../../shared/database/db.js';

export interface SettlementResult {
  settledCount: number;
  totalAmount: bigint;
  ledgerTxId: string | null;
}

export class SettlementUseCase {
  async execute(tenantId: string, actorId: string): Promise<SettlementResult> {
    return withTenantTransaction(tenantId, async (trx) => {
      // Find all confirmed intents not yet settled — FOR UPDATE to prevent concurrent settlement
      const intents = await trx
        .selectFrom('paymentIntents')
        .select(['id', 'amount'])
        .where('tenantId', '=', tenantId)
        .where('status', '=', 'confirmed')
        .forUpdate()
        .execute();

      if (intents.length === 0) {
        return { settledCount: 0, totalAmount: 0n, ledgerTxId: null };
      }

      const totalAmount = intents.reduce((sum, pi) => sum + BigInt(pi.amount), 0n);
      const intentIds = intents.map((pi) => pi.id);

      // Look up 1100 (Banco) and 1400 (Procesador por Liquidar)
      const accounts = await trx
        .selectFrom('chartOfAccounts')
        .select(['id', 'code'])
        .where('tenantId', '=', tenantId)
        .where('code', 'in', ['1100', '1400'])
        .where('isActive', '=', true)
        .execute();

      const accBanco = accounts.find((a) => a.code === '1100');
      const accProcesador = accounts.find((a) => a.code === '1400');

      // Acquire hash-chain lock
      const state = await trx
        .selectFrom('tenantLedgerState')
        .select(['currentHash', 'txCount'])
        .where('tenantId', '=', tenantId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      let ledgerTxId: string | null = null;

      if (accBanco && accProcesador) {
        ledgerTxId = uuidv4();
        const prevHash = state.currentHash;
        const txHash = createHash('sha256')
          .update(`settlement:${intentIds.join(',')}:${totalAmount}:${prevHash}`)
          .digest('hex');

        await trx.insertInto('transactions').values({
          id: ledgerTxId,
          tenantId,
          transactionType: 'settlement',
          description: `Liquidación Wompi — ${intents.length} pago${intents.length > 1 ? 's' : ''}`,
          sourceType: 'settlement_batch',
          sourceId: null,
          idempotencyKey: ledgerTxId,
          txHash,
          prevTxHash: prevHash,
          effectiveDate: new Date(),
          periodId: null,
          createdBy: actorId,
        }).execute();

        await trx.insertInto('ledgerEntries').values([
          {
            id: uuidv4(),
            tenantId,
            transactionId: ledgerTxId,
            accountId: accBanco.id,
            entryType: 'debit',
            amount: totalAmount,
            currency: 'COP',
            description: `Liquidación Wompi — acreditar banco`,
            entryHash: createHash('sha256')
              .update(`${ledgerTxId}:${accBanco.id}:debit:${totalAmount}`)
              .digest('hex'),
          },
          {
            id: uuidv4(),
            tenantId,
            transactionId: ledgerTxId,
            accountId: accProcesador.id,
            entryType: 'credit',
            amount: totalAmount,
            currency: 'COP',
            description: `Liquidación Wompi — limpiar procesador`,
            entryHash: createHash('sha256')
              .update(`${ledgerTxId}:${accProcesador.id}:credit:${totalAmount}`)
              .digest('hex'),
          },
        ]).execute();

        await trx
          .updateTable('tenantLedgerState')
          .set({
            currentHash: txHash,
            txCount: sql`tx_count + 1`,
            lastTxId: ledgerTxId,
            updatedAt: new Date(),
          })
          .where('tenantId', '=', tenantId)
          .execute();
      }

      // Mark all intents as settled
      await trx
        .updateTable('paymentIntents')
        .set({ status: 'settled', updatedAt: new Date() })
        .where('tenantId', '=', tenantId)
        .where('id', 'in', intentIds)
        .execute();

      return { settledCount: intents.length, totalAmount, ledgerTxId };
    });
  }
}
