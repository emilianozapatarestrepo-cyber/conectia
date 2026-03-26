import { describe, it, expect, vi } from 'vitest';
import { GetSummaryUseCase } from '../../src/modules/dashboard/application/get-summary.usecase.js';
import { GetTrendUseCase } from '../../src/modules/dashboard/application/get-trend.usecase.js';
import { GetAlertsUseCase } from '../../src/modules/dashboard/application/get-alerts.usecase.js';
import type { IDashboardRepository } from '../../src/modules/dashboard/domain/interfaces.js';
import type { DashboardSummary, TrendPoint, Alert } from '../../src/modules/dashboard/domain/types.js';

const makeSummary = (overrides?: Partial<DashboardSummary>): DashboardSummary => ({
  tenantId: 'tenant-1',
  period: '2026-05',
  totalUnits: 100,
  unitsPaid: 80,
  unitsDelinquent: 10,
  unitsOverdue: 10,
  collectedAmount: 8_000_000n,
  pendingAmount: 2_000_000n,
  delinquentAmount: 1_000_000n,
  collectedPct: 80,
  delinquentPct: 10,
  pendingReconciliationCount: 0,
  currentDay: 15,
  daysInMonth: 31,
  prevPeriodCollectedPct: null,
  prevPeriodDelinquentPct: null,
  ...overrides,
});

const mockRepo: IDashboardRepository = {
  getSummary: vi.fn().mockResolvedValue(makeSummary()),
  getTrend: vi.fn().mockResolvedValue([] as TrendPoint[]),
  getDelinquent: vi.fn().mockResolvedValue([]),
  getAlerts: vi.fn().mockResolvedValue([] as Alert[]),
};

describe('GetSummaryUseCase', () => {
  it('returns summary with healthScore attached', async () => {
    const uc = new GetSummaryUseCase(mockRepo);
    const result = await uc.execute('tenant-1', '2026-05');
    expect(result.summary.totalUnits).toBe(100);
    expect(result.healthScore.score).toBeGreaterThanOrEqual(0);
    expect(result.healthScore.score).toBeLessThanOrEqual(100);
    expect(['green', 'yellow', 'red']).toContain(result.healthScore.color);
  });

  it('passes tenantId and period to repository', async () => {
    const uc = new GetSummaryUseCase(mockRepo);
    await uc.execute('tenant-abc', '2026-06');
    expect(mockRepo.getSummary).toHaveBeenCalledWith('tenant-abc', '2026-06');
  });
});

describe('GetTrendUseCase', () => {
  it('clamps months between 1 and 24', async () => {
    const uc = new GetTrendUseCase(mockRepo);
    await uc.execute('tenant-1', 0);
    expect(mockRepo.getTrend).toHaveBeenCalledWith('tenant-1', 1);

    await uc.execute('tenant-1', 100);
    expect(mockRepo.getTrend).toHaveBeenCalledWith('tenant-1', 24);
  });

  it('defaults to 6 months', async () => {
    const uc = new GetTrendUseCase(mockRepo);
    await uc.execute('tenant-1');
    expect(mockRepo.getTrend).toHaveBeenCalledWith('tenant-1', 6);
  });
});

describe('GetAlertsUseCase', () => {
  it('returns alerts from repository', async () => {
    const uc = new GetAlertsUseCase(mockRepo);
    const result = await uc.execute('tenant-1');
    expect(mockRepo.getAlerts).toHaveBeenCalledWith('tenant-1');
    expect(Array.isArray(result)).toBe(true);
  });
});
