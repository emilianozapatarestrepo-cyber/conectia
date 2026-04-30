import { z } from 'zod';

// Bigint strings from backend
const bigintStr = z.string().transform((v) => BigInt(v));

export const dashboardSummarySchema = z.object({
  tenantId: z.string(),
  period: z.string(),
  totalUnits: z.number(),
  unitsPaid: z.number(),
  unitsDelinquent: z.number(),
  unitsOverdue: z.number(),
  collectedAmount: bigintStr,
  pendingAmount: bigintStr,
  delinquentAmount: bigintStr,
  collectedPct: z.number(),
  delinquentPct: z.number(),
  pendingReconciliationCount: z.number(),
  currentDay: z.number(),
  daysInMonth: z.number(),
  prevPeriodCollectedPct: z.number().nullable(),
  prevPeriodDelinquentPct: z.number().nullable(),
});

export const healthScoreSchema = z.object({
  score: z.number().min(0).max(100),
  color: z.enum(['green', 'yellow', 'red']),
  label: z.string(),
  breakdown: z.object({
    recaudoPct: z.number(),
    moraPct: z.number(),
    conciliacionPenalty: z.number(),
  }),
});

export const summaryResponseSchema = z.object({
  summary: dashboardSummarySchema,
  healthScore: healthScoreSchema,
});

export const trendPointSchema = z.object({
  period: z.string(),
  label: z.string(),
  collectedAmount: bigintStr,
  collectedPct: z.number(),
});

export const alertSchema = z.object({
  id: z.string(),
  type: z.enum(['mora_critica', 'mora_nueva', 'conciliacion_pendiente', 'vencimiento_proximo', 'pago_confirmado']),
  severity: z.enum(['critical', 'warning', 'info']),
  unitId: z.string().nullable(),
  unitLabel: z.string().nullable(),
  amount: z.string().nullable().transform((v) => (v ? BigInt(v) : null)),
  message: z.string(),
  actionType: z.string().nullable(),
  actionLabel: z.string().nullable(),
  createdAt: z.string().transform((v) => new Date(v)),
});

export const chargeSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  unitLabel: z.string(),
  ownerName: z.string().nullable(),
  amount: bigintStr,
  concept: z.string(),
  dueDate: z.string().transform((v) => new Date(v)),
  status: z.enum(['draft', 'active', 'paid', 'partial', 'overdue', 'cancelled', 'written_off']),
  paidAt: z.string().nullable().transform((v) => (v ? new Date(v) : null)),
});

export const delinquentUnitSchema = z.object({
  unitId: z.string(),
  unitLabel: z.string(),
  ownerName: z.string().nullable(),
  totalOwed: bigintStr,
  monthsDelinquent: z.number(),
  lastPaymentDate: z.string().nullable().transform((v) => (v ? new Date(v) : null)),
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
export type HealthScore = z.infer<typeof healthScoreSchema>;
export type SummaryResponse = z.infer<typeof summaryResponseSchema>;
export type TrendPoint = z.infer<typeof trendPointSchema>;
export type Alert = z.infer<typeof alertSchema>;
export type Charge = z.infer<typeof chargeSchema>;
export type DelinquentUnit = z.infer<typeof delinquentUnitSchema>;
