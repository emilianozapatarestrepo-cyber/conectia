import { clsx } from 'clsx';
import { formatCOP } from '@/lib/formatters';

interface Props {
  budgeted:     bigint;
  executed:     bigint;
  showAmounts?: boolean;
}

export function BudgetProgressBar({ budgeted, executed, showAmounts }: Props) {
  if (budgeted === 0n) {
    return <span className="text-[11px] text-slate-500">Sin presupuesto</span>;
  }

  const pct = Math.min(100, Number((executed * 10000n) / budgeted) / 100);
  const pctDisplay = `${Math.round(pct)}%`;

  const barColor =
    pct >= 100 ? 'bg-status-red' :
    pct >= 80  ? 'bg-status-yellow' :
                 'bg-status-green';

  const textColor =
    pct >= 100 ? 'text-status-red' :
    pct >= 80  ? 'text-status-yellow' :
                 'text-status-green';

  return (
    <div className="space-y-1 min-w-[100px]">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all', barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={clsx('text-[11px] font-semibold tabular-nums w-8 text-right flex-shrink-0', textColor)}>
          {pctDisplay}
        </span>
      </div>
      {showAmounts && (
        <p className="text-[10px] text-slate-500 tabular-nums">
          {formatCOP(executed)} / {formatCOP(budgeted)}
        </p>
      )}
    </div>
  );
}
