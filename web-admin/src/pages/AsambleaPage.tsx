import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { useDashboardTrend } from '@/hooks/useDashboardTrend';
import { useDelinquent } from '@/hooks/useDelinquent';
import { formatCOP, formatPct, formatPeriod } from '@/lib/formatters';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HealthScore } from '@/components/dashboard/HealthScore';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { useEffect } from 'react';

export default function AsambleaPage() {
  const navigate = useNavigate();
  const { data: sd } = useDashboardSummary();
  const { data: trend = [] } = useDashboardTrend(12);
  const { data: delinquent = [] } = useDelinquent();

  // Request fullscreen on mount
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  // ESC key exits back to dashboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  if (!sd) {
    return (
      <div className="bg-[#050a14] h-screen flex items-center justify-center text-white">
        Cargando...
      </div>
    );
  }

  const { summary, healthScore } = sd;

  return (
    <div
      className="bg-[#050a14] h-screen w-screen p-10 flex flex-col overflow-hidden"
      role="main"
      aria-label="Modo Asamblea"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white">Informe Financiero</h1>
          <p className="text-slate-400 text-lg mt-1">{formatPeriod(summary.period)}</p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
          aria-label="Salir del modo asamblea"
        >
          <X size={16} />
          Salir
        </button>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Left: KPIs */}
        <div className="flex flex-col gap-4">
          <div className="bg-surface-card rounded-xl p-6">
            <p className="text-slate-400 text-sm uppercase tracking-wider mb-2">Recaudo del mes</p>
            <p className="text-5xl font-bold text-status-green tabular-nums">{formatPct(summary.collectedPct)}</p>
            <p className="text-slate-300 text-xl mt-1 tabular-nums">{formatCOP(summary.collectedAmount)}</p>
          </div>
          <div className="bg-surface-card rounded-xl p-6">
            <p className="text-slate-400 text-sm uppercase tracking-wider mb-2">Morosidad</p>
            <p className="text-5xl font-bold text-status-red tabular-nums">{formatPct(summary.delinquentPct)}</p>
            <p className="text-slate-300 text-xl mt-1">
              {summary.unitsDelinquent} unidades · {formatCOP(summary.delinquentAmount)}
            </p>
          </div>
          <div className="flex-1">
            <HealthScore healthScore={healthScore} />
          </div>
        </div>

        {/* Center: chart */}
        <div className="col-span-1">
          <div className="bg-surface-card rounded-xl p-6 h-full">
            <p className="text-slate-400 text-sm uppercase tracking-wider mb-4">Historial de Recaudo</p>
            <TrendChart data={trend} currentPeriod={summary.period} />
          </div>
        </div>

        {/* Right: top deudores */}
        <div className="bg-surface-card rounded-xl p-6 overflow-y-auto">
          <p className="text-slate-400 text-sm uppercase tracking-wider mb-4">Cartera en Mora</p>
          <div className="space-y-3">
            {delinquent.slice(0, 8).map((d, i) => (
              <div
                key={d.unitId}
                className="flex items-center justify-between py-2 border-b border-surface-border last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 text-sm w-5">{i + 1}.</span>
                  <div>
                    <p className="text-white font-medium">{d.unitLabel}</p>
                    <p className="text-slate-400 text-xs">{d.monthsDelinquent} meses</p>
                  </div>
                </div>
                <span className="text-status-red font-bold tabular-nums text-sm">{formatCOP(d.totalOwed)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
