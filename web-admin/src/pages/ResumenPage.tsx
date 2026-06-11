import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { useDashboardTrend } from '@/hooks/useDashboardTrend';
import { useAlerts } from '@/hooks/useAlerts';
import { useBudgetSummary } from '@/hooks/useBudget';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { HealthScore } from '@/components/dashboard/HealthScore';
import { AlertsList } from '@/components/dashboard/AlertsList';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { TodayStrip } from '@/components/dashboard/TodayStrip';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { SpinnerIcon } from '@/components/ui/icons';
import { formatCOP, formatPct, formatTrend, formatPeriod } from '@/lib/formatters';
import { Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';

// ── Budget widget ─────────────────────────────────────────────────────────────

function BudgetWidget() {
  const year = new Date().getFullYear();
  const { data: summaryRows = [], isLoading } = useBudgetSummary(year);

  const totalBudgeted = summaryRows.reduce((s, r) => s + BigInt(r.budgeted), 0n);
  const totalExecuted = summaryRows.reduce((s, r) => s + BigInt(r.executed), 0n);
  const executionPct = totalBudgeted > 0n
    ? Math.min(100, Number((totalExecuted * 10000n) / totalBudgeted) / 100)
    : 0;

  const pctColor =
    executionPct >= 100 ? 'text-status-red' :
    executionPct >= 80  ? 'text-status-yellow' :
                          'text-status-green';
  const barColor =
    executionPct >= 100 ? 'bg-status-red' :
    executionPct >= 80  ? 'bg-status-yellow' :
                          'bg-status-green';

  return (
    <div className="bg-surface-card rounded-lg border border-surface-border p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Presupuesto {year}</p>
        <Link
          to="/presupuesto"
          className="text-[11px] text-brand-primary hover:text-brand-primary/80 transition-colors"
        >
          Ver detalle →
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-400 text-[12px] py-2">
          <SpinnerIcon className="w-3.5 h-3.5" />
          Cargando…
        </div>
      ) : summaryRows.length === 0 ? (
        <p className="text-[12px] text-slate-500 py-2">Sin presupuesto configurado</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-white font-bold text-lg tabular-nums">{formatCOP(totalExecuted)}</p>
              <p className="text-[11px] text-slate-500">de {formatCOP(totalBudgeted)}</p>
            </div>
            <p className={clsx('font-bold text-xl tabular-nums', pctColor)}>
              {Math.round(executionPct)}%
            </p>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all', barColor)}
              style={{ width: `${executionPct}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500">
            {summaryRows.length} categoría{summaryRows.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

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
          <h1 className="text-white font-bold text-[15px] tracking-tight">Resumen Financiero</h1>
          <p className="text-slate-400 text-[12px] mt-0.5">{formatPeriod(period)}</p>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-surface-border bg-surface-card text-slate-300 hover:text-white hover:border-slate-500 text-[12px] font-medium transition-all"
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
          label="EN PROCESADOR"
          value={formatCOP(summary.pendingSettlementAmount)}
          subValue={summary.pendingSettlementAmount > 0n ? 'pendiente de liquidar' : 'al día'}
          color="blue"
        />
      </div>

      {/* ¿Qué hago hoy? — data-driven action strip */}
      <TodayStrip summary={summary} alerts={alerts} />

      {/* Bottom grid: chart + health score + alerts */}
      <div className="grid grid-cols-[1fr_280px] gap-3">
        <TrendChart data={trend} currentPeriod={period} />
        <div className="space-y-3">
          <HealthScore healthScore={healthScore} />
          <BudgetWidget />
          <AlertsList alerts={alerts.slice(0, 3)} />
        </div>
      </div>

      {/* Quick actions */}
      <QuickActions />
    </div>
  );
}
