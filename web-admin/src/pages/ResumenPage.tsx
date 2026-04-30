import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { useDashboardTrend } from '@/hooks/useDashboardTrend';
import { useAlerts } from '@/hooks/useAlerts';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { HealthScore } from '@/components/dashboard/HealthScore';
import { AlertsList } from '@/components/dashboard/AlertsList';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { formatCOP, formatPct, formatTrend, formatPeriod } from '@/lib/formatters';
import { Download } from 'lucide-react';

export default function ResumenPage() {
  const { data: summaryData, isLoading, error } = useDashboardSummary();
  const { data: trend = [] } = useDashboardTrend(6);
  const { data: alerts = [] } = useAlerts();

  if (isLoading) return <PageSkeleton />;
  if (error || !summaryData) {
    return (
      <div className="p-6 text-status-red text-sm">
        Error cargando datos: {error?.message ?? 'desconocido'}
      </div>
    );
  }

  const { summary, healthScore } = summaryData;
  const period = summary.period;

  return (
    <div className="p-5 space-y-4 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-base">Resumen Financiero</h1>
          <p className="text-slate-400 text-[11px] mt-0.5">{formatPeriod(period)}</p>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-primary/15 text-brand-primary text-[11px] font-semibold hover:bg-brand-primary/25 transition-colors"
          aria-label="Exportar informe"
        >
          <Download size={13} />
          Exportar
        </button>
      </div>

      {/* Progress bar */}
      <ProgressBar summary={summary} />

      {/* KPI Grid */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label="RECAUDO"
          value={formatCOP(summary.collectedAmount)}
          subValue={formatPct(summary.collectedPct)}
          trend={summary.prevPeriodCollectedPct !== null
            ? formatTrend(summary.collectedPct - summary.prevPeriodCollectedPct)
            : undefined}
          trendPositive={(summary.prevPeriodCollectedPct ?? 0) < summary.collectedPct}
          color="green"
        />
        <KpiCard
          label="PENDIENTE"
          value={formatCOP(summary.pendingAmount)}
          subValue={`${summary.unitsOverdue} unidades`}
          color="yellow"
        />
        <KpiCard
          label="MOROSIDAD"
          value={formatPct(summary.delinquentPct)}
          subValue={`${summary.unitsDelinquent} unidades · ${formatCOP(summary.delinquentAmount)}`}
          trend={summary.prevPeriodDelinquentPct !== null
            ? formatTrend(summary.delinquentPct - summary.prevPeriodDelinquentPct)
            : undefined}
          trendPositive={(summary.prevPeriodDelinquentPct ?? 0) > summary.delinquentPct}
          color="red"
        />
        <KpiCard
          label="POR CONCILIAR"
          value={`${summary.pendingReconciliationCount}`}
          subValue={summary.pendingReconciliationCount > 0 ? 'pagos pendientes' : 'al día'}
          color="blue"
        />
      </div>

      {/* Bottom grid: chart + health score + alerts */}
      <div className="grid grid-cols-[1fr_280px] gap-3">
        <TrendChart data={trend} currentPeriod={period} />
        <div className="space-y-3">
          <HealthScore healthScore={healthScore} />
          <AlertsList alerts={alerts.slice(0, 3)} />
        </div>
      </div>

      {/* Quick actions */}
      <QuickActions />
    </div>
  );
}
