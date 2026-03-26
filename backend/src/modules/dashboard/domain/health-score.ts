import type { HealthScoreResult } from './types.js';

export interface HealthScoreInput {
  totalUnits: number;
  unitsPaid: number;
  unitsDelinquent: number;
  pendingReconciliationCount: number;
  pendingReconciliationHours: number;
}

/**
 * Calculates a 0-100 financial health score for a building.
 *
 * Formula:
 *   base = (recaudoPct × 0.80) + (max(0, 100 - moraPct × 10) × 0.20)
 *   score = max(0, min(100, base - conciliacionPenalty))
 *
 * Weights:
 *   - Recaudo (collection rate):     80% — primary KPI
 *   - Mora (delinquency rate):        20% — penalizes heavily (×10 multiplier per pct point)
 *   - Conciliación (reconciliation):  direct deduction — -10pts per pending >48h, max -20pts
 *
 * Colors: green ≥ 80, yellow 60–79, red < 60
 */
export function calculateHealthScore(input: HealthScoreInput): HealthScoreResult {
  const { totalUnits, unitsPaid, unitsDelinquent, pendingReconciliationCount, pendingReconciliationHours } = input;

  if (totalUnits === 0) {
    return {
      score: 100,
      color: 'green',
      label: 'Sin datos',
      breakdown: { recaudoPct: 100, moraPct: 0, conciliacionPenalty: 0 },
    };
  }

  const recaudoPct = (unitsPaid / totalUnits) * 100;
  const moraPct = (unitsDelinquent / totalUnits) * 100;

  // Recaudo 80%, mora 20%
  const recaudoScore = recaudoPct * 0.80;
  const moraScore = Math.max(0, (100 - moraPct * 10)) * 0.20;

  // Deduct 10pts directly per pending reconciliation >48h, max 20pts deduction
  const conciliacionPenalty = pendingReconciliationHours > 48
    ? Math.min(20, pendingReconciliationCount * 10)
    : 0;

  const raw = recaudoScore + moraScore - conciliacionPenalty;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const color: HealthScoreResult['color'] = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';
  const label = score >= 80 ? 'Excelente' : score >= 60 ? 'Atención requerida' : 'Situación crítica';

  return {
    score,
    color,
    label,
    breakdown: { recaudoPct, moraPct, conciliacionPenalty },
  };
}
