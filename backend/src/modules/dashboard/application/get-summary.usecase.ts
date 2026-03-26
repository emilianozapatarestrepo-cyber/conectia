import type { IDashboardRepository } from '../domain/interfaces.js';
import { calculateHealthScore } from '../domain/health-score.js';

export class GetSummaryUseCase {
  constructor(private readonly repo: IDashboardRepository) {}

  async execute(tenantId: string, period: string) {
    const summary = await this.repo.getSummary(tenantId, period);
    const healthScore = calculateHealthScore({
      totalUnits: summary.totalUnits,
      unitsPaid: summary.unitsPaid,
      unitsDelinquent: summary.unitsDelinquent,
      pendingReconciliationCount: summary.pendingReconciliationCount,
      pendingReconciliationHours: 0, // TODO: compute from payment_intents.created_at in Phase 2
    });
    return { summary, healthScore };
  }
}
