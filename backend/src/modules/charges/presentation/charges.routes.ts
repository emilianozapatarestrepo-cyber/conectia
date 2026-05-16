import { Router } from 'express';
import { z } from 'zod';
import { ChargesRepository } from '../infrastructure/charges.repository.js';
import { ReconcileUseCase } from '../application/reconcile.usecase.js';
import { CreateChargeUseCase } from '../application/create-charge.usecase.js';
import { BatchChargesUseCase } from '../application/batch-charges.usecase.js';
import { PaymentLinkUseCase } from '../application/payment-link.usecase.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';

const createChargeSchema = z.object({
  unitId: z.string().min(1),
  unitLabel: z.string().min(1),
  ownerName: z.string().nullable().default(null),
  userId: z.string().min(1),
  amount: z.number().int().positive(),   // centavos COP
  concept: z.string().min(1).max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD'),
  periodId: z.string().uuid().nullable().default(null),
});

const batchUnitSchema = z.object({
  unitId: z.string().min(1),
  unitLabel: z.string().min(1),
  ownerName: z.string().nullable().default(null),
  userId: z.string().min(1),
  amount: z.number().int().positive(),
});

const batchChargeSchema = z.object({
  units: z.array(batchUnitSchema).min(1).max(500),
  concept: z.string().min(1).max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD'),
  periodId: z.string().uuid().nullable().default(null),
});

export function createChargesRouter(): Router {
  const router = Router();
  const repo = new ChargesRepository();
  const reconcileUC = new ReconcileUseCase(repo);
  const createChargeUC = new CreateChargeUseCase();
  const batchChargesUC = new BatchChargesUseCase();
  const paymentLinkUC = new PaymentLinkUseCase();

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

  // POST /charges — create a charge + post ledger entry
  router.post('/', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const body = createChargeSchema.parse(req.body);
      const result = await createChargeUC.execute({
        tenantId: req.user!.tenantId!,
        unitId: body.unitId,
        unitLabel: body.unitLabel,
        ownerName: body.ownerName,
        userId: body.userId,
        amount: BigInt(body.amount),
        concept: body.concept,
        dueDate: new Date(body.dueDate),
        periodId: body.periodId,
        createdBy: req.user!.uid,
      });
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  // POST /charges/batch — create charges for multiple units in one call
  router.post('/batch', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const body = batchChargeSchema.parse(req.body);
      const result = await batchChargesUC.execute({
        tenantId: req.user!.tenantId!,
        units: body.units.map((u) => ({ ...u, amount: BigInt(u.amount) })),
        concept: body.concept,
        dueDate: new Date(body.dueDate),
        periodId: body.periodId,
        createdBy: req.user!.uid,
      });
      const status = result.failed === 0 ? 201 : result.created === 0 ? 422 : 207;
      res.status(status).json(result);
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

  // POST /charges/:id/payment-link — generate Wompi checkout URL
  router.post('/:id/payment-link', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const chargeId = z.string().uuid().parse(req.params['id']);
      const result = await paymentLinkUC.execute({
        tenantId: req.user!.tenantId!,
        chargeId,
        actorId: req.user!.uid,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message === 'CHARGE_NOT_FOUND') {
        res.status(404).json({ error: 'Charge not found' });
        return;
      }
      if (err instanceof Error && err.message === 'CHARGE_ALREADY_PAID') {
        res.status(409).json({ error: 'Charge is already paid' });
        return;
      }
      if (err instanceof Error && err.message === 'CHARGE_NOT_PAYABLE') {
        res.status(409).json({ error: 'Charge cannot be paid (cancelled or written off)' });
        return;
      }
      next(err);
    }
  });

  return router;
}
