import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../../../config/env.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';
import { requireSubscription } from '../../billing/application/require-subscription.js';
import { OnboardTenantUseCase } from '../application/onboard-tenant.usecase.js';
import { db } from '../../../shared/database/db.js';

const onboardSchema = z.object({
  name: z.string().min(2).max(200),
  type: z.enum(['conjunto_residencial', 'edificio', 'oficinas', 'parqueadero', 'otro']),
  address: z.string().max(500).nullable().default(null),
  taxId: z.string().max(20).nullable().default(null),
  currency: z.string().length(3).default('COP'),
  timezone: z.string().default('America/Bogota'),
});

function requirePlatformKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-platform-key'];
  const expected = env.PLATFORM_API_KEY;
  if (!expected || key !== expected) {
    res.status(403).json({ error: 'Platform API key required' });
    return;
  }
  next();
}

export function createTenantsRouter(): Router {
  const router = Router();
  const onboardUC = new OnboardTenantUseCase();

  // POST /api/v1/tenants
  // Auth: Firebase token (to identify the admin) + Platform API key (to authorize tenant creation)
  router.post('/', requirePlatformKey, requireAuth, async (req, res, next) => {
    try {
      const body = onboardSchema.parse(req.body);
      const result = await onboardUC.execute({
        ...body,
        adminFirebaseUid: req.user!.uid,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/tenants/profile — building profile for authenticated admin
  router.get('/profile', requireAuth, requireTenant, requireSubscription, requireAdmin, async (req, res, next) => {
    try {
      const tenant = await db
        .selectFrom('tenants')
        .select(['id', 'name', 'type', 'address', 'taxId', 'timezone', 'currency'])
        .where('id', '=', req.user!.tenantId!)
        .executeTakeFirstOrThrow();
      res.json(tenant);
    } catch (err) { next(err); }
  });

  const updateProfileSchema = z.object({
    name:     z.string().min(2).max(200).optional(),
    type:     z.enum(['conjunto_residencial', 'edificio', 'oficinas', 'parqueadero', 'otro']).optional(),
    address:  z.string().max(500).nullable().optional(),
    taxId:    z.string().max(20).nullable().optional(),
    timezone: z.string().optional(),
  });

  // PATCH /api/v1/tenants/profile — update building profile
  router.patch('/profile', requireAuth, requireTenant, requireSubscription, requireAdmin, async (req, res, next) => {
    try {
      const updates = updateProfileSchema.parse(req.body);
      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }
      await db
        .updateTable('tenants')
        .set({ ...updates, updatedAt: new Date() })
        .where('id', '=', req.user!.tenantId!)
        .execute();
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  return router;
}
