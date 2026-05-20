import { Router } from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { db } from '../../../shared/database/db.js';
import { env } from '../../../config/env.js';

const WOMPI_CHECKOUT_BASE = 'https://checkout.wompi.co/p/';

export function createPayRouter(): Router {
  const router = Router();

  // GET /pay/:reference — public, no auth
  // Returns everything a resident needs to see their charge and pay
  router.get('/:reference', async (req, res, next) => {
    try {
      const reference = z.string().uuid('Invalid payment reference').parse(req.params['reference']);

      // Look up payment intent by idempotency key (= the reference we gave Wompi)
      const intent = await db
        .selectFrom('paymentIntents as pi')
        .innerJoin('tenants as t', 't.id', 'pi.tenantId')
        .select([
          'pi.id',
          'pi.status',
          'pi.amount',
          'pi.currency',
          'pi.chargeId',
          'pi.unitId',
          'pi.webhookReceivedAt',
          't.name as tenantName',
          't.address as tenantAddress',
        ])
        .where('pi.idempotencyKey', '=', reference)
        .executeTakeFirst();

      if (!intent) {
        res.status(404).json({ error: 'Referencia de pago no encontrada' });
        return;
      }

      const amount = typeof intent.amount === 'bigint'
        ? intent.amount
        : BigInt(String(intent.amount));

      // Fetch charge details if linked
      let concept = 'Cuota de Administración';
      let dueDate: string | null = null;
      let ownerName: string | null = null;
      let unitLabel = intent.unitId;

      if (intent.chargeId) {
        const charge = await db
          .selectFrom('charges')
          .select(['concept', 'dueDate', 'ownerName', 'unitLabel', 'paidAt'])
          .where('id', '=', intent.chargeId)
          .executeTakeFirst();

        if (charge) {
          concept   = charge.concept;
          ownerName = charge.ownerName ?? null;
          unitLabel = charge.unitLabel ?? intent.unitId;
          dueDate   = charge.dueDate instanceof Date
            ? charge.dueDate.toISOString().slice(0, 10)
            : String(charge.dueDate).slice(0, 10);
        }
      }

      // Build Wompi URL (only if not yet paid)
      let wompiUrl: string | null = null;
      if (intent.status === 'pending') {
        const integritySecret = env.WOMPI_INTEGRITY_SECRET ?? '';
        const publicKey       = env.WOMPI_PUBLIC_KEY ?? '';
        const integrityHash   = createHash('sha256')
          .update(`${reference}${amount}${intent.currency}${integritySecret}`)
          .digest('hex');

        const params = new URLSearchParams({
          'public-key':        publicKey,
          currency:            intent.currency,
          'amount-in-cents':   amount.toString(),
          reference,
          'signature:integrity': integrityHash,
          'redirect-url': `${env.APP_URL ?? ''}/pay/${reference}`,
        });
        wompiUrl = `${WOMPI_CHECKOUT_BASE}?${params.toString()}`;
      }

      res.json({
        reference,
        status:       intent.status,
        tenantName:   intent.tenantName,
        tenantAddress: intent.tenantAddress ?? null,
        unitId:       intent.unitId,
        unitLabel,
        ownerName,
        concept,
        dueDate,
        amountCents:  amount.toString(),
        currency:     intent.currency,
        paidAt:       intent.webhookReceivedAt
          ? (intent.webhookReceivedAt instanceof Date
              ? intent.webhookReceivedAt.toISOString()
              : String(intent.webhookReceivedAt))
          : null,
        wompiUrl,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
