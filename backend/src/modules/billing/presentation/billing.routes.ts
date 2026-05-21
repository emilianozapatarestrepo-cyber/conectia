import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';
import { getSubscription, activatePlan } from '../application/billing.service.js';
import { env } from '../../../config/env.js';

const PLATFORM_KEY = env.PLATFORM_API_KEY ?? '';

function requirePlatformKey(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  if (req.headers['x-platform-key'] !== PLATFORM_KEY || !PLATFORM_KEY) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

export function createBillingRouter(): Router {
  const router = Router();

  // GET /billing/status — current subscription for the authenticated tenant
  router.get('/status', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const sub = await getSubscription(req.user!.tenantId!);
      if (!sub) {
        res.json({ status: 'no_subscription', isActive: true });
        return;
      }
      res.json(sub);
    } catch (err) { next(err); }
  });

  // GET /billing/plans — public catalogue
  router.get('/plans', async (_req, res, next) => {
    try {
      const { db } = await import('../../../shared/database/db.js');
      const plans = await db
        .selectFrom('plans')
        .selectAll()
        .where('isActive', '=', true)
        .orderBy('monthlyPriceCents', 'asc')
        .execute();
      res.json(plans.map((p) => ({
        ...p,
        monthlyPriceCents: p.monthlyPriceCents.toString(),
      })));
    } catch (err) { next(err); }
  });

  // POST /billing/activate — platform team activates/upgrades a plan manually
  // This is the bootstrap payment flow until self-serve Wompi subscriptions are built.
  router.post('/activate', requirePlatformKey, async (req, res, next) => {
    try {
      const body = z.object({
        tenantId:      z.string().uuid(),
        planCode:      z.enum(['starter', 'pro', 'enterprise']),
        paymentMethod: z.string().default('manual'),
        externalRef:   z.string().nullable().default(null),
        activatedBy:   z.string().default('platform'),
      }).parse(req.body);

      const sub = await activatePlan(
        body.tenantId,
        body.planCode,
        body.activatedBy,
        body.paymentMethod,
        body.externalRef,
      );
      res.json(sub);
    } catch (err) { next(err); }
  });

  return router;
}
