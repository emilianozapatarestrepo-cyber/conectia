import { Router } from 'express';
import { DashboardController } from './dashboard.controller.js';
import { GetSummaryUseCase } from '../application/get-summary.usecase.js';
import { GetTrendUseCase } from '../application/get-trend.usecase.js';
import { GetAlertsUseCase } from '../application/get-alerts.usecase.js';
import { DashboardRepository } from '../infrastructure/dashboard.repository.js';
import { MarkOverdueUseCase } from '../../charges/application/mark-overdue.usecase.js';
import {
  requireAuth,
  requireTenant,
  requireAdmin,
} from '../../../shared/middlewares/auth.js';
import { requireSubscription } from '../../billing/application/require-subscription.js';

export function createDashboardRouter(): Router {
  const router = Router();
  const repo = new DashboardRepository();
  const controller = new DashboardController(
    new GetSummaryUseCase(repo),
    new GetTrendUseCase(repo),
    new GetAlertsUseCase(repo),
  );

  router.use(requireAuth, requireTenant, requireSubscription);

  router.get('/summary', requireAdmin, controller.summary);
  router.get('/trend',   requireAdmin, controller.trend);
  router.get('/alerts',  requireAdmin, controller.alerts);

  router.get('/delinquent', requireAdmin, async (req, res, next) => {
    try {
      const units = await repo.getDelinquent(req.user!.tenantId!);
      res.json(units.map((u) => ({ ...u, totalOwed: u.totalOwed.toString() })));
    } catch (err) { next(err); }
  });

  // POST /dashboard/mark-overdue — promote past-due active charges to overdue status
  router.post('/mark-overdue', requireAdmin, async (req, res, next) => {
    try {
      const result = await new MarkOverdueUseCase().execute(req.user!.tenantId!);
      res.json({ ...result, totalAmount: result.totalAmount.toString() });
    } catch (err) { next(err); }
  });

  return router;
}
