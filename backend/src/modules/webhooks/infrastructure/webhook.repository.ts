import { sql } from 'kysely';
import { db, withTenantTransaction } from '../../../shared/database/db.js';
import { createHash } from 'node:crypto';
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
  async storeEvent(opts: {
    provider: string;
    eventType: string;
    providerEventId: string;
    idempotencyKey: string;
    rawPayload: Record<string, unknown>;
    signature: string | null;
    signatureValid: boolean;
  }): Promise<{ id: string; isDuplicate: boolean }> {
    const result = await db
      .insertInto('webhookEvents')
      .values({
        provider: opts.provider,
        eventType: opts.eventType,
        providerEventId: opts.providerEventId,
        idempotencyKey: opts.idempotencyKey,
        rawPayload: JSON.stringify(opts.rawPayload) as unknown as Record<string, unknown>,
        signature: opts.signature,
        signatureValid: opts.signatureValid,
        processingStatus: 'pending',
      })
      .onConflict((oc) => oc.columns(['provider', 'idempotencyKey']).doNothing())
      .returning('id')
      .executeTakeFirst();

    if (!result) {
      const existing = await db
        .selectFrom('webhookEvents')
        .select('id')
        .where('provider', '=', opts.provider)
        .where('idempotencyKey', '=', opts.idempotencyKey)
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
    return this.mapIntent(row);
  }

  // ── Fuzzy match: same amount + pending + within 24h ────────────────────────
  async findIntentByAmountWindow(amount: bigint): Promise<MatchedIntent | null> {
    const row = await db
      .selectFrom('paymentIntents')
      .select(['id', 'tenantId', 'chargeId', 'amount', 'unitId', 'userId'])
      .where('amount', '=', amount)
      .where('status', '=', 'pending')
      .where('createdAt', '>', sql<Date>`now() - interval '24 hours'`)
      .orderBy('createdAt', 'asc')
      .limit(1)
      .executeTakeFirst();

    if (!row) return null;
    return this.mapIntent(row);
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
      // 1. Confirm the payment intent (idempotency guard: WHERE status = 'pending')
      const piResult = await trx
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
        .where('status', '=', 'pending')
        .executeTakeFirst();

      // If no rows updated this was a race — another worker already processed it
      if (!piResult || Number(piResult.numUpdatedRows) === 0) return;

      // 2. Mark linked charge as paid
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
        // Acquire serialization lock on ledger state (prevents hash chain races)
        const state = await trx
          .selectFrom('tenantLedgerState')
          .select(['currentHash', 'txCount'])
          .where('tenantId', '=', intent.tenantId)
          .forUpdate()
          .executeTakeFirstOrThrow();

        const txId = uuidv4();
        // idempotencyKey must be UUID — use payment intent ID (1:1 with payment tx)
        const idempotencyKey = intent.intentId;
        const prevHash = state.currentHash;
        const txHash = computeHash(`${idempotencyKey}:${intent.amount}:${prevHash}`);

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
        }).execute();

        await trx.insertInto('ledgerEntries').values([
          {
            id: uuidv4(),
            tenantId: intent.tenantId,
            transactionId: txId,
            accountId: acc1400.id,
            entryType: 'debit',
            amount: intent.amount,
            currency: 'COP',
            description: `Pago recibido vía Wompi`,
            entryHash: computeHash(`${txId}:${acc1400.id}:debit:${intent.amount}`),
          },
          {
            id: uuidv4(),
            tenantId: intent.tenantId,
            transactionId: txId,
            accountId: acc1300.id,
            entryType: 'credit',
            amount: intent.amount,
            currency: 'COP',
            description: `Cobro saldado — unidad ${intent.unitId}`,
            entryHash: computeHash(`${txId}:${acc1300.id}:credit:${intent.amount}`),
          },
        ]).execute();

        // Advance hash chain atomically
        await trx
          .updateTable('tenantLedgerState')
          .set({
            currentHash: txHash,
            txCount: sql`tx_count + 1`,
            lastTxId: txId,
            updatedAt: new Date(),
          })
          .where('tenantId', '=', intent.tenantId)
          .execute();
      }

      // 4. Alert — fire even without ledger accounts configured
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

      // 5. Mark webhook processed (same transaction = atomic with everything above)
      await trx
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

  // ── Decline payment ────────────────────────────────────────────────────────
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

      await trx
        .updateTable('webhookEvents')
        .set({
          processingStatus: 'processed',
          relatedIntentId: opts.intent.intentId,
          processedAt: new Date(),
        })
        .where('id', '=', opts.webhookEventId)
        .execute();
    });
  }

  // ── Suspense: unmatched payment ────────────────────────────────────────────
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

  private mapIntent(row: {
    id: string;
    tenantId: string;
    chargeId: string | null;
    amount: bigint | string;
    unitId: string;
    userId: string;
  }): MatchedIntent {
    return {
      intentId: row.id,
      tenantId: row.tenantId,
      chargeId: row.chargeId ?? null,
      amount: typeof row.amount === 'bigint' ? row.amount : BigInt(String(row.amount)),
      unitId: row.unitId,
      userId: row.userId,
    };
  }
}

function computeHash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}
