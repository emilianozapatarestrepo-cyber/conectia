import { AlertTriangle, Clock, CheckCircle2, BarChart2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DashboardSummary, Alert } from '@/lib/schemas';
import { formatCOP } from '@/lib/formatters';

type Urgency = 'red' | 'amber' | 'blue';

interface ActionItem {
  urgency:     Urgency;
  icon:        React.ReactNode;
  count:       number;
  description: string;
  cta:         string;
  href:        string;
}

const URGENCY_STYLES: Record<Urgency, {
  border: string; bg: string; iconBg: string;
  iconColor: string; countColor: string; ctaClass: string;
}> = {
  red: {
    border:     'border-status-red/30',
    bg:         'bg-status-red/[0.04]',
    iconBg:     'bg-status-red/15',
    iconColor:  'text-status-red',
    countColor: 'text-status-red',
    ctaClass:   'bg-status-red/10 border border-status-red/30 hover:bg-status-red/20 text-status-red',
  },
  amber: {
    border:     'border-status-yellow/30',
    bg:         'bg-status-yellow/[0.04]',
    iconBg:     'bg-status-yellow/15',
    iconColor:  'text-status-yellow',
    countColor: 'text-status-yellow',
    ctaClass:   'bg-status-yellow/10 border border-status-yellow/30 hover:bg-status-yellow/20 text-status-yellow',
  },
  blue: {
    border:     'border-brand-accent/30',
    bg:         'bg-brand-accent/[0.04]',
    iconBg:     'bg-brand-accent/15',
    iconColor:  'text-brand-accent',
    countColor: 'text-brand-accent',
    ctaClass:   'bg-brand-accent/10 border border-brand-accent/30 hover:bg-brand-accent/20 text-brand-accent',
  },
};

function buildActions(summary: DashboardSummary, alerts: Alert[]): ActionItem[] {
  const items: ActionItem[] = [];

  if (summary.unitsDelinquent > 0) {
    items.push({
      urgency:     'red',
      icon:        <AlertTriangle size={14} />,
      count:       summary.unitsDelinquent,
      description: `unidad${summary.unitsDelinquent !== 1 ? 'es' : ''} en mora — ${formatCOP(summary.delinquentAmount)}`,
      cta:         'Ver mora',
      href:        '/morosidad',
    });
  }

  if (summary.pendingReconciliationCount > 0) {
    items.push({
      urgency:     'amber',
      icon:        <RefreshCw size={14} />,
      count:       summary.pendingReconciliationCount,
      description: `pago${summary.pendingReconciliationCount !== 1 ? 's' : ''} por conciliar`,
      cta:         'Conciliar',
      href:        '/conciliacion',
    });
  }

  if (summary.pendingSettlementAmount > 0n) {
    items.push({
      urgency:     'amber',
      icon:        <Clock size={14} />,
      count:       1,
      description: `en procesador — ${formatCOP(summary.pendingSettlementAmount)}`,
      cta:         'Revisar',
      href:        '/conciliacion',
    });
  }

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
  if (criticalAlerts.length > 0) {
    items.push({
      urgency:     'red',
      icon:        <AlertTriangle size={14} />,
      count:       criticalAlerts.length,
      description: `alerta${criticalAlerts.length !== 1 ? 's' : ''} crítica${criticalAlerts.length !== 1 ? 's' : ''} sin resolver`,
      cta:         'Ver alertas',
      href:        '/',
    });
  }

  if (items.length === 0 && summary.unitsOverdue > 0) {
    items.push({
      urgency:     'blue',
      icon:        <BarChart2 size={14} />,
      count:       summary.unitsOverdue,
      description: `unidad${summary.unitsOverdue !== 1 ? 'es' : ''} con cobro pendiente`,
      cta:         'Ver cartera',
      href:        '/cartera',
    });
  }

  return items.slice(0, 4);
}

interface Props {
  summary: DashboardSummary;
  alerts:  Alert[];
}

export function TodayStrip({ summary, alerts }: Props) {
  const navigate = useNavigate();
  const actions = buildActions(summary, alerts);

  return (
    <section>
      <div className="flex items-center gap-2 mb-2.5">
        <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          ¿Qué hago hoy?
        </h2>
        {actions.length > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-status-red/20 text-status-red text-[9px] font-bold">
            {actions.length}
          </span>
        )}
      </div>

      {actions.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-status-green/[0.05] border border-status-green/20">
          <div className="w-7 h-7 rounded-full bg-status-green/15 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={14} className="text-status-green" />
          </div>
          <div>
            <p className="text-status-green text-[12px] font-semibold">Todo al día</p>
            <p className="text-slate-500 text-[11px] mt-0.5">Sin mora, sin conciliaciones pendientes</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {actions.map((item, i) => {
            const s = URGENCY_STYLES[item.urgency];
            return (
              <div
                key={i}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-lg border ${s.border} ${s.bg}`}
              >
                <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${s.iconBg} ${s.iconColor}`}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-bold tabular-nums leading-none ${s.countColor}`}>
                    {item.count}
                  </p>
                  <p className="text-slate-400 text-[11px] leading-snug mt-0.5 truncate">
                    {item.description}
                  </p>
                </div>
                <button
                  onClick={() => navigate(item.href)}
                  className={`flex-shrink-0 px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-colors ${s.ctaClass}`}
                >
                  {item.cta}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
