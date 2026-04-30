import { formatPct, formatCOP } from '@/lib/formatters';
import type { DashboardSummary } from '@/lib/schemas';

interface Props { summary: DashboardSummary }

export function ProgressBar({ summary }: Props) {
  const { collectedPct, unitsPaid, totalUnits, currentDay, daysInMonth, pendingAmount } = summary;

  return (
    <div className="bg-surface-card rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[11px] text-slate-400">
          Día {currentDay} de {daysInMonth} · {unitsPaid} de {totalUnits} unidades pagaron
        </span>
        <span className="text-sm font-bold text-status-green">
          {formatPct(collectedPct)} cobrado
        </span>
      </div>
      <div
        className="h-2.5 bg-[#1e293b] rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={collectedPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${formatPct(collectedPct)} del recaudo del mes completado`}
      >
        <div
          className="h-full bg-gradient-to-r from-status-green to-green-600 rounded-full transition-all duration-700"
          style={{ width: `${Math.min(collectedPct, 100)}%` }}
        />
      </div>
      {pendingAmount > 0n && (
        <p className="text-[11px] text-status-yellow mt-1.5">
          {formatCOP(pendingAmount)} pendientes de cobro
        </p>
      )}
    </div>
  );
}
