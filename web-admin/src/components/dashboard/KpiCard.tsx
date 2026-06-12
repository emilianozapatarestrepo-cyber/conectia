import { clsx } from 'clsx';

type Color = 'green' | 'yellow' | 'red' | 'blue' | 'purple';
type Size  = 'md' | 'sm';

interface Props {
  label:         string;
  value:         string;
  subValue?:     string;
  trend?:        string;
  trendPositive?: boolean;
  color:         Color;
  size?:         Size;
}

const BORDER_MAP: Record<Color, string> = {
  green:  'border-status-green',
  yellow: 'border-status-yellow',
  red:    'border-status-red',
  blue:   'border-brand-accent',
  purple: 'border-brand-primary',
} as const;

const VALUE_MAP: Record<Color, string> = {
  green:  'text-status-green',
  yellow: 'text-status-yellow',
  red:    'text-status-red',
  blue:   'text-brand-accent',
  purple: 'text-brand-primary',
} as const;

export function KpiCard({ label, value, subValue, trend, trendPositive, color, size = 'md' }: Props) {
  const isSmall = size === 'sm';
  return (
    <div className={clsx(
      'bg-surface-card rounded-lg border-t-2',
      isSmall ? 'px-3 py-3' : 'p-4',
      BORDER_MAP[color],
    )}>
      <p className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase mb-1">
        {label}
      </p>
      <p className={clsx(
        'font-bold tabular-nums',
        isSmall ? 'text-base' : 'text-2xl',
        VALUE_MAP[color],
      )}>
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
