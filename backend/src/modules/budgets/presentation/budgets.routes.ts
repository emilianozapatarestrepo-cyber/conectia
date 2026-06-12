import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../shared/database/db.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';
import { requireSubscription } from '../../billing/application/require-subscription.js';

const createBudgetItemSchema = z.object({
  periodYear: z.number().int().min(2000).max(2100),
  category:   z.string().min(1).max(200),
  concept:    z.string().min(1).max(500),
  budgeted:   z.union([z.number().int().min(0), z.string().regex(/^\d+$/).transform(Number)]),
  executed:   z.union([z.number().int().min(0), z.string().regex(/^\d+$/).transform(Number)]).optional().default(0),
  notes:      z.string().max(2000).nullable().optional().default(null),
});

const updateBudgetItemSchema = z.object({
  category: z.string().min(1).max(200).optional(),
  concept:  z.string().min(1).max(500).optional(),
  budgeted: z.union([z.number().int().min(0), z.string().regex(/^\d+$/).transform(Number)]).optional(),
  executed: z.union([z.number().int().min(0), z.string().regex(/^\d+$/).transform(Number)]).optional(),
  notes:    z.string().max(2000).nullable().optional(),
});

export function createBudgetsRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireTenant, requireSubscription);

  // ── GET /budgets?year=YYYY — list all items for a year ────────────────────
  router.get('/', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const { year } = z.object({
        year: z.coerce.number().int().min(2000).max(2100),
      }).parse(req.query);

      const rows = await db
        .selectFrom('budgetItems')
        .selectAll()
        .where('tenantId', '=', tenantId)
        .where('periodYear', '=', year)
        .orderBy('category', 'asc')
        .orderBy('concept', 'asc')
        .execute();

      res.json(rows.map((r) => ({
        ...r,
        budgeted: String(r.budgeted),
        executed: String(r.executed),
      })));
    } catch (err) { next(err); }
  });

  // ── GET /budgets/summary?year=YYYY — group by category ───────────────────
  router.get('/summary', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const { year } = z.object({
        year: z.coerce.number().int().min(2000).max(2100),
      }).parse(req.query);

      const rows = await db
        .selectFrom('budgetItems')
        .select([
          'category',
          (eb) => eb.fn.sum<string>('budgeted').as('budgeted'),
          (eb) => eb.fn.sum<string>('executed').as('executed'),
          (eb) => eb.fn.countAll<string>().as('itemCount'),
        ])
        .where('tenantId', '=', tenantId)
        .where('periodYear', '=', year)
        .groupBy('category')
        .orderBy('category', 'asc')
        .execute();

      res.json(rows.map((r) => ({
        category:  r.category,
        budgeted:  String(r.budgeted ?? '0'),
        executed:  String(r.executed ?? '0'),
        itemCount: Number(r.itemCount),
      })));
    } catch (err) { next(err); }
  });

  // ── POST /budgets — create item ───────────────────────────────────────────
  router.post('/', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const body     = createBudgetItemSchema.parse(req.body);

      const row = await db
        .insertInto('budgetItems')
        .values({
          tenantId,
          periodYear: body.periodYear,
          category:   body.category,
          concept:    body.concept,
          budgeted:   body.budgeted,
          executed:   body.executed,
          notes:      body.notes ?? null,
          createdBy:  req.user!.uid,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({
        ...row,
        budgeted: String(row.budgeted),
        executed: String(row.executed),
      });
    } catch (err) { next(err); }
  });

  // ── PUT /budgets/:id — update item ────────────────────────────────────────
  router.put('/:id', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;
      const body     = updateBudgetItemSchema.parse(req.body);

      const existing = await db
        .selectFrom('budgetItems')
        .select('id')
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();

      if (!existing) { res.status(404).json({ error: 'Ítem de presupuesto no encontrado' }); return; }

      const updates: Record<string, unknown> = {};
      if (body.category !== undefined) updates['category'] = body.category;
      if (body.concept  !== undefined) updates['concept']  = body.concept;
      if (body.budgeted !== undefined) updates['budgeted'] = body.budgeted;
      if (body.executed !== undefined) updates['executed'] = body.executed;
      if (body.notes    !== undefined) updates['notes']    = body.notes;
      updates['updatedAt'] = new Date();

      const row = await db
        .updateTable('budgetItems')
        .set(updates)
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.json({
        ...row,
        budgeted: String(row.budgeted),
        executed: String(row.executed),
      });
    } catch (err) { next(err); }
  });

  // ── DELETE /budgets/:id — delete item ─────────────────────────────────────
  router.delete('/:id', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;

      const deleted = await db
        .deleteFrom('budgetItems')
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .returning('id')
        .executeTakeFirst();

      if (!deleted) { res.status(404).json({ error: 'Ítem de presupuesto no encontrado' }); return; }
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  return router;
}
