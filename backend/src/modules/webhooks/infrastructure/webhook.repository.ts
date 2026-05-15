import { sql } from 'kysely';
import { db, withTenantTransaction } from '../../../shared/database/db.js';
import { v4 as uuidv4 } from 'uuid';

export interface MatchedIntent {
  intentId: string;
  tenantId: string;
  chargeId: string | null;
  amount: bigint;
  unitId: string;
  userId: string;
}

export class WebhookRepository {

  // ── Store webhook event (idempotent) ───────────────────────────────────────
  // Returns { id, isDuplicate }
  async storeEvent(opts: {
    provider: string;
    eventType: string;
    providerEventId: string;
    idempotencyKey: string;
    rawPayload: Record<string, unknown>;
    signature: string | null;
    signatureValid: boolean;
  }): Promise<{ id: string; isDuplicate: boolean }> {
    const { providerEventId, idempotencyKey, ...rest } = opts;

    // ON CONFLICT DO NOTHING — idempotency via UNIQUE (provider, idempotency_key)
    const result = await db
      .insertInto('webhookEvents')
      .values({
        provider: rest.provider,
        eventType: rest.eventType,
        providerEventId,
        idempotencyKey,
        rawPayload: JSON.stringify(rest.rawPayload) as unknown as Record<string, unknown>,
        signature: rest.signature,
        signatureValid: rest.signatureValid,
        processingStatus: 'pending',
      })
      .onConflict((oc) => oc.columns(['provider', 'idempotencyKey']).doNothing())
      .returning('id')
      .executeTakeFirst();

    if (!result) {
      // Duplicate — fetch the existing event id
      const existing = await db
        .selectFrom('webhookEvents')
        .select('id')
        .where('provider', '=', opts.provider)
        .where('idempotencyKey', '=', idempotencyKey)
        .executeTakeFirstOrThrow();
      return { id: existing.id, isDuplicate: true };
    }

    return { id: result.id, isDuplicate: false };
  }

  // ── Exact match: our reference field in Wompi = idempotencyKey of intent ──
  async findIntentByReference(reference: string): Promise<MatchedIntent | null> {
    const row = await db
      .selectFrom('paymentIntents')
      .select(['id', 'tenantId', 'chargeId', 'amount', 'unitId', 'userId'])
      .where('idempotencyKey', '=', reference)
      .where('status', '=', 'pending')
      .executeTakeFirst();

    if (!row) return null;
    return {
      intentId: row.id,
      tenantId: row.tenantId,
      chargeId: row.chargeId ?? null,
      amount: typeof row.amount === 'bigint' ? row.amount : BigInt(String(row.amount)),
      unitId: row.unitId,
      userId: row.userId,
    };
  }

  // ── Fuzzy match: same amount + pending + within 24h ────────────────────────
  async findIntentByAmountWindow(amount: bigint): Promise<MatchedIntent | null> {
    const row = await db
      .selectFrom('paymentIntents')
      .select(['id', 'tenantId', 'chargeId', 'amount', 'unitId', 'userId'])
      .where('amount', '=', amount)
      .where('status', '=', 'pending')
      .where('createdAt', '>', sql<Date>`now() - interval '24 hours'`)
      .orderBy('createdAt', 'asc')   // oldest first (FIFO)
      .limit(1)
      .executeTakeFirst();

    if (!row) return null;
    return {
      intentId: row.id,
      tenantId: row.tenantId,
      chargeId: row.chargeId ?? null,
      amount: typeof row.amount === 'bigint' ? row.amount : BigInt(String(row.amount)),
      unitId: row.unitId,
      userId: row.userId,
    };
  }

