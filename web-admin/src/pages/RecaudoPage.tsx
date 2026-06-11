import { useState } from 'react';
import {
  Zap, Plus, TrendingUp, Clock, AlertTriangle, ChevronDown,
} from 'lucide-react';
import { useCharges } from '@/hooks/useCharges';
import { useUnits } from '@/hooks/useUnits';
import { usePeriods } from '@/hooks/usePeriods';
import { formatCOP } from '@/lib/formatters';
import { ChargesTable } from '@/components/charges/ChargesTable';
import { CobrarMesModal } from '@/components/charges/CobrarMesModal';
import { CreateChargeModal } from '@/components/charges/CreateChargeModal';
import { clsx } from 'clsx';

type FilterStatus = 'all' | 'pending' | 'overdue' | 'paid';

const STATUS_TABS: { value: FilterStatus; label: string }[] = [
  { value: 'all',     label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'overdue', label: 'En mora' },
  { value: 'paid',    label: 'Pagados' },
];

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label:    string;
  amount:   bigint;
  count:    number;
  total?:   number;
  subtitle: string;
  color:    'emerald' | 'amber' | 'red';
  icon:     React.ReactNode;
  progress?: number; // 0-100
}

function KpiCard({ label, amount, count, subtitle, color, icon, progress }: KpiCardProps) {
  const colorMap = {
    emerald: {
      icon:      'bg-emerald-500/15 text-emerald-400',
      border:    'border-emerald-500/20',
      amount:    'text-white',
      count:     'text-emerald-400',
      bar:       'bg-emerald-500',
      glowColor: 'rgba(16,185,129,0.15)',
    },
    amber: {
      icon:      'bg-amber-500/15 text-amber-400',
      border:    count > 0 ? 'border-amber-500/20' : 'border-surface-border',
      amount:    count > 0 ? 'text-amber-300' : 'text-white',
      count:     'text-amber-400',
      bar:       'bg-amber-500',
      glowColor: count > 0 ? 'rgba(245,158,11,0.12)' : 'transparent',
    },
    red: {
      icon:      'bg-red-500/15 text-red-400',
      border:    count > 0 ? 'border-red-500/20' : 'border-surface-border',
      amount:    count > 0 ? 'text-red-300' : 'text-white',
      count:     'text-red-400',
      bar:       'bg-red-500',
      glowColor: count > 0 ? 'rgba(239,68,68,0.12)' : 'transparent',
    },
  }[color];

  return (
    <div className={clsx('relative overflow-hidden rounded-2xl border bg-surface-card p-5', colorMap.border)}>
      {/* Subtle corner glow using inline gradient */}
      <div
        className="absolute -top-10 -left-10 w-28 h-28 rounded-full opacity-50 blur-2xl"
        style={{ background: colorMap.glowColor }}
      />

      <div className="flex items-start justify-between mb-4">
        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">{label}</p>
        <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center', colorMap.icon)}>
          {icon}
        </div>
      </div>

      <p className={clsx('text-[26px] font-bold tabular-nums tracking-tight leading-tight', colorMap.amount)}>
        {formatCOP(amount)}
      </p>

      {progress !== undefined ? (
        <div className="mt-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">{subtitle}</span>
            <span className={clsx('text-[11px] font-bold tabular-nums', colorMap.count)}>
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-700', colorMap.bar)}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3.5 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{subtitle}</span>
          <span className={clsx('text-[12px] font-semibold tabular-nums', count > 0 ? colorMap.count : 'text-slate-500')}>
            {count === 0 ? 'Ninguna' : `${count} ${count === 1 ? 'unidad' : 'unidades'}`}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RecaudoPage() {
  const { data: periods = [] }              = usePeriods();
  const { data: units   = [], isLoading: unitsLoading } = useUnits();

  const [filterPeriod,     setFilterPeriod]     = useState('');
  const [filterStatus,     setFilterStatus]     = useState<FilterStatus>('all');
  const [showCobrarMes,    setShowCobrarMes]    = useState(false);
  const [showCreateCharge, setShowCreateCharge] = useState(false);

  const periodParam = filterPeriod || undefined;

  // Full set (for KPIs — always unfiltered by status)
  const { data: allCharges = [] } = useCharges({ period: periodParam });

  // Filtered set (for table)
  const { data: tableData = [], isLoading: tableLoading } = useCharges({
    period: periodParam,
    status: filterStatus === 'all' ? undefined : filterStatus,
  });

  // ── KPI calculations ──────────────────────────────────────────────────────
  const paidCharges    = allCharges.filter((c) => c.status === 'paid');
  const overdueCharges = allCharges.filter((c) => c.status === 'overdue');
  const pendingCharges = allCharges.filter((c) => c.status === 'active');

  const paidAmount    = paidCharges.reduce((s, c) => s + c.amount, 0n);
  const overdueAmount = overdueCharges.reduce((s, c) => s + c.amount, 0n);
  const pendingAmount = pendingCharges.reduce((s, c) => s + c.amount, 0n);
  const totalAmount   = allCharges.reduce((s, c) => s + c.amount, 0n);
  const collectedPct  = totalAmount > 0n
    ? Math.min(100, Number((paidAmount * 10000n) / totalAmount) / 100)
    : 0;

  const paidSubtitle = allCharges.length > 0
    ? `${paidCharges.length} de ${allCharges.length} unidades`
    : 'Sin cobros en este período';

  // ── Callbacks ─────────────────────────────────────────────────────────────
  function handleCobrarMesSuccess(ym: string) {
    setShowCobrarMes(false);
    if (ym) setFilterPeriod(ym);
  }

  const isTableLoading = tableLoading || unitsLoading;

  return (
    <div className="p-5 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-white font-bold text-[15px] tracking-tight">Recaudo</h1>
          <p className="text-slate-400 text-[12px] mt-0.5">Cobros, estados de pago y enlace Wompi</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowCreateCharge(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-surface-border bg-surface-card text-slate-300 hover:text-white hover:border-slate-500 text-[12px] font-medium transition-all"
          >
            <Plus size={13} />
            Nuevo cargo
          </button>
          <button
            onClick={() => setShowCobrarMes(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-primary hover:bg-indigo-400 text-white text-[12px] font-semibold transition-all shadow-lg shadow-indigo-500/20"
          >
            <Zap size={13} />
            Cobrar mes
          </button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Recaudado"
          amount={paidAmount}
          count={paidCharges.length}
          subtitle={paidSubtitle}
          color="emerald"
          icon={<TrendingUp size={14} />}
          progress={collectedPct}
        />
        <KpiCard
          label="Pendiente"
          amount={pendingAmount}
          count={pendingCharges.length}
          subtitle="Por cobrar"
          color="amber"
          icon={<Clock size={14} />}
        />
        <KpiCard
          label="En mora"
          amount={overdueAmount}
          count={overdueCharges.length}
          subtitle={overdueCharges.length > 0 ? 'Requiere atención' : 'Al día'}
          color="red"
          icon={<AlertTriangle size={14} />}
        />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Period */}
        <div className="relative">
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="appearance-none bg-surface-card border border-surface-border text-[12px] text-white rounded-xl pl-3.5 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-brand-primary/50 cursor-pointer hover:border-slate-500 transition-colors"
          >
            <option value="">Todos los períodos</option>
            {periods.map((p) => (
              <option key={p.id} value={`${p.year}-${String(p.month).padStart(2, '0')}`}>
                {p.label}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 p-1 bg-surface-card border border-surface-border rounded-xl">
          {STATUS_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilterStatus(value)}
              className={clsx(
                'px-3 py-1 rounded-lg text-[11px] font-semibold transition-all',
                filterStatus === value
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Record count */}
        {!tableLoading && (
          <span className="text-[11px] text-slate-500 ml-auto">
            {tableData.length} {tableData.length === 1 ? 'registro' : 'registros'}
          </span>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <ChargesTable
        charges={tableData}
        units={units}
        loading={isTableLoading}
      />

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {showCobrarMes && (
        <CobrarMesModal
          onClose={() => setShowCobrarMes(false)}
          onSuccess={handleCobrarMesSuccess}
        />
      )}
      {showCreateCharge && (
        <CreateChargeModal
          onClose={() => setShowCreateCharge(false)}
          onSuccess={() => setShowCreateCharge(false)}
        />
      )}
    </div>
  );
}
