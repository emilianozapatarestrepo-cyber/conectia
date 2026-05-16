import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../../../config/env.js';
import { requireAuth } from '../../../shared/middlewares/auth.js';
import { OnboardTenantUseCase } from '../application/onboard-tenant.usecase.js';

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

  return router;
}
