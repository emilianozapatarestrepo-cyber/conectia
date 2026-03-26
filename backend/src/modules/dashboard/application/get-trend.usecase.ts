import type { IDashboardRepository } from '../domain/interfaces.js';

export class GetTrendUseCase {
  constructor(private readonly repo: IDashboardRepository) {}

  async execute(tenantId: string, months = 6) {
    const clampedMonths = Math.min(Math.max(months, 1), 24);
    return this.repo.getTrend(tenantId, clampedMonths);
  }
}
