import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useCharges } from '@/hooks/useCharges';
import { useUnits } from '@/hooks/useUnits';
import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { useDashboardTrend } from '@/hooks/useDashboardTrend';
import { formatCOP, formatPct, formatPeriod } from '@/lib/formatters';
import { HealthScore } from '@/components/dashboard/HealthScore';
import { TrendChart } from '@/components/dashboard/TrendChart';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

type UnitStatus = 'paid' | 'overdue' | 'pending' | 'no_charge';

interface UnitCard {
  id: string;
  unitId: string;
  label: string;
  ownerName: string | null;
  status: UnitStatus;
  amount: bigint;
}

const STATUS_STYLE: Record<UnitStatus, { bg: string; border: string; dot: string; label: string }> = {
  paid:      { bg: 'bg-emerald-900/40', border: 'border-emerald-500/50', dot: 'bg-emerald-400', label: 'Pagado'    },
  overdue:   { bg: 'bg-red-900/40',     border: 'border-red-500/50',     dot: 'bg-red-400',     label: 'En mora'   },
  pending:   { bg: 'bg-amber-900/30',   border: 'border-amber-500/40',   dot: 'bg-amber-400',   label: 'Pendiente' },
  no_charge: { bg: 'bg-slate-800/30',   border: 'border-slate-700/40',   dot: 'bg-slate-600',   label: 'Sin cargo' },
};

