import { clsx } from 'clsx';
import type { HealthScore as HealthScoreType } from '@/lib/schemas';

interface Props { healthScore: HealthScoreType }

const COLOR_MAP = {
  green:  { ring: '#22C55E', text: 'text-status-green' },
  yellow: { ring: '#F59E0B', text: 'text-status-yellow' },
  red:    { ring: '#EF4444', text: 'text-status-red' },
} as const;

export function HealthScore({ healthScore }: Props) {
  const { score, color, label } = healthScore;
  const colors = COLOR_MAP[color];
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="bg-surface-card rounded-lg p-4 flex items-center gap-4">
      <div className="relative flex-shrink-0" aria-label={`Salud financiera: ${score}/100`}>
        <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
          <circle cx="36" cy="36" r="28" fill="none" stroke="#1e293b" strokeWidth="6" />
          <circle
            cx="36" cy="36" r="28"
            fill="none"
            stroke={colors.ring}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={clsx('text-lg font-bold tabular-nums', colors.text)}>{score}</span>
        </div>
      </div>
      <div>
        <p className={clsx('text-sm font-semibold', colors.text)}>{label}</p>
        <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
          Recaudo {healthScore.breakdown.recaudoPct.toFixed(0)}% ·{' '}
          Mora {healthScore.breakdown.moraPct.toFixed(1)}%
        </p>
      </div>
    </div>
  );
}
