import { Router } from 'express';
import { z } from 'zod';
import { ChargesRepository } from '../infrastructure/charges.repository.js';
import { ReconcileUseCase } from '../application/reconcile.usecase.js';
import { CreateChargeUseCase } from '../application/create-charge.usecase.js';
import { BatchChargesUseCase } from '../application/batch-charges.usecase.js';
import { PaymentLinkUseCase } from '../application/payment-link.usecase.js';
import { SettlementUseCase } from '../application/settlement.usecase.js';
import { db } from '../../../shared/database/db.js';
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
  const settlementUC = new SettlementUseCase();

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

  // POST /charges/batch — create charges for multiple units, or pull from the unit roster
  // Body A (explicit): { units: [...], concept, dueDate, periodId }
  // Body B (roster):   { useRoster: true, concept, dueDate, periodId }
  router.post('/batch', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const tenantId  = req.user!.tenantId!;
      const createdBy = req.user!.uid;

      const body = z.union([
        batchChargeSchema,
        z.object({
          useRoster: z.literal(true),
          concept:   z.string().min(1).max(200),
          dueDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          periodId:  z.string().uuid().nullable().default(null),
        }),
      ]).parse(req.body);

      const isRoster = 'useRoster' in body && body.useRoster;

      const result = await batchChargesUC.execute({
        tenantId,
        useRoster:    isRoster ? true : undefined,
        rosterUserId: isRoster ? req.user!.uid : undefined,
        units:        !isRoster && 'units' in body
          ? body.units.map((u) => ({ ...u, amount: BigInt(u.amount) }))
          : undefined,
        concept:  body.concept,
        dueDate:  new Date(body.dueDate),
        periodId: body.periodId,
        createdBy,
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

  // POST /charges/bulk-links — generate / reuse payment links for multiple charges in parallel
  // Body: { chargeIds: string[] }  (max 200)
  router.post('/bulk-links', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const { chargeIds } = z.object({
        chargeIds: z.array(z.string().uuid()).min(1).max(200),
      }).parse(req.body);

      const tenantId = req.user!.tenantId!;
      const actorId  = req.user!.uid;

      const results = await Promise.allSettled(
        chargeIds.map((chargeId) =>
          paymentLinkUC.execute({ tenantId, chargeId, actorId }),
        ),
      );

      const payload = results.map((r, i) =>
        r.status === 'fulfilled'
          ? { chargeId: chargeIds[i], ...r.value, ok: true as const }
          : { chargeId: chargeIds[i], ok: false as const, error: (r.reason as Error).message },
      );

      res.json(payload);
    } catch (err) { next(err); }
  });

  // GET /charges/settlement — total amount of confirmed intents pending settlement
  router.get('/settlement', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const rows = await db
        .selectFrom('paymentIntents')
        .select((eb) => [
          eb.fn.count<string>('id').as('count'),
          eb.fn.sum<string>('amount').as('total'),
        ])
        .where('tenantId', '=', tenantId)
        .where('status', '=', 'confirmed')
        .executeTakeFirstOrThrow();
      res.json({
        pendingCount: Number(rows.count),
        pendingAmount: (rows.total ?? '0').toString(),
      });
    } catch (err) { next(err); }
  });

  // POST /charges/settlement — post Dr 1100 / Cr 1400 for all confirmed intents
  router.post('/settlement', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const result = await settlementUC.execute(req.user!.tenantId!, req.user!.uid);
      res.json({ ...result, totalAmount: result.totalAmount.toString() });
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
