export interface DashboardSummary {
  tenantId: string;
  period: string;              // 'YYYY-MM'
  totalUnits: number;
  unitsPaid: number;
  unitsDelinquent: number;
  unitsOverdue: number;        // pending but not yet delinquent
  collectedAmount: bigint;     // COP centavos
  pendingAmount: bigint;
  delinquentAmount: bigint;
  collectedPct: number;        // 0-100
  delinquentPct: number;       // 0-100
  pendingReconciliationCount: number;
  currentDay: number;
  daysInMonth: number;
  prevPeriodCollectedPct: number | null;
  prevPeriodDelinquentPct: number | null;
}

export interface TrendPoint {
  period: string;   // 'YYYY-MM'
  label: string;    // 'Ene', 'Feb', etc.
  collectedAmount: bigint;
  collectedPct: number;
}

export interface DelinquentUnit {
  unitId: string;
  unitLabel: string;
  ownerName: string | null;
  totalOwed: bigint;
  monthsDelinquent: number;
  lastPaymentDate: Date | null;
}

export interface Alert {
  id: string;
  type: 'mora_critica' | 'mora_nueva' | 'conciliacion_pendiente' | 'vencimiento_proximo' | 'pago_confirmado';
  severity: 'critical' | 'warning' | 'info';
  unitId: string | null;
  unitLabel: string | null;
  amount: bigint | null;
  message: string;
  actionType: string | null;
  actionLabel: string | null;
  createdAt: Date;
}

export interface HealthScoreResult {
  score: number;          // 0-100
  color: 'green' | 'yellow' | 'red';
  label: string;
  breakdown: {
    recaudoPct: number;
    moraPct: number;
    conciliacionPenalty: number;
  };
}
