import { clsx } from 'clsx';

interface Props {
  label: string;
  value: string;
  subValue?: string;
  trend?: string;
  trendPositive?: boolean;
  color: 'green' | 'yellow' | 'red' | 'blue';
}

const COLOR_MAP = {
  green:  'border-status-green',
  yellow: 'border-status-yellow',
  red:    'border-status-red',
  blue:   'border-status-blue',
} as const;

const VALUE_COLOR_MAP = {
  green:  'text-status-green',
  yellow: 'text-status-yellow',
  red:    'text-status-red',
  blue:   'text-status-blue',
} as const;

export function KpiCard({ label, value, subValue, trend, trendPositive, color }: Props) {
  return (
    <div className={clsx('bg-surface-card rounded-lg p-4 border-t-2', COLOR_MAP[color])}>
      <p className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase mb-1">
        {label}
      </p>
      <p className={clsx('text-2xl font-bold tabular-nums', VALUE_COLOR_MAP[color])}>
        {value}
      </p>
      {subValue && (
        <p className="text-[11px] text-slate-400 mt-0.5">{subValue}</p>
      )}
      {trend && (
        <p className={clsx('text-[11px] font-semibold mt-1', trendPositive ? 'text-status-green' : 'text-status-red')}>
          {trend}
        </p>
      )}
    </div>
  );
}
