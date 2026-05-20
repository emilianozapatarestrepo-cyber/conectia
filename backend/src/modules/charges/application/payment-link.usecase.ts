import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { withTenantTransaction, db } from '../../../shared/database/db.js';
import { env } from '../../../config/env.js';

export interface PaymentLinkInput {
  tenantId: string;
  chargeId: string;
  actorId:  string;
}

export interface PaymentLinkResult {
  url:              string;
  whatsappUrl:      string | null;  // wa.me pre-filled link, null if no phone on file
  paymentIntentId:  string;
  reference:        string;
  amountCents:      string;
  currency:         string;
  ownerPhone:       string | null;
}

const WOMPI_CHECKOUT_BASE = 'https://checkout.wompi.co/p/';

export class PaymentLinkUseCase {
  async execute(input: PaymentLinkInput): Promise<PaymentLinkResult> {
    const { tenantId, chargeId, actorId } = input;

    const charge = await withTenantTransaction(tenantId, async (trx) =>
      trx
        .selectFrom('charges')
        .select(['id', 'tenantId', 'unitId', 'userId', 'amount', 'currency', 'concept', 'status', 'unitLabel', 'ownerName'])
        .where('id', '=', chargeId)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst(),
    );

    if (!charge) throw new Error('CHARGE_NOT_FOUND');
    if (charge.status === 'paid') throw new Error('CHARGE_ALREADY_PAID');
    if (charge.status === 'cancelled' || charge.status === 'written_off') {
      throw new Error('CHARGE_NOT_PAYABLE');
    }

    const amount = typeof charge.amount === 'bigint'
      ? charge.amount
      : BigInt(String(charge.amount));

    // Lookup phone from unit roster
    const unit = await db
      .selectFrom('units')
      .select(['phone', 'ownerName'])
      .where('tenantId', '=', tenantId)
      .where('unitId',   '=', charge.unitId)
      .where('active',   '=', true)
      .executeTakeFirst();

    const phone = unit?.phone ?? null;

    // Idempotent: reuse existing pending intent for this charge
    const existing = await db
      .selectFrom('paymentIntents')
      .select(['id', 'idempotencyKey'])
      .where('chargeId', '=', chargeId)
      .where('tenantId', '=', tenantId)
      .where('status',   '=', 'pending')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .executeTakeFirst();

    let intentId: string;
    let reference: string;

    if (existing) {
      intentId  = existing.id;
      reference = existing.idempotencyKey;
    } else {
      reference = uuidv4();
      intentId  = uuidv4();

      await withTenantTransaction(tenantId, async (trx) =>
        trx.insertInto('paymentIntents').values({
          id:             intentId,
          tenantId,
          unitId:         charge.unitId,
          userId:         charge.userId,
          chargeIds:      [chargeId],
          chargeId,
          amount,
          currency:       charge.currency,
          provider:       'wompi',
          status:         'pending',
          idempotencyKey: reference,
          metadata:       JSON.stringify({ concept: charge.concept, createdBy: actorId }),
        }).execute(),
      );
    }

    const appUrl    = env.APP_URL ?? '';
    const wompiUrl  = buildWompiUrl({ reference, amountCents: amount, currency: charge.currency, appUrl });
    const ownerName = unit?.ownerName ?? charge.ownerName ?? null;

    const whatsappUrl = phone
      ? buildWhatsAppUrl({
          phone,
          ownerName,
          unitLabel:  charge.unitLabel ?? charge.unitId,
          concept:    charge.concept,
          amountCents: amount,
          payUrl:      appUrl ? `${appUrl}/pay/${reference}` : wompiUrl,
        })
      : null;

    return {
      url:             wompiUrl,
      whatsappUrl,
      paymentIntentId: intentId,
      reference,
      amountCents:     amount.toString(),
      currency:        charge.currency,
      ownerPhone:      phone,
    };
  }
}

// ── URL builders ──────────────────────────────────────────────────────────────

function buildWompiUrl(opts: {
  reference:    string;
  amountCents:  bigint;
  currency:     string;
  appUrl:       string;
}): string {
  const integrityHash = createHash('sha256')
    .update(`${opts.reference}${opts.amountCents}${opts.currency}${env.WOMPI_INTEGRITY_SECRET ?? ''}`)
    .digest('hex');

  const params = new URLSearchParams({
    'public-key':          env.WOMPI_PUBLIC_KEY ?? '',
    currency:              opts.currency,
    'amount-in-cents':     opts.amountCents.toString(),
    reference:             opts.reference,
    'signature:integrity': integrityHash,
    ...(opts.appUrl && { 'redirect-url': `${opts.appUrl}/pay/${opts.reference}` }),
  });

  return `${WOMPI_CHECKOUT_BASE}?${params.toString()}`;
}

function buildWhatsAppUrl(opts: {
  phone:       string;
  ownerName:   string | null;
  unitLabel:   string;
  concept:     string;
  amountCents: bigint;
  payUrl:      string;
}): string {
  const pesos  = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(Number(opts.amountCents) / 100);

  const name   = opts.ownerName ? `Hola ${opts.ownerName.split(' ')[0]},` : 'Hola,';
  const text   = `${name} te adjuntamos el link de pago para *${opts.concept}* de la unidad *${opts.unitLabel}* por *${pesos}*.\n\nPaga aquí 👉 ${opts.payUrl}`;

  // Colombian numbers — ensure +57 prefix
  const normalized = opts.phone.replace(/\D/g, '');
  const full = normalized.startsWith('57') ? normalized : `57${normalized}`;

  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}