  // ── Confirm payment: update intent + charge + post ledger entry ────────────
  async confirmPayment(opts: {
    webhookEventId: string;
    intent: MatchedIntent;
    wompiTxId: string;
    receiptUrl: string | null;
    rawPayload: Record<string, unknown>;
  }): Promise<void> {
    const { intent, wompiTxId, receiptUrl, rawPayload, webhookEventId } = opts;

    await withTenantTransaction(intent.tenantId, async (trx) => {
      // 1. Confirm the payment intent
      await trx
        .updateTable('paymentIntents')
        .set({
          status: 'confirmed',
          providerRef: wompiTxId,
          receiptUrl,
          webhookPayload: JSON.stringify(rawPayload) as unknown as Record<string, unknown>,
          webhookReceivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where('id', '=', intent.intentId)
        .where('tenantId', '=', intent.tenantId)
        .execute();

      // 2. Mark charge as paid (only if linked)
      if (intent.chargeId) {
        await trx
          .updateTable('charges')
          .set({
            status: 'paid',
            paidAt: new Date(),
            paidAmount: intent.amount,
            transactionId: intent.intentId,
            updatedAt: new Date(),
          })
          .where('id', '=', intent.chargeId)
          .where('tenantId', '=', intent.tenantId)
          .where('status', 'not in', ['paid', 'cancelled', 'written_off'])
          .execute();
      }

      // 3. Post ledger: Dr 1400 Procesador / Cr 1300 CxC
      //    (money now in processor's hands, clearing the receivable)
      const accounts = await trx
        .selectFrom('chartOfAccounts')
        .select(['id', 'code'])
        .where('tenantId', '=', intent.tenantId)
        .where('code', 'in', ['1300', '1400'])
        .where('isActive', '=', true)
        .execute();

      const acc1300 = accounts.find((a) => a.code === '1300');
      const acc1400 = accounts.find((a) => a.code === '1400');

      if (acc1300 && acc1400) {
        const txId = uuidv4();
        const idempotencyKey = `payment.confirmed.${intent.intentId}`;

        // Acquire ledger state lock (MVCC serialization for hash chain)
        const state = await trx
          .selectFrom('tenantLedgerState')
          .select(['currentHash', 'txCount'])
          .where('tenantId', '=', intent.tenantId)
          .forUpdate()
          .executeTakeFirstOrThrow();

        const prevHash = state.currentHash;
        const txData = `${idempotencyKey}:${intent.amount}:${prevHash}`;
        const txHash = await computeHash(txData);

        await trx.insertInto('transactions').values({
          id: txId,
          tenantId: intent.tenantId,
          transactionType: 'payment',
          description: `Pago confirmado vía Wompi — ref ${wompiTxId}`,
          sourceType: 'payment_intent',
          sourceId: intent.intentId,
          idempotencyKey,
          txHash,
          prevTxHash: prevHash,
          effectiveDate: new Date(),
          periodId: null,
          createdBy: 'system:wompi-webhook',
          createdAt: new Date(),
        }).execute();

        await trx.insertInto('ledgerEntries').values([
          {
            id: uuidv4(),
            tenantId: intent.tenantId,
            transactionId: txId,
            accountId: acc1400.id,      // Dr Procesador por Liquidar
            entryType: 'debit',
            amount: intent.amount,
            currency: 'COP',
            description: `Pago recibido vía Wompi`,
            entryHash: await computeHash(`${txId}:${acc1400.id}:debit:${intent.amount}`),
            createdAt: new Date(),
          },
          {
            id: uuidv4(),
            tenantId: intent.tenantId,
            transactionId: txId,
            accountId: acc1300.id,      // Cr CxC Ordinaria
            entryType: 'credit',
            amount: intent.amount,
            currency: 'COP',
            description: `Cobro saldado — unidad ${intent.unitId}`,
            entryHash: await computeHash(`${txId}:${acc1300.id}:credit:${intent.amount}`),
            createdAt: new Date(),
          },
        ]).execute();

        // Update ledger state hash chain
        await trx
          .updateTable('tenantLedgerState')
          .set({
            currentHash: txHash,
            txCount: sql`${state.txCount} + 1`,
            lastTxId: txId,
            updatedAt: new Date(),
          })
          .where('tenantId', '=', intent.tenantId)
          .execute();
      }

      // 4. Create pago_confirmado alert
      if (intent.chargeId) {
        await trx.insertInto('alerts').values({
          tenantId: intent.tenantId,
          type: 'pago_confirmado',
          severity: 'info',
          unitId: intent.unitId,
          message: `Pago confirmado vía Wompi por unidad ${intent.unitId}`,
          amount: intent.amount,
          createdAt: new Date(),
        }).execute();
      }

      // 5. Mark webhook event as processed
      await db
        .updateTable('webhookEvents')
        .set({
          processingStatus: 'processed',
          relatedIntentId: intent.intentId,
          processedAt: new Date(),
        })
        .where('id', '=', webhookEventId)
        .execute();
    });
  }

  // ── Decline payment: update intent ────────────────────────────────────────
  async declinePayment(opts: {
    webhookEventId: string;
    intent: MatchedIntent;
    wompiTxId: string;
    rawPayload: Record<string, unknown>;
  }): Promise<void> {
    await withTenantTransaction(opts.intent.tenantId, async (trx) => {
      await trx
        .updateTable('paymentIntents')
        .set({
          status: 'failed',
          providerRef: opts.wompiTxId,
          webhookPayload: JSON.stringify(opts.rawPayload) as unknown as Record<string, unknown>,
          webhookReceivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where('id', '=', opts.intent.intentId)
        .where('tenantId', '=', opts.intent.tenantId)
        .execute();
    });

    await db
      .updateTable('webhookEvents')
      .set({
        processingStatus: 'processed',
        relatedIntentId: opts.intent.intentId,
        processedAt: new Date(),
      })
      .where('id', '=', opts.webhookEventId)
      .execute();
  }

  // ── Suspense: payment arrived with no matching intent ─────────────────────
  async createSuspenseEntry(opts: {
    webhookEventId: string;
    amount: bigint;
    currency: string;
    reason: string;
  }): Promise<void> {
    await db.insertInto('suspenseEntries').values({
      webhookEventId: opts.webhookEventId,
      amount: opts.amount,
      currency: opts.currency,
      reason: opts.reason,
      createdAt: new Date(),
    }).execute();

    await db
      .updateTable('webhookEvents')
      .set({ processingStatus: 'processed', processedAt: new Date() })
      .where('id', '=', opts.webhookEventId)
      .execute();
  }

  async markFailed(webhookEventId: string, errorMessage: string): Promise<void> {
    await db
      .updateTable('webhookEvents')
      .set({ processingStatus: 'failed', errorMessage, processedAt: new Date() })
      .where('id', '=', webhookEventId)
      .execute();
  }
}

async function computeHash(data: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(data).digest('hex');
}
