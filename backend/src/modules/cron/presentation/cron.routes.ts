import { timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '../../../config/env.js';
import { db } from '../../../shared/database/db.js';
import { logger } from '../../../shared/logger.js';
import { MarkOverdueUseCase } from '../../charges/application/mark-overdue.usecase.js';

const log = logger.child({ module: 'cron.routes' });

function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const provided = req.headers['x-cron-secret'];

  if (typeof provided !== 'string') {
    log.warn({ ip: req.ip }, '[SECURITY] Cron invocation without secret header');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const expectedBuf = Buffer.from(env.CRON_SECRET);
    const providedBuf = Buffer.from(provided);

    // Use constant-time comparison to prevent timing oracle attacks
    const lengthMatch = expectedBuf.length === providedBuf.length;
    // Always run the comparison to avoid length-based timing oracle
    const paddedProvided = Buffer.alloc(expectedBuf.length);
    providedBuf.copy(paddedProvided, 0, 0, Math.min(providedBuf.length, expectedBuf.length));
    const secretMatch = timingSafeEqual(expectedBuf, paddedProvided);

    if (!lengthMatch || !secretMatch) {
      log.warn({ ip: req.ip }, '[SECURITY] Cron invocation with invalid secret');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
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
