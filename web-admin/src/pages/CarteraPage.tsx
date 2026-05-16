import { useState, useMemo, useCallback } from 'react';
import { useCharges } from '@/hooks/useCharges';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCOP, formatDate, formatPeriod } from '@/lib/formatters';
import { api } from '@/lib/api';
import type { Charge } from '@/lib/schemas';

// ── Payment link modal ────────────────────────────────────────────────────────

interface PaymentLinkModalProps {
  charge: Charge;
  onClose: () => void;
}

function PaymentLinkModal({ charge, onClose }: PaymentLinkModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<{ url: string }>(`/charges/${charge.id}/payment-link`);
      setUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando link');
    } finally {
      setLoading(false);
    }
  }, [charge.id]);

  const copy = useCallback(async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [url]);

  // Auto-generate on mount
  useState(() => { void generate(); });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-card border border-surface-border rounded-xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-white font-semibold text-sm">Link de pago</h2>
            <p className="text-slate-400 text-[11px] mt-0.5">
              {charge.unitLabel} · {formatCOP(charge.amount)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors p-1 -mr-1 -mt-1"
          >
            <XIcon />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-6 text-slate-400 text-sm gap-2">
            <SpinnerIcon />
            Generando link…
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 text-red-400 text-[11px]">
            {error}
            <button onClick={() => void generate()} className="ml-2 underline">Reintentar</button>
          </div>
        )}

        {url && (
          <div className="space-y-3">
            <div className="bg-surface-hover rounded-lg px-3 py-2 break-all text-[11px] text-slate-300 font-mono leading-relaxed">
              {url}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void copy()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-brand-primary hover:bg-brand-primary/90 transition-colors text-white text-[12px] font-semibold"
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? 'Copiado!' : 'Copiar link'}
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg border border-surface-border hover:bg-surface-hover transition-colors text-slate-300 text-[12px] flex items-center gap-1"
              >
                <ExternalLinkIcon />
                Ver
              </a>
            </div>
            <p className="text-slate-500 text-[10px] text-center">
              Envía este link al propietario por WhatsApp, email o SMS
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

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

function makeColumns(onCobrar: (charge: Charge) => void): Column<Charge>[] {
  return [
    { key: 'unit',    header: 'Unidad',      render: (r) => <span className="font-medium">{r.unitLabel}</span> },
    { key: 'owner',   header: 'Propietario', render: (r) => r.ownerName ?? '—' },
    { key: 'concept', header: 'Concepto',    render: (r) => r.concept },
    { key: 'due',     header: 'Vencimiento', render: (r) => <span className="text-slate-300">{formatDate(r.dueDate)}</span> },
    { key: 'amount',  header: 'Monto',       render: (r) => formatCOP(r.amount), align: 'right' },
    { key: 'status',  header: 'Estado',      render: (r) => <StatusBadge status={r.status} />, align: 'center' },
    {
      key: 'action',
      header: '',
      align: 'center',
      render: (r) => r.status !== 'paid' && r.status !== 'cancelled' && r.status !== 'written_off'
        ? (
          <button
            onClick={(e) => { e.stopPropagation(); onCobrar(r); }}
            className="px-2 py-1 text-[10px] font-semibold rounded bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/30 hover:border-brand-primary/60 transition-all"
          >
            Cobrar
          </button>
        )
        : null,
    },
  ];
}

const AGING_CONFIG: Record<AgingKey, { label: string; sub: string; color: string; bg: string }> = {
  'corriente': { label: 'Corriente',  sub: 'Al día',        color: 'text-status-green',  bg: 'bg-status-green/10'  },
  '1-30':      { label: '1 – 30 d',  sub: 'Mora temprana', color: 'text-status-yellow', bg: 'bg-status-yellow/10' },
  '31-60':     { label: '31 – 60 d', sub: 'Mora media',    color: 'text-orange-400',    bg: 'bg-orange-400/10'    },
  '61-90':     { label: '61 – 90 d', sub: 'Mora alta',     color: 'text-status-red',    bg: 'bg-status-red/10'    },
  '+90':       { label: '+90 d',     sub: 'Mora crítica',  color: 'text-red-300',        bg: 'bg-red-900/20'       },
};

const AGING_ORDER: AgingKey[] = ['corriente', '1-30', '31-60', '61-90', '+90'];

export default function CarteraPage() {
  const [period, setPeriod]         = useState(currentPeriod());
  const [exporting, setExporting]   = useState(false);
  const [cobrarCharge, setCobrarCharge] = useState<Charge | null>(null);
  const { data: charges = [], isLoading } = useCharges({ status: 'all', period });

  const columns = useMemo(() => makeColumns(setCobrarCharge), []);

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
          columns={columns}
          data={pending}
          keyFn={(r) => r.id}
          loading={isLoading}
          emptyMessage="No hay cargos pendientes para este período"
        />
      </div>

      {cobrarCharge && (
        <PaymentLinkModal
          charge={cobrarCharge}
          onClose={() => setCobrarCharge(null)}
        />
      )}
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

function XIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}
