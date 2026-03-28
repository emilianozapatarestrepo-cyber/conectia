import type { Request, Response, NextFunction } from 'express';
import type { GetSummaryUseCase } from '../application/get-summary.usecase.js';
import type { GetTrendUseCase } from '../application/get-trend.usecase.js';
import type { GetAlertsUseCase } from '../application/get-alerts.usecase.js';
import { summaryQuerySchema, trendQuerySchema } from './validation.js';

export class DashboardController {
  constructor(
    private readonly getSummaryUC: GetSummaryUseCase,
    private readonly getTrendUC: GetTrendUseCase,
    private readonly getAlertsUC: GetAlertsUseCase,
  ) {}

  summary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { period } = summaryQuerySchema.parse(req.query);
      const now = new Date();
      const currentPeriod = period ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const result = await this.getSummaryUC.execute(req.user!.tenantId!, currentPeriod);
      res.json({
        summary: serializeBigInts(result.summary),
        healthScore: result.healthScore,
      });
    } catch (err) { next(err); }
  };

  trend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { months } = trendQuerySchema.parse(req.query);
      const points = await this.getTrendUC.execute(req.user!.tenantId!, months);
      res.json(points.map((p) => ({ ...p, collectedAmount: p.collectedAmount.toString() })));
    } catch (err) { next(err); }
  };

  alerts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const alerts = await this.getAlertsUC.execute(req.user!.tenantId!);
      res.json(alerts.map((a) => ({ ...a, amount: a.amount?.toString() ?? null })));
    } catch (err) { next(err); }
  };
}

function serializeBigInts<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v,
  )) as T;
}
