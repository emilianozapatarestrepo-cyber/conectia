import { clsx } from 'clsx';
import type { Alert } from '@/lib/schemas';
import { formatCOP } from '@/lib/formatters';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Props { alerts: Alert[] }

const SEVERITY_STYLES = {
  critical: { dot: 'bg-status-red',    text: 'text-status-red',    border: 'border-l-status-red' },
  warning:  { dot: 'bg-status-yellow', text: 'text-status-yellow', border: 'border-l-status-yellow' },
  info:     { dot: 'bg-status-blue',   text: 'text-status-blue',   border: 'border-l-status-blue' },
} as const;

export function AlertsList({ alerts }: Props) {
  const qc = useQueryClient();
  const resolveAlert = useMutation({
    mutationFn: (alertId: string) => api.post(`/alerts/${alertId}/resolve`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['dashboard', 'alerts'] }),
  });

  if (alerts.length === 0) {
    return (
      <div className="bg-surface-card rounded-lg p-4 text-center text-slate-400 text-sm">
        Sin alertas pendientes
      </div>
    );
  }

  return (
    <div className="bg-surface-card rounded-lg p-4 space-y-2">
      <p className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase mb-3">
        REQUIERE ATENCIÓN
      </p>
      {alerts.map((alert) => {
        const styles = SEVERITY_STYLES[alert.severity];
        return (
          <div
            key={alert.id}
            className={clsx('flex items-start justify-between gap-3 p-3 rounded-md bg-[#0d1526] border-l-2', styles.border)}
          >
            <div className="flex items-start gap-2 min-w-0">
              <span className={clsx('w-2 h-2 rounded-full mt-1 flex-shrink-0', styles.dot)} aria-hidden />
              <div className="min-w-0">
                <p className={clsx('text-[11px] font-semibold', styles.text)}>
                  {alert.message}
                </p>
                {alert.amount != null && (
                  <p className="text-[10px] text-slate-400 mt-0.5">{formatCOP(alert.amount)}</p>
                )}
              </div>
            </div>
            {alert.actionLabel && (
              <button
                className="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                onClick={() => resolveAlert.mutate(alert.id)}
                aria-label={alert.actionLabel}
              >
                {alert.actionLabel}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
