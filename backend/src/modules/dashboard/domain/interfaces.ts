import type { DashboardSummary, TrendPoint, DelinquentUnit, Alert } from './types.js';

export interface IDashboardRepository {
  getSummary(tenantId: string, period: string): Promise<DashboardSummary>;
  getTrend(tenantId: string, months: number): Promise<TrendPoint[]>;
  getDelinquent(tenantId: string): Promise<DelinquentUnit[]>;
  getAlerts(tenantId: string): Promise<Alert[]>;
}
