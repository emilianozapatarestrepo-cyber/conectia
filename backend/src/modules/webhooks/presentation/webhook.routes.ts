import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '../../../config/env.js';
import { logger } from '../../../shared/logger.js';
import { WebhookRepository } from '../infrastructure/webhook.repository.js';
import { WompiReconcileUseCase } from '../application/wompi-reconcile.usecase.js';
import type { WompiTransactionEvent } from '../domain/types.js';

const log = logger.child({ module: 'webhook.routes' });

export function createWebhookRouter(): Router {
  const router = Router();
  const repo = new WebhookRepository();
  const reconcileUC = new WompiReconcileUseCase(repo);

  // POST /webhooks/wompi
  // No auth — called directly by Wompi. Signature is verified inside the use case.
  router.post('/wompi', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const event = req.body as WompiTransactionEvent;

      // Basic shape guard before touching the DB
      if (!event?.event || !event?.data?.transaction?.id) {
        res.status(400).json({ error: 'Malformed Wompi event' });
        return;
      }

      const secret = env.WOMPI_EVENTS_SECRET ?? '';
      const signatureValid = secret
        ? reconcileUC.verifySignature(event, secret)
        : false;

      if (!signatureValid && env.NODE_ENV === 'production') {
        log.warn({ txId: event.data.transaction.id }, 'Wompi signature invalid in production');
        // Still return 200 to Wompi — don't expose rejection reason
        res.json({ received: true });
        return;
      }

      const result = await reconcileUC.execute(event, signatureValid);

      log.info({ outcome: result.outcome, txId: event.data.transaction.id }, 'Webhook processed');

      // Always 200 — Wompi retries on non-2xx and we use idempotency to deduplicate
      res.json({ received: true, outcome: result.outcome });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
