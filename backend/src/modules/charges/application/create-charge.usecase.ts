import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { withTenantTransaction } from '../../../shared/database/db.js';

export interface CreateChargeInput {
  tenantId: string;
  unitId: string;
  unitLabel: string;
  ownerName: string | null;
  userId: string;
  amount: bigint;         // centavos COP
  concept: string;
  dueDate: Date;
  periodId: string | null;
  createdBy: string;      // Firebase UID of admin
}

export interface CreateChargeResult {
  chargeId: string;
  ledgerTxId: string | null;
}

export class CreateChargeUseCase {
  async execute(input: CreateChargeInput): Promise<CreateChargeResult> {
    const {
      tenantId, unitId, unitLabel, ownerName, userId,
      amount, concept, dueDate, periodId, createdBy,
    } = input;

    if (amount <= 0n) throw new Error('INVALID_AMOUNT: amount must be positive');

    // Idempotency key derived from the charge's natural key
    const idempotencyKey = uuidv4();

    return withTenantTransaction(tenantId, async (trx) => {
      // Look up accounts needed for the charge posting (Dr 1300 / Cr 4100)
      const accounts = await trx
        .selectFrom('chartOfAccounts')
        .select(['id', 'code'])
        .where('tenantId', '=', tenantId)
        .where('code', 'in', ['1300', '1400', '1310', '4100', '4200', '4300'])
        .where('isActive', '=', true)
        .execute();

      // Choose the right receivable and revenue accounts based on concept type
      const conceptLower = concept.toLowerCase();
      let receivableCode = '1300';  // Default: CxC Ordinaria
      let revenueCode = '4100';     // Default: Cuota Ordinaria

      if (conceptLower.includes('extraordinar')) {
        receivableCode = '1310';
        revenueCode = '4200';
      } else if (conceptLower.includes('multa') || conceptLower.includes('sanción')) {
        receivableCode = '1320';
        revenueCode = '4300';
      }

      const accReceivable = accounts.find((a) => a.code === receivableCode)
        ?? accounts.find((a) => a.code === '1300');
      const accRevenue = accounts.find((a) => a.code === revenueCode)
        ?? accounts.find((a) => a.code === '4100');

      // 1. Create the charge
      const chargeId = uuidv4();
      await trx.insertInto('charges').values({
        id: chargeId,
        tenantId,
        unitId,
        unitLabel,
        ownerName,
        userId,
        concept,
        amount,
        currency: 'COP',
        dueDate,
        periodId,
        status: 'active',
        paidAmount: 0,
        idempotencyKey,
        metadata: '{}',
        createdBy,
      }).execute();

      // 2. Post ledger if accounts are configured (they always are after fn_seed_chart_of_accounts)
      let ledgerTxId: string | null = null;

      if (accReceivable && accRevenue) {
        // Acquire serialization lock
        const state = await trx
          .selectFrom('tenantLedgerState')
          .select(['currentHash', 'txCount'])
          .where('tenantId', '=', tenantId)
          .forUpdate()
          .executeTakeFirstOrThrow();

        ledgerTxId = uuidv4();
        const prevHash = state.currentHash;
        const txHash = createHash('sha256')
          .update(`${chargeId}:${amount}:${prevHash}`)
          .digest('hex');

        await trx.insertInto('transactions').values({
          id: ledgerTxId,
          tenantId,
          transactionType: 'charge',
          description: `Cargo: ${concept} — unidad ${unitId}`,
          sourceType: 'charge',
          sourceId: chargeId,
          idempotencyKey: chargeId,   // charge ID as UUID idempotency key
          txHash,
          prevTxHash: prevHash,
          effectiveDate: new Date(),
          periodId,
          createdBy,
        }).execute();

        await trx.insertInto('ledgerEntries').values([
          {
            id: uuidv4(),
            tenantId,
            transactionId: ledgerTxId,
            accountId: accReceivable.id,
            entryType: 'debit',
            amount,
            currency: 'COP',
            description: `${concept} — ${unitLabel}`,
            entryHash: createHash('sha256')
              .update(`${ledgerTxId}:${accReceivable.id}:debit:${amount}`)
              .digest('hex'),
          },
          {
            id: uuidv4(),
            tenantId,
            transactionId: ledgerTxId,
            accountId: accRevenue.id,
            entryType: 'credit',
            amount,
            currency: 'COP',
            description: `${concept} — ${unitLabel}`,
            entryHash: createHash('sha256')
              .update(`${ledgerTxId}:${accRevenue.id}:credit:${amount}`)
              .digest('hex'),
          },
        ]).execute();

        // Advance hash chain
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

        // Back-link the charge to its ledger transaction
        await trx
          .updateTable('charges')
          .set({ ledgerTxId })
          .where('id', '=', chargeId)
          .execute();
      }

      return { chargeId, ledgerTxId };
    });
  }
}
