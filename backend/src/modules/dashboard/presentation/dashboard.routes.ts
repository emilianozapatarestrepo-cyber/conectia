import { Router } from 'express';
import { DashboardController } from './dashboard.controller.js';
import { GetSummaryUseCase } from '../application/get-summary.usecase.js';
import { GetTrendUseCase } from '../application/get-trend.usecase.js';
import { GetAlertsUseCase } from '../application/get-alerts.usecase.js';
import { DashboardRepository } from '../infrastructure/dashboard.repository.js';
import {
  requireAuth,
  requireTenant,
  requireAdmin,
} from '../../../shared/middlewares/auth.js';

export function createDashboardRouter(): Router {
  const router = Router();
  const repo = new DashboardRepository();
  const controller = new DashboardController(
    new GetSummaryUseCase(repo),
    new GetTrendUseCase(repo),
    new GetAlertsUseCase(repo),
  );

  // All dashboard endpoints require auth + tenant resolution + admin role
  router.get('/summary', requireAuth, requireTenant, requireAdmin, controller.summary);
  router.get('/trend',   requireAuth, requireTenant, requireAdmin, controller.trend);
  router.get('/alerts',  requireAuth, requireTenant, requireAdmin, controller.alerts);

  return router;
}
