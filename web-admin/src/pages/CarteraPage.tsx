import { useState, useMemo, useCallback } from 'react';
import { useCharges } from '@/hooks/useCharges';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PeriodSelector } from '@/components/ui/PeriodSelector';
import { formatCOP, formatDate } from '@/lib/formatters';
import { api } from '@/lib/api';
import type { Charge } from '@/lib/schemas';

// ── Payment link modal ────────────────────────────────────────────────────────

interface PaymentLinkResponse {
  url:         string;
  whatsappUrl: string | null;
  ownerPhone:  string | null;
}

interface PaymentLinkModalProps {
  charge: Charge;
  onClose: () => void;
}

function PaymentLinkModal({ charge, onClose }: PaymentLinkModalProps) {
  const [result, setResult] = useState<PaymentLinkResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const url = result?.url ?? null;

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<PaymentLinkResponse>(`/charges/${charge.id}/payment-link`);
      setResult(data);
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
                href={url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg border border-surface-border hover:bg-surface-hover transition-colors text-slate-300 text-[12px] flex items-center gap-1"
              >
                <ExternalLinkIcon />
                Ver
              </a>
            </div>

            {/* WhatsApp direct send if phone is on file */}
            {result?.whatsappUrl ? (
              <a
                href={result.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] text-[12px] font-semibold transition-colors"
              >
                <WhatsAppInlineIcon />
                Enviar por WhatsApp
                {result.ownerPhone && (
                  <span className="text-[#25D366]/70 font-normal">{result.ownerPhone}</span>
                )}
              </a>
            ) : (
              <p className="text-slate-600 text-[10px] text-center">
                Agrega el teléfono en Unidades para enviar por WhatsApp
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bulk WhatsApp notification modal ─────────────────────────────────────────

interface BulkLinkResult {
  chargeId:    string;
  ok:          boolean;
  whatsappUrl: string | null;
  ownerPhone:  string | null;
  error?:      string;
}

interface BulkNotifyModalProps {
  charges: Charge[];
  onClose: () => void;
}

function BulkNotifyModal({ charges, onClose }: BulkNotifyModalProps) {
  const [results, setResults] = useState<BulkLinkResult[] | null>(null);
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState<string | null>(null);
  const [sent, setSent]        = useState<Set<string>>(new Set());

  const chargeMap = useMemo(
    () => new Map(charges.map((c) => [c.id, c])),
    [charges],
  );

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<BulkLinkResult[]>('/charges/bulk-links', {
        chargeIds: charges.map((c) => c.id),
      });
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando links');
    } finally {
      setLoading(false);
    }
  }, [charges]);

  // Auto-generate on mount
  useState(() => { void generate(); });

  const withPhone    = results?.filter((r) => r.ok && r.whatsappUrl) ?? [];
  const withoutPhone = results?.filter((r) => r.ok && !r.whatsappUrl) ?? [];

  const markSent = (chargeId: string) =>
    setSent((prev) => new Set(prev).add(chargeId));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-card border border-surface-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border flex-shrink-0">
          <div>
            <h2 className="text-white font-semibold text-sm">Notificar pendientes</h2>
            {results && (
              <p className="text-slate-400 text-[11px] mt-0.5">
                {withPhone.length} con WhatsApp · {sent.size} enviados
                {withoutPhone.length > 0 && ` · ${withoutPhone.length} sin teléfono`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-sm">
              <SpinnerIcon />
              Generando links de pago…
            </div>
          )}
          {error && (
            <div className="bg-red-900/20 rounded-lg px-3 py-2 text-red-400 text-[11px]">
              {error}
              <button onClick={() => void generate()} className="ml-2 underline">Reintentar</button>
            </div>
          )}
          {withPhone.map((r) => {
            const charge = chargeMap.get(r.chargeId);
            const isSent = sent.has(r.chargeId);
            return (
              <div key={r.chargeId}
                className="flex items-center justify-between gap-3 bg-surface-hover rounded-lg px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-white text-[12px] font-medium truncate">
                    {charge?.unitLabel ?? r.chargeId}
                  </p>
                  <p className="text-slate-400 text-[10px]">
                    {charge ? formatCOP(charge.amount) : ''} · {r.ownerPhone}
                  </p>
                </div>
                {isSent ? (
                  <span className="flex items-center gap-1 text-[#25D366] text-[11px] font-semibold flex-shrink-0">
                    <CheckIcon />
                    Enviado
                  </span>
                ) : (
                  <a
                    href={r.whatsappUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => markSent(r.chargeId)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] text-[11px] font-semibold transition-colors flex-shrink-0"
                  >
                    <WhatsAppInlineIcon />
                    Enviar
                  </a>
                )}
              </div>
            );
          })}
          {withoutPhone.length > 0 && results && (
            <p className="text-slate-600 text-[10px] text-center pt-2">
              {withoutPhone.length} unidad{withoutPhone.length > 1 ? 'es' : ''} sin teléfono — agrégalo en Unidades
            </p>
          )}
          {results && withPhone.length === 0 && (
            <div className="text-center py-10 text-slate-500 text-sm">
              Ninguna unidad pendiente tiene teléfono registrado
            </div>
          )}
        </div>

        {/* Footer */}
        {withPhone.length > 0 && sent.size < withPhone.length && results && (
          <div className="px-5 py-3 border-t border-surface-border flex-shrink-0">
            <p className="text-slate-400 text-[10px] text-center">
              Haz clic en cada "Enviar" para abrir WhatsApp con el mensaje pre-llenado
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
  const [showBulkNotify, setShowBulkNotify] = useState(false);
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
          <PeriodSelector value={period} onChange={setPeriod} />

          {pending.length > 0 && (
            <button
              onClick={() => setShowBulkNotify(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/20 text-[#25D366] text-[11px] font-semibold rounded-md transition-colors"
            >
              <WhatsAppInlineIcon />
              Notificar pendientes
            </button>
          )}
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
          <span className="text-slate-400">Efectividad de cobro — {period}</span>
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

      {showBulkNotify && (
        <BulkNotifyModal
          charges={pending}
          onClose={() => setShowBulkNotify(false)}
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

function WhatsAppInlineIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