export default function AsambleaPage() {
  const navigate = useNavigate();
  const [period, setPeriod]   = useState(currentPeriod());
  const [clock,  setClock]    = useState(() => new Date());
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  // Live clock tick
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Track last data refresh
  useEffect(() => {
    const id = setInterval(() => setLastRefresh(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Fullscreen on mount
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => { document.exitFullscreen?.().catch(() => {}); };
  }, []);

  // ESC exits
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') navigate('/'); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  const { data: units = [], dataUpdatedAt: unitsUpdatedAt } = useUnits();
  const { data: charges = [] } = useCharges({ status: 'all', period }, 30_000);
  const { data: sd } = useDashboardSummary(period);
  const { data: trend = [] } = useDashboardTrend(6);

  // Build per-unit status grid
  const unitCards: UnitCard[] = useMemo(() => {
    const chargeByUnitId = new Map<string, typeof charges[0]>();
    for (const c of charges) chargeByUnitId.set(c.unitId, c);

    return units
      .filter((u) => u.active)
      .map((u) => {
        const charge = chargeByUnitId.get(u.unitId);
        let status: UnitStatus = 'no_charge';
        let amount = 0n;

        if (charge) {
          amount = charge.amount;
          if (charge.status === 'paid') status = 'paid';
          else if (charge.status === 'overdue') status = 'overdue';
          else status = 'pending';
        }

        return { id: u.id, unitId: u.unitId, label: u.label, ownerName: u.ownerName, status, amount };
      })
      .sort((a, b) => a.unitId.localeCompare(b.unitId, 'es', { numeric: true }));
  }, [units, charges]);

  // Quórum stats
  const quorum = useMemo(() => {
    const withCharge = unitCards.filter((u) => u.status !== 'no_charge');
    const paid       = unitCards.filter((u) => u.status === 'paid');
    const pct = withCharge.length > 0
      ? Math.round((paid.length / withCharge.length) * 100)
      : 0;
    return { total: withCharge.length, paid: paid.length, pct };
  }, [unitCards]);

  const secsSinceRefresh = Math.round((Date.now() - lastRefresh.getTime()) / 1000);

  if (!sd) {
    return (
      <div className="bg-[#050a14] h-screen flex items-center justify-center text-white text-xl">
        Cargando…
      </div>
    );
  }

  const { summary, healthScore } = sd;

  return (
    <div
      className="bg-[#050a14] h-screen w-screen flex flex-col overflow-hidden select-none"
      role="main"
      aria-label="Modo Asamblea"
    >
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-bold text-white tracking-tight">Informe Financiero</h1>
          <span className="text-slate-400 text-base">{formatPeriod(period)}</span>
        </div>

        <div className="flex items-center gap-6">
          {/* Live clock */}
          <div className="text-right">
            <p className="text-white font-mono text-2xl tabular-nums tracking-widest">
              {clock.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-slate-500 text-[10px] text-right">
              act. hace {secsSinceRefresh}s
            </p>
          </div>

          {/* Period selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-white/5 border border-white/15 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none"
          >
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date();
              d.setMonth(d.getMonth() - i);
              const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              return (
                <option key={val} value={val}>
                  {formatPeriod(val)}
                </option>
              );
            })}
          </select>

          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
          >
            <X size={15} />
            Salir
          </button>
        </div>
      </div>

      {/* ── Main body ── */}
      <div className="flex flex-1 min-h-0 gap-0">

        {/* Left sidebar — KPIs + health */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-4 p-6 border-r border-white/10">
          <KpiBlock
            label="Recaudo"
            primary={formatPct(summary.collectedPct)}
            secondary={formatCOP(summary.collectedAmount)}
            color="text-emerald-400"
          />
          <KpiBlock
            label="Morosidad"
            primary={formatPct(summary.delinquentPct)}
            secondary={`${summary.unitsDelinquent} unidades · ${formatCOP(summary.delinquentAmount)}`}
            color="text-red-400"
          />
          <div className="flex-1 min-h-0">
            <HealthScore healthScore={healthScore} />
          </div>
        </div>

        {/* Center — unit grid + quórum bar */}
        <div className="flex-1 flex flex-col min-w-0 p-6 gap-5">

          {/* Quórum bar */}
          <div className="bg-white/5 border border-white/10 rounded-xl px-6 py-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-300 text-sm font-semibold uppercase tracking-widest">
                Quórum de pago
              </p>
              <p className="text-white font-bold text-2xl tabular-nums">
                {quorum.paid} / {quorum.total}
                <span className="text-slate-400 text-base font-normal ml-2">({quorum.pct}%)</span>
              </p>
            </div>
            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  quorum.pct >= 90 ? 'bg-emerald-400' :
                  quorum.pct >= 70 ? 'bg-amber-400'   :
                  'bg-red-400'
                }`}
                style={{ width: `${quorum.pct}%` }}
              />
            </div>
            <div className="flex gap-4 mt-2 text-[11px]">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                {unitCards.filter((u) => u.status === 'paid').length} pagados
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                {unitCards.filter((u) => u.status === 'pending').length} pendientes
              </span>
              <span className="flex items-center gap-1.5 text-red-400">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                {unitCards.filter((u) => u.status === 'overdue').length} en mora
              </span>
            </div>
          </div>

          {/* Unit grid */}
          <div className="flex-1 overflow-y-auto">
            <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-3">
              Estado de pago por unidad
            </p>
            {unitCards.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-slate-500 text-base">
                Sin unidades registradas para este período
              </div>
            ) : (
              <div className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${
                    unitCards.length <= 20 ? 4 :
                    unitCards.length <= 40 ? 5 :
                    unitCards.length <= 60 ? 6 : 7
                  }, minmax(0, 1fr))`,
                }}
              >
                {unitCards.map((u) => {
                  const s = STATUS_STYLE[u.status];
                  return (
                    <div
                      key={u.id}
                      className={`${s.bg} border ${s.border} rounded-xl p-3 flex flex-col gap-1`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white text-xs font-bold truncate">{u.label}</span>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                      </div>
                      {u.ownerName && (
                        <p className="text-slate-400 text-[10px] truncate leading-tight">{u.ownerName.split(' ')[0]}</p>
                      )}
                      <p className="text-[10px] font-semibold mt-0.5"
                        style={{ color: s.dot.replace('bg-', '').includes('emerald') ? '#34d399' :
                          s.dot.includes('red') ? '#f87171' :
                          s.dot.includes('amber') ? '#fbbf24' : '#64748b' }}
                      >
                        {u.status === 'paid' ? '✓ Pagado' :
                         u.status === 'overdue' ? formatCOP(u.amount) :
                         u.status === 'pending' ? formatCOP(u.amount) :
                         '— Sin cargo'}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar — trend chart */}
        <div className="w-64 flex-shrink-0 flex flex-col p-6 border-l border-white/10">
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-4">Historial de Recaudo</p>
          <div className="flex-1 min-h-0">
            <TrendChart data={trend} currentPeriod={period} />
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiBlock({
  label, primary, secondary, color,
}: { label: string; primary: string; secondary: string; color: string }) {
  return (
    <div className="bg-white/5 rounded-xl p-4">
      <p className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-4xl font-bold tabular-nums ${color}`}>{primary}</p>
      <p className="text-slate-300 text-sm mt-1 leading-snug">{secondary}</p>
    </div>
  );
}
