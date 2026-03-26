import type { IDashboardRepository } from '../domain/interfaces.js';

export class GetAlertsUseCase {
  constructor(private readonly repo: IDashboardRepository) {}

  async execute(tenantId: string) {
    return this.repo.getAlerts(tenantId);
  }
}
