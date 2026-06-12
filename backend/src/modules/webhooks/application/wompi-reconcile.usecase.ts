import { createHash } from 'node:crypto';
import { logger } from '../../../shared/logger.js';
import { WebhookRepository } from '../infrastructure/webhook.repository.js';
import type { WompiTransactionEvent, ReconcileResult } from '../domain/types.js';

const log = logger.child({ module: 'wompi-reconcile' });

export class WompiReconcileUseCase {
  constructor(private readonly repo: WebhookRepository) {}

  // ── Signature verification ─────────────────────────────────────────────────
  // Wompi signs: SHA256(prop1 + prop2 + ... + timestamp + secret)
  verifySignature(event: WompiTransactionEvent, secret: string): boolean {
    try {
      const tx = event.data.transaction;
      const values = event.signature.properties.map((prop) => {
        const key = prop.split('.').pop() as keyof typeof tx;
        return String(tx[key] ?? '');
      });
      const raw = [...values, String(event.timestamp), secret].join('');
      const expected = createHash('sha256').update(raw).digest('hex');
      return expected === event.signature.checksum;
    } catch {
      return false;
    }
  }

  async execute(
    event: WompiTransactionEvent,
    signatureValid: boolean,
  ): Promise<ReconcileResult> {
    const tx = event.data.transaction;

    // 1. Store event (idempotent)
    const { id: webhookEventId, isDuplicate } = await this.repo.storeEvent({
      provider: 'wompi',
      eventType: event.event,
      providerEventId: tx.id,
      idempotencyKey: tx.id,
      rawPayload: event as unknown as Record<string, unknown>,
      signature: event.signature.checksum,
      signatureValid,
    });

    if (isDuplicate) {
      log.info({ wompiTxId: tx.id }, 'Duplicate webhook — skipped');
      return { outcome: 'duplicate', message: 'Already processed' };
    }

    // 2. Only process APPROVED/DECLINED — ignore PENDING, ERROR, VOIDED
    if (tx.status !== 'APPROVED' && tx.status !== 'DECLINED') {
      log.info({ wompiTxId: tx.id, status: tx.status }, 'Non-terminal status — ignored');
      return { outcome: 'ignored', message: `Status ${tx.status} requires no action` };
    }

    // 3. Reject events with invalid signatures in production
    if (!signatureValid) {
      log.warn({ wompiTxId: tx.id }, 'Invalid Wompi signature — rejecting');
      await this.repo.markFailed(webhookEventId, 'Invalid signature');
      return { outcome: 'ignored', message: 'Signature mismatch' };
    }

    const amountCentavos = BigInt(tx.amount_in_cents);

    // 4. Match: exact reference → fuzzy amount window → suspense
    let intent = await this.repo.findIntentByReference(tx.reference);
    const matchType = intent ? 'exact' : 'fuzzy';

    if (!intent) {
      intent = await this.repo.findIntentByAmountWindow(amountCentavos);
    }

    // 5. Handle APPROVED
    if (tx.status === 'APPROVED') {
      if (intent) {
        log.info({ wompiTxId: tx.id, intentId: intent.intentId, matchType }, 'Confirming payment');
        await this.repo.confirmPayment({
          webhookEventId,
          intent,
          wompiTxId: tx.id,
          receiptUrl: null,
          rawPayload: event as unknown as Record<string, unknown>,
        });
        return {
          outcome: 'confirmed',
          chargeId: intent.chargeId ?? undefined,
          paymentIntentId: intent.intentId,
          message: `Payment confirmed via ${matchType} match`,
        };
      }

      // No match — suspense
      log.warn({ wompiTxId: tx.id, amount: tx.amount_in_cents }, 'No matching intent — suspense');
      await this.repo.createSuspenseEntry({
        webhookEventId,
        amount: amountCentavos,
        currency: tx.currency,
        reason: 'unmatched',
      });
      return { outcome: 'suspense', message: 'No matching payment intent — moved to suspense' };
    }

    // 6. Handle DECLINED
    if (intent) {
      log.info({ wompiTxId: tx.id, intentId: intent.intentId }, 'Declining payment');
      await this.repo.declinePayment({
        webhookEventId,
        intent,
        wompiTxId: tx.id,
        rawPayload: event as unknown as Record<string, unknown>,
      });
      return { outcome: 'declined', paymentIntentId: intent.intentId, message: 'Payment declined' };
    }

    return { outcome: 'ignored', message: 'Declined event with no matching intent' };
  }
}
