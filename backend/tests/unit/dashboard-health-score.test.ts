import { describe, it, expect } from 'vitest';
import { calculateHealthScore, type HealthScoreInput } from '../../src/modules/dashboard/domain/health-score.js';

describe('calculateHealthScore', () => {
  const base: HealthScoreInput = {
    totalUnits: 100,
    unitsPaid: 95,
    unitsDelinquent: 3,
    pendingReconciliationCount: 0,
    pendingReconciliationHours: 0,
  };

  it('returns 100 when all units paid and nothing pending', () => {
    const result = calculateHealthScore({ ...base, unitsPaid: 100, unitsDelinquent: 0 });
    expect(result.score).toBe(100);
    expect(result.label).toBe('Excelente');
  });

  it('returns green (>=80) for healthy building', () => {
    const result = calculateHealthScore(base);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.color).toBe('green');
  });

  it('returns yellow (60-79) when mora is elevated', () => {
    const result = calculateHealthScore({ ...base, unitsDelinquent: 15, unitsPaid: 85 });
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThan(80);
    expect(result.color).toBe('yellow');
  });

  it('returns red (<60) when mora is critical', () => {
    const result = calculateHealthScore({ ...base, unitsDelinquent: 30, unitsPaid: 70 });
    expect(result.score).toBeLessThan(60);
    expect(result.color).toBe('red');
  });

  it('reduces score by 4 points for 2 pending reconciliations >48h (20pt penalty × 0.20 weight)', () => {
    const withoutPending = calculateHealthScore(base);
    const withPending = calculateHealthScore({ ...base, pendingReconciliationCount: 2, pendingReconciliationHours: 72 });
    expect(withPending.score).toBe(withoutPending.score - 4);
  });

  it('does not go below 0', () => {
    const result = calculateHealthScore({ ...base, unitsDelinquent: 50, unitsPaid: 50, pendingReconciliationCount: 20, pendingReconciliationHours: 200 });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('returns "Sin datos" label when totalUnits is 0', () => {
    const result = calculateHealthScore({ totalUnits: 0, unitsPaid: 0, unitsDelinquent: 0, pendingReconciliationCount: 0, pendingReconciliationHours: 0 });
    expect(result.score).toBe(100);
    expect(result.label).toBe('Sin datos');
  });
});
