import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { withTenantTransaction } from '../../../shared/database/db.js';
import { db } from '../../../shared/database/db.js';
import { env } from '../../../config/env.js';

export interface PaymentLinkInput {
  tenantId: string;
  chargeId: string;
  actorId: string;
}

export interface PaymentLinkResult {
  url: string;
  paymentIntentId: string;
  reference: string;   // = payment intent idempotencyKey
  amountCents: string; // bigint as string
  currency: string;
}

const WOMPI_CHECKOUT_BASE = 'https://checkout.wompi.co/p/';

export class PaymentLinkUseCase {
  async execute(input: PaymentLinkInput): Promise<PaymentLinkResult> {
    const { tenantId, chargeId, actorId } = input;

    // Verify charge belongs to tenant and is unpaid
    const charge = await withTenantTransaction(tenantId, async (trx) => {
      return trx
        .selectFrom('charges')
        .select(['id', 'tenantId', 'unitId', 'userId', 'amount', 'currency', 'concept', 'status'])
        .where('id', '=', chargeId)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();
    });

    if (!charge) throw new Error('CHARGE_NOT_FOUND');
    if (charge.status === 'paid') throw new Error('CHARGE_ALREADY_PAID');
    if (charge.status === 'cancelled' || charge.status === 'written_off') {
      throw new Error('CHARGE_NOT_PAYABLE');
    }

    const amount = typeof charge.amount === 'bigint'
      ? charge.amount
      : BigInt(String(charge.amount));

    // Return existing pending intent if one already exists for this charge
    const existing = await db
      .selectFrom('paymentIntents')
      .select(['id', 'idempotencyKey', 'amount', 'currency'])
      .where('chargeId', '=', chargeId)
      .where('tenantId', '=', tenantId)
      .where('status', '=', 'pending')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .executeTakeFirst();

    let intentId: string;
    let reference: string;

    if (existing) {
      intentId = existing.id;
      reference = existing.idempotencyKey;
    } else {
      // Create new payment intent
      reference = uuidv4();
      intentId = uuidv4();

      await withTenantTransaction(tenantId, async (trx) => {
        await trx.insertInto('paymentIntents').values({
          id: intentId,
          tenantId,
          unitId: charge.unitId,
          userId: charge.userId,
          chargeIds: [chargeId],
          chargeId,
          amount,
          currency: charge.currency,
          provider: 'wompi',
          status: 'pending',
          idempotencyKey: reference,
          metadata: JSON.stringify({ concept: charge.concept, createdBy: actorId }),
        }).execute();
      });
    }

    const url = buildWompiUrl({
      reference,
      amountCents: amount,
      currency: charge.currency,
    });

    return {
      url,
      paymentIntentId: intentId,
      reference,
      amountCents: amount.toString(),
      currency: charge.currency,
    };
  }
}

function buildWompiUrl(opts: {
  reference: string;
  amountCents: bigint;
  currency: string;
}): string {
  const publicKey = env.WOMPI_PUBLIC_KEY ?? '';
  const integritySecret = env.WOMPI_INTEGRITY_SECRET ?? '';

  // Wompi integrity hash: SHA256(reference + amount + currency + secret)
  const integrityHash = createHash('sha256')
    .update(`${opts.reference}${opts.amountCents}${opts.currency}${integritySecret}`)
    .digest('hex');

  const params = new URLSearchParams({
    'public-key': publicKey,
    currency: opts.currency,
    'amount-in-cents': opts.amountCents.toString(),
    reference: opts.reference,
    'signature:integrity': integrityHash,
  });

  return `${WOMPI_CHECKOUT_BASE}?${params.toString()}`;
}
