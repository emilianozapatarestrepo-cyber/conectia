import { Router } from 'express';
import { z } from 'zod';
import { ChargesRepository } from '../infrastructure/charges.repository.js';
import { ReconcileUseCase } from '../application/reconcile.usecase.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';

export function createChargesRouter(): Router {
  const router = Router();
  const repo = new ChargesRepository();
  const reconcileUC = new ReconcileUseCase(repo);

  // GET /charges?period=YYYY-MM&status=pending|paid|overdue|all&unitId=
  router.get('/', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const filter = z.object({
        period: z.string().optional(),
        status: z.enum(['pending', 'paid', 'overdue', 'all']).default('all'),
        unitId: z.string().optional(),
      }).parse(req.query);
      const charges = await repo.list(req.user!.tenantId!, filter);
      res.json(charges.map((c) => ({ ...c, amount: c.amount.toString() })));
    } catch (err) { next(err); }
  });

  // GET /charges/delinquent
  router.get('/delinquent', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const list = await repo.getDelinquent(req.user!.tenantId!);
      res.json(list.map((c) => ({ ...c, amount: c.amount.toString() })));
    } catch (err) { next(err); }
  });

  // GET /charges/reconciliation
  router.get('/reconciliation', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const list = await repo.getPendingReconciliation(req.user!.tenantId!);
      res.json(list.map((pi) => ({ ...pi, amount: pi.amount.toString() })));
    } catch (err) { next(err); }
  });

  // POST /charges/reconciliation/:id
  router.post('/reconciliation/:id', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const { action, reason } = z.object({
        action: z.enum(['approve', 'reject']),
        reason: z.string().optional(),
      }).parse(req.body);
      const intentId = req.params['id'] as string;
      await reconcileUC.execute(req.user!.tenantId!, intentId, action, req.user!.uid, reason);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  return router;
}
