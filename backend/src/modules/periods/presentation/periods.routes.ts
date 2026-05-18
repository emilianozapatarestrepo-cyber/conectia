import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { withTenantTransaction } from '../../../shared/database/db.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';

const createPeriodSchema = z.object({
  year:    z.number().int().min(2020).max(2100),
  month:   z.number().int().min(1).max(12),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD'),
});

const MONTH_NAMES_ES = [
  '', 'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0); // day=0 → last day of previous month
}

export function createPeriodsRouter(): Router {
  const router = Router();

  // GET /periods
  router.get('/', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const rows = await withTenantTransaction(req.user!.tenantId!, async (trx) => {
        return trx
          .selectFrom('periods')
          .select(['id', 'label', 'year', 'month', 'startsAt', 'endsAt', 'dueDate', 'createdAt'])
          .where('tenantId', '=', req.user!.tenantId!)
          .orderBy('year', 'desc')
          .orderBy('month', 'desc')
          .limit(24)
          .execute();
      });
      res.json(rows.map((r) => ({
        ...r,
        startsAt: r.startsAt instanceof Date ? r.startsAt.toISOString().slice(0, 10)
          : String(r.startsAt).slice(0, 10),
        endsAt: r.endsAt instanceof Date ? r.endsAt.toISOString().slice(0, 10)
          : String(r.endsAt).slice(0, 10),
        dueDate: r.dueDate instanceof Date ? r.dueDate.toISOString().slice(0, 10)
          : String(r.dueDate).slice(0, 10),
      })));
    } catch (err) { next(err); }
  });

  // POST /periods
  router.post('/', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const { year, month, dueDate } = createPeriodSchema.parse(req.body);
      const tenantId = req.user!.tenantId!;

      const startsAt = new Date(year, month - 1, 1);  // first of month
      const endsAt   = lastDayOfMonth(year, month);    // last of month
      const label    = `${MONTH_NAMES_ES[month]} ${year}`;
      const id       = uuidv4();

      await withTenantTransaction(tenantId, async (trx) => {
        await trx.insertInto('periods').values({
          id,
          tenantId,
          label,
          year,
          month,
          startsAt,
          endsAt,
          dueDate,
        })
        // Idempotent: if period for this month already exists, return it
        .onConflict((oc) => oc.columns(['tenantId', 'year', 'month']).doNothing())
        .execute();
      });

      // Return the period (may be the existing one if conflict)
      const period = await withTenantTransaction(tenantId, async (trx) =>
        trx
          .selectFrom('periods')
          .selectAll()
          .where('tenantId', '=', tenantId)
          .where('year', '=', year)
          .where('month', '=', month)
          .executeTakeFirstOrThrow(),
      );

      res.status(201).json({
        id: period.id,
        label: period.label,
        year: period.year,
        month: period.month,
        dueDate: period.dueDate instanceof Date
          ? period.dueDate.toISOString().slice(0, 10)
          : String(period.dueDate).slice(0, 10),
      });
    } catch (err) { next(err); }
  });

  return router;
}
