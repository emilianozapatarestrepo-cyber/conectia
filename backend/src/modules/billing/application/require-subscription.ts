import type { Request, Response, NextFunction } from 'express';
import { getSubscription } from './billing.service.js';

/**
 * Enforces active subscription on protected routes.
 *
 * Soft enforcement rules:
 *  - trialing:  allowed if trial not expired
 *  - active:    always allowed
 *  - past_due:  allowed during 7-day grace period (read-only flag set)
 *  - cancelled: allowed until period end, then expired
 *  - expired:   403 — upgrade required
 *
 * Routes exempt from billing (always pass-through):
 *  - POST /webhooks/* — payments in flight must never be lost
 *  - GET /pay/*       — public resident payment page
 *  - GET /billing/*   — so clients can always read billing status
 */
export async function requireSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const tenantId = req.user?.tenantId;
  if (!tenantId) { next(); return; }

  try {
    const sub = await getSubscription(tenantId);

    if (!sub) {
      // No subscription record — first boot before migration 006 ran, let through
      next();
      return;
    }

    if (sub.isExpired) {
      res.status(402).json({
        error: 'SUBSCRIPTION_EXPIRED',
        message: 'Tu suscripción ha vencido. Activa un plan para continuar.',
        planCode: sub.planCode,
        expiredAt: sub.currentPeriodEnd,
      });
      return;
    }

    // Attach subscription context for downstream use (e.g. unit limit checks)
    req.subscription = sub;
    next();
  } catch (err) {
    // Billing check failure must never block operations — log and allow
    console.error('[billing] requireSubscription error:', err);
    next();
  }
}
