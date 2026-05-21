import { useState, useMemo, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDelinquent } from '@/hooks/useDelinquent';
import { formatCOP, formatDate } from '@/lib/formatters';
import type { DelinquentUnit } from '@/lib/schemas';
import { api } from '@/lib/api';
import { AlertTriangle, MessageCircle, RefreshCw } from 'lucide-react';

// ── Mora severity ─────────────────────────────────────────────────────────────

function moraColor(months: number) {
  if (months >= 3) return 'text-red-400';
  if (months >= 2) return 'text-orange-400';
  return 'text-amber-400';
}

function moraBadge(months: number) {
  if (months >= 3) return 'bg-red-900/30 text-red-400 border-red-700/30';
  if (months >= 2) return 'bg-orange-900/30 text-orange-400 border-orange-700/30';
  return 'bg-amber-900/20 text-amber-400 border-amber-700/20';
}

// ── Bulk notify modal ─────────────────────────────────────────────────────────

interface BulkLinkResult {
  chargeId:    string;
  ok:          boolean;
  whatsappUrl: string | null;
  ownerPhone:  string | null;
  error?:      string;
}

interface BulkNotifyModalProps {
  units: DelinquentUnit[];
  onClose: () => void;
}

function BulkNotifyModal({ units, onClose }: BulkNotifyModalProps) {
  const allChargeIds = useMemo(() => units.flatMap((u) => u.chargeIds), [units]);
  const chargeToUnit = useMemo(() => {
    const m = new Map<string, DelinquentUnit>();
    for (const u of units) for (const id of u.chargeIds) m.set(id, u);
    return m;
  }, [units]);

  const [results, setResults] = useState<BulkLinkResult[] | null>(null);
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState<string | null>(null);
  const [sent, setSent]        = useState<Set<string>>(new Set());

  const generate = useCallback(async () => {
    if (allChargeIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<BulkLinkResult[]>('/charges/bulk-links', {
        chargeIds: allChargeIds,
      });
      // Deduplicate by unit — show one WhatsApp link per unit (the first charge)
      const seen = new Set<string>();
      const deduped = data.filter((r) => {
        const unit = chargeToUnit.get(r.chargeId);
        if (!unit) return false;
        if (seen.has(unit.unitId)) return false;
        seen.add(unit.unitId);
        return true;
      });
      setResults(deduped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando links');
    } finally {
      setLoading(false);
    }
  }, [allChargeIds, chargeToUnit]);

  useState(() => { void generate(); });

  const withPhone = results?.filter((r) => r.ok && r.whatsappUrl) ?? [];
  const markSent  = (id: string) => setSent((prev) => new Set(prev).add(id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-card border border-surface-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border flex-shrink-0">
          <div>
            <h2 className="text-white font-semibold text-sm">Notificar unidades en mora</h2>
            {results && (
              <p className="text-slate-400 text-[11px] mt-0.5">
                {withPhone.length} con WhatsApp · {sent.size} enviados
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1">
            <XIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-sm">
              <SpinnerIcon />
              Generando links…
            </div>
          )}
          {error && (
            <div className="bg-red-900/20 rounded-lg px-3 py-2 text-red-400 text-[11px]">
              {error}
              <button onClick={() => void generate()} className="ml-2 underline">Reintentar</button>
            </div>
          )}
          {withPhone.map((r) => {
            const unit = chargeToUnit.get(r.chargeId);
            const isSent = sent.has(r.chargeId);
            return (
              <div key={r.chargeId}
                className="flex items-center justify-between gap-3 bg-surface-hover rounded-lg px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-white text-[12px] font-medium truncate">
                    {unit?.unitLabel ?? r.chargeId}
                  </p>
                  <p className="text-slate-400 text-[10px]">
                    {unit ? formatCOP(unit.totalOwed) : ''}
                    {unit && unit.monthsDelinquent > 1 ? ` · ${unit.monthsDelinquent} meses` : ''}
                    {r.ownerPhone ? ` · ${r.ownerPhone}` : ''}
                  </p>
                </div>
                {isSent ? (
                  <span className="text-[#25D366] text-[11px] font-semibold flex-shrink-0 flex items-center gap-1">
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
                    <WhatsAppIcon />
                    Enviar
                  </a>
                )}
              </div>
            );
          })}
          {results && withPhone.length === 0 && (
            <div className="text-center py-10 text-slate-500 text-sm">
              Ninguna unidad en mora tiene teléfono — agrégalos en Unidades
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MorosidadPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useDelinquent();
  const [showNotify, setShowNotify] = useState(false);

  const markOverdue = useMutation({
    mutationFn: () => api.post<{ markedCount: number; totalAmount: string }>('/dashboard/mark-overdue', {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['charges'] }),
  });

  const totalOwed      = data.reduce((s, d) => s + d.totalOwed, 0n);
  const criticalUnits  = data.filter((d) => d.monthsDelinquent >= 3);
  const unitsWithPhone = data.filter((d) => d.phone);

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-base">Morosidad</h1>
          <p className="text-slate-400 text-[11px] mt-0.5">
            {data.length} unidades en mora · {formatCOP(totalOwed)} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => markOverdue.mutate()}
            disabled={markOverdue.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:bg-surface-hover disabled:opacity-50 text-slate-300 hover:text-white text-[11px] font-semibold rounded-md transition-colors"
            title="Marcar como vencidas todas las cargas activas con fecha de vencimiento pasada"
          >
            <RefreshCw size={13} className={markOverdue.isPending ? 'animate-spin' : ''} />
            {markOverdue.isPending ? 'Marcando…' : 'Marcar vencidas'}
          </button>
          {data.length > 0 && (
            <button
              onClick={() => setShowNotify(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/20 text-[#25D366] text-[11px] font-semibold rounded-md transition-colors"
            >
              <WhatsAppIcon />
              Notificar en mora
              {unitsWithPhone.length > 0 && (
                <span className="ml-0.5 bg-[#25D366]/20 text-[#25D366] rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                  {unitsWithPhone.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mark-overdue result banner */}
      {markOverdue.isSuccess && markOverdue.data && (
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
          <p className="text-amber-300 text-[11px]">
            {markOverdue.data.data.markedCount > 0
              ? `${markOverdue.data.data.markedCount} cargo${markOverdue.data.data.markedCount > 1 ? 's' : ''} marcado${markOverdue.data.data.markedCount > 1 ? 's' : ''} como vencido — ${formatCOP(BigInt(markOverdue.data.data.totalAmount))}`
              : 'Sin cargos activos vencidos por marcar'}
          </p>
        </div>
      )}

      {/* KPI strip */}
      {data.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface-card rounded-lg px-3 py-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Cartera morosa</p>
            <p className="text-status-red font-bold text-base tabular-nums">{formatCOP(totalOwed)}</p>
          </div>
          <div className="bg-surface-card rounded-lg px-3 py-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Mora crítica (+3m)</p>
            <p className={`font-bold text-base ${criticalUnits.length > 0 ? 'text-red-400' : 'text-slate-400'}`}>
              {criticalUnits.length} unidades
            </p>
          </div>
          <div className="bg-surface-card rounded-lg px-3 py-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Promedio mora</p>
            <p className="text-white font-bold text-base">
              {data.length > 0
                ? `${(data.reduce((s, d) => s + d.monthsDelinquent, 0) / data.length).toFixed(1)} meses`
                : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Delinquent list */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Cargando…</div>
      ) : data.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          <MessageCircle size={32} className="mx-auto mb-3 opacity-30" />
          No hay unidades en mora
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((unit, i) => (
            <UnitRow key={unit.unitId} unit={unit} rank={i + 1} />
          ))}
        </div>
      )}

      {showNotify && (
        <BulkNotifyModal
          units={data.filter((u) => u.phone)}
          onClose={() => setShowNotify(false)}
        />
      )}
    </div>
  );
}

// ── Unit row ──────────────────────────────────────────────────────────────────

function UnitRow({ unit, rank }: { unit: DelinquentUnit; rank: number }) {
  const [linkLoading, setLinkLoading] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const generateAndSend = async () => {
    if (unit.chargeIds.length === 0) return;
    setLinkLoading(true);
    try {
      const { data } = await api.post<Array<{ ok: boolean; whatsappUrl?: string | null; chargeId: string }>>(
        '/charges/bulk-links',
        { chargeIds: [unit.chargeIds[0]] },
      );
      const first = data[0];
      if (first?.ok && first.whatsappUrl) {
        setWhatsappUrl(first.whatsappUrl);
        window.open(first.whatsappUrl, '_blank', 'noopener,noreferrer');
        setSent(true);
      }
    } finally {
      setLinkLoading(false);
    }
  };

  return (
    <div className="bg-surface-card border border-surface-border rounded-lg px-4 py-3 flex items-center gap-4">
      <span className="text-slate-600 text-xs w-5 flex-shrink-0">{rank}.</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white font-medium text-sm truncate">{unit.unitLabel}</p>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${moraBadge(unit.monthsDelinquent)}`}>
            {unit.monthsDelinquent}m
          </span>
        </div>
        <p className="text-slate-400 text-[11px] mt-0.5">
          {unit.ownerName ?? 'Sin propietario'}
          {unit.lastPaymentDate
            ? ` · Último pago: ${formatDate(unit.lastPaymentDate)}`
            : ' · Nunca ha pagado'}
        </p>
      </div>

      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold tabular-nums ${moraColor(unit.monthsDelinquent)}`}>
          {formatCOP(unit.totalOwed)}
        </p>
        <p className="text-[10px] text-slate-500">{unit.chargeIds.length} cargo{unit.chargeIds.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex-shrink-0">
        {unit.phone ? (
          sent ? (
            <span className="flex items-center gap-1 text-[#25D366] text-[11px] font-semibold">
              <CheckIcon />
              Enviado
            </span>
          ) : (
            <button
              onClick={() => void generateAndSend()}
              disabled={linkLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] text-[11px] font-semibold transition-colors disabled:opacity-50"
            >
              {linkLoading ? <SpinnerIcon /> : <WhatsAppIcon />}
              Notificar
            </button>
          )
        ) : (
          <span className="text-slate-600 text-[10px]">Sin teléfono</span>
        )}
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function WhatsAppIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
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

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
