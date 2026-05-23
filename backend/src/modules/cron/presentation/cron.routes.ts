import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '../../../config/env.js';
import { db } from '../../../shared/database/db.js';
import { MarkOverdueUseCase } from '../../charges/application/mark-overdue.usecase.js';

function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = env.CRON_SECRET;
  if (!secret || req.headers['x-cron-secret'] !== secret) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

export function createCronRouter(): Router {
  const router = Router();
  const markOverdueUC = new MarkOverdueUseCase();

  /**
   * POST /cron/nightly
   * Triggered by Railway/Render/Vercel Cron at midnight America/Bogota.
   * Marks all past-due charges overdue across every active tenant.
   * Idempotent — safe to run multiple times.
   */
  router.post('/nightly', requireCronSecret, async (_req, res, next) => {
    try {
      const tenants = await db
        .selectFrom('tenants')
        .select('id')
        .where('isActive', '=', true)
        .execute();

      const results = await Promise.allSettled(
        tenants.map((t) => markOverdueUC.execute(t.id)),
      );

      const summary = results.reduce(
        (acc, r, i) => {
          if (r.status === 'fulfilled') {
            acc.totalMarked += r.value.markedCount;
            acc.succeeded++;
          } else {
            acc.failed.push({ tenantId: tenants[i]!.id, error: (r.reason as Error).message });
          }
          return acc;
        },
        { totalTenants: tenants.length, succeeded: 0, totalMarked: 0, failed: [] as { tenantId: string; error: string }[] },
      );

      res.json(summary);
    } catch (err) { next(err); }
  });

  return router;
}
