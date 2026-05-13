import { useState, useMemo } from 'react';
import { useCharges } from '@/hooks/useCharges';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCOP, formatDate, formatPeriod } from '@/lib/formatters';
import { api } from '@/lib/api';
import type { Charge } from '@/lib/schemas';

type AgingKey = 'corriente' | '1-30' | '31-60' | '61-90' | '+90';

function agingKey(dueDate: Date): AgingKey {
  const d = Math.floor((Date.now() - dueDate.getTime()) / 86_400_000);
  if (d <= 0)  return 'corriente';
  if (d <= 30) return '1-30';
  if (d <= 60) return '31-60';
  if (d <= 90) return '61-90';
  return '+90';
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function last12Months(): { value: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value, label: formatPeriod(value) };
  });
}

async function downloadBlob(path: string, filename: string) {
  const { data } = await api.get<Blob>(path, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const COLUMNS: Column<Charge>[] = [
  { key: 'unit',    header: 'Unidad',      render: (r) => <span className="font-medium">{r.unitLabel}</span> },
  { key: 'owner',   header: 'Propietario', render: (r) => r.ownerName ?? '—' },
  { key: 'concept', header: 'Concepto',    render: (r) => r.concept },
  { key: 'due',     header: 'Vencimiento', render: (r) => <span className="text-slate-300">{formatDate(r.dueDate)}</span> },
  { key: 'amount',  header: 'Monto',       render: (r) => formatCOP(r.amount), align: 'right' },
  { key: 'status',  header: 'Estado',      render: (r) => <StatusBadge status={r.status} />, align: 'center' },
];

const AGING_CONFIG: Record<AgingKey, { label: string; sub: string; color: string; bg: string }> = {
  'corriente': { label: 'Corriente',  sub: 'Al día',        color: 'text-status-green',  bg: 'bg-status-green/10'  },
  '1-30':      { label: '1 – 30 d',  sub: 'Mora temprana', color: 'text-status-yellow', bg: 'bg-status-yellow/10' },
  '31-60':     { label: '31 – 60 d', sub: 'Mora media',    color: 'text-orange-400',    bg: 'bg-orange-400/10'    },
  '61-90':     { label: '61 – 90 d', sub: 'Mora alta',     color: 'text-status-red',    bg: 'bg-status-red/10'    },
  '+90':       { label: '+90 d',     sub: 'Mora crítica',  color: 'text-red-300',        bg: 'bg-red-900/20'       },
};

const AGING_ORDER: AgingKey[] = ['corriente', '1-30', '31-60', '61-90', '+90'];

export default function CarteraPage() {
  const [period, setPeriod]     = useState(currentPeriod());
  const [exporting, setExporting] = useState(false);
  const { data: charges = [], isLoading } = useCharges({ status: 'all', period });

  const kpis = useMemo(() => {
    const bruta      = charges.reduce((s, c) => s + c.amount, 0n);
    const recaudado  = charges.filter(c => c.status === 'paid').reduce((s, c) => s + c.amount, 0n);
    const pendiente  = charges.filter(c => ['active', 'partial'].includes(c.status)).reduce((s, c) => s + c.amount, 0n);
    const vencido    = charges.filter(c => c.status === 'overdue').reduce((s, c) => s + c.amount, 0n);
    const efectividad = bruta > 0n ? Math.round(Number(recaudado * 10_000n / bruta) / 100) : 0;
    return { bruta, recaudado, pendiente, vencido, efectividad };
  }, [charges]);

  const aging = useMemo(() => {
    const buckets: Record<AgingKey, { count: number; amount: bigint }> = {
      'corriente': { count: 0, amount: 0n },
      '1-30':      { count: 0, amount: 0n },
      '31-60':     { count: 0, amount: 0n },
      '61-90':     { count: 0, amount: 0n },
      '+90':       { count: 0, amount: 0n },
    };
    for (const c of charges) {
      if (['paid', 'cancelled', 'written_off'].includes(c.status)) continue;
      const key = c.status === 'overdue' ? agingKey(c.dueDate) : 'corriente';
      buckets[key].count++;
      buckets[key].amount += c.amount;
    }
    return AGING_ORDER.map(k => ({ key: k, ...AGING_CONFIG[k], ...buckets[k] }));
  }, [charges]);

  const pending = charges.filter(c => !['paid', 'cancelled', 'written_off'].includes(c.status));

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadBlob(`/export/portfolio?period=${period}`, `cartera-${period}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-5 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-white font-bold text-base">Cartera</h1>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-surface-card border border-surface-border text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            {last12Months().map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:bg-surface-hover disabled:opacity-50 text-slate-300 hover:text-white text-[11px] font-semibold rounded-md transition-colors"
          >
            <DownloadIcon />
            {exporting ? 'Exportando…' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Cartera bruta" value={formatCOP(kpis.bruta)}    sub={`${charges.length} cargos`} />
        <KpiCard label="Recaudado"     value={formatCOP(kpis.recaudado)} valueClass="text-status-green"  sub={`${kpis.efectividad}% efectividad`} />
        <KpiCard label="Por recaudar"  value={formatCOP(kpis.pendiente)} valueClass="text-status-yellow" />
        <KpiCard label="Vencido"       value={formatCOP(kpis.vencido)}   valueClass="text-status-red"    sub="Requiere gestión" />
      </div>

      {/* ── Efectividad progress bar ── */}
      <div className="bg-surface-card rounded-lg px-4 py-3">
        <div className="flex justify-between text-[11px] mb-2">
          <span className="text-slate-400">Efectividad de cobro — {formatPeriod(period)}</span>
          <span className={
            kpis.efectividad >= 90 ? 'text-status-green font-bold' :
            kpis.efectividad >= 70 ? 'text-status-yellow font-bold' :
            'text-status-red font-bold'
          }>
            {kpis.efectividad}%
          </span>
        </div>
        <div className="h-2 bg-surface-border rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              kpis.efectividad >= 90 ? 'bg-status-green' :
              kpis.efectividad >= 70 ? 'bg-status-yellow' :
              'bg-status-red'
            }`}
            style={{ width: `${kpis.efectividad}%` }}
          />
        </div>
      </div>

      {/* ── Aging buckets ── */}
      <div>
        <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Antigüedad de cartera
        </h2>
        <div className="grid grid-cols-5 gap-2">
          {aging.map(b => (
            <div key={b.key} className={`${b.bg} rounded-lg p-3 space-y-1`}>
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${b.color}`}>{b.label}</p>
              <p className="text-[9px] text-slate-400">{b.sub}</p>
              <p className={`text-sm font-bold tabular-nums leading-tight ${b.color}`}>{formatCOP(b.amount)}</p>
              <p className="text-[10px] text-slate-400">{b.count} {b.count === 1 ? 'cargo' : 'cargos'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Pending charges table ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Cargos pendientes
          </h2>
          <span className="text-[11px] text-slate-400">{pending.length} registros</span>
        </div>
        <DataTable
          columns={COLUMNS}
          data={pending}
          keyFn={(r) => r.id}
          loading={isLoading}
          emptyMessage="No hay cargos pendientes para este período"
        />
      </div>

    </div>
  );
}

function KpiCard({
  label, value, sub, valueClass = 'text-white',
}: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="bg-surface-card rounded-lg px-3 py-3 space-y-1">
      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-base font-bold tabular-nums leading-tight ${valueClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}
