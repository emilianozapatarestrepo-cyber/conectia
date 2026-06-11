import { useState, useMemo, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDelinquent } from '@/hooks/useDelinquent';
import { useReminders, useMarkReminderSent, useSkipReminder } from '@/hooks/useReminders';
import type { Reminder, ReminderType } from '@/hooks/useReminders';
import { formatCOP, formatDate } from '@/lib/formatters';
import type { DelinquentUnit } from '@/lib/schemas';
import { api } from '@/lib/api';
import { AlertTriangle, Bell, MessageCircle, RefreshCw, X, Check } from 'lucide-react';
import { WhatsAppIcon, SpinnerIcon } from '@/components/ui/icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';

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
            <X size={16} />
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
                  <span className="text-brand-whatsapp text-[11px] font-semibold flex-shrink-0 flex items-center gap-1">
                    <Check size={14} />
                    Enviado
                  </span>
                ) : (
                  <a
                    href={r.whatsappUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => markSent(r.chargeId)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-whatsapp/10 hover:bg-brand-whatsapp/20 border border-brand-whatsapp/30 text-brand-whatsapp text-[11px] font-semibold transition-colors flex-shrink-0"
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

// ── Reminder badge ────────────────────────────────────────────────────────────

const REMINDER_LABELS: Record<ReminderType, string> = {
  D1:  '1 día',
  D7:  '7 días',
  D30: '30 días',
};

const REMINDER_BADGE: Record<ReminderType, string> = {
  D1:  'bg-amber-900/20 text-amber-400 border-amber-700/30',
  D7:  'bg-orange-900/20 text-orange-400 border-orange-700/30',
  D30: 'bg-red-900/20 text-red-400 border-red-700/30',
};

function ReminderRow({ reminder }: { reminder: Reminder }) {
  const markSent = useMarkReminderSent();
  const skip     = useSkipReminder();
  const [opening, setOpening] = useState(false);

  const handleSend = () => {
    if (!reminder.whatsappUrl) return;
    setOpening(true);
    window.open(reminder.whatsappUrl, '_blank', 'noopener,noreferrer');
    markSent.mutate({ id: reminder.id, via: 'whatsapp_link' }, {
      onSettled: () => setOpening(false),
    });
  };

  return (
    <div className="bg-surface-card border border-surface-border rounded-lg px-4 py-3 flex items-center gap-4">
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${REMINDER_BADGE[reminder.reminderType]}`}>
        {reminder.reminderType}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white font-medium text-sm truncate">
            {reminder.unitLabel ?? reminder.unitId}
          </p>
          {reminder.ownerName && (
            <span className="text-slate-400 text-[11px] truncate">{reminder.ownerName}</span>
          )}
        </div>
        <p className="text-slate-400 text-[11px] mt-0.5 truncate">
          {reminder.concept} · vence {formatDate(reminder.dueDate)}
        </p>
      </div>

      <div className="text-right flex-shrink-0">
        <p className="text-white font-bold text-sm tabular-nums">{formatCOP(BigInt(reminder.amountCents))}</p>
        <p className="text-slate-500 text-[10px]">pendiente</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {reminder.phone && reminder.whatsappUrl ? (
          <button
            onClick={handleSend}
            disabled={opening || markSent.isPending}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-whatsapp/10 hover:bg-brand-whatsapp/20 border border-brand-whatsapp/30 text-brand-whatsapp text-[11px] font-semibold transition-colors disabled:opacity-50"
          >
            {opening || markSent.isPending ? <SpinnerIcon /> : <WhatsAppIcon />}
            Enviar
          </button>
        ) : (
          <span className="text-slate-600 text-[10px]">Sin teléfono</span>
        )}
        <button
          onClick={() => skip.mutate(reminder.id)}
          disabled={skip.isPending}
          className="px-2 py-1.5 rounded-lg border border-surface-border hover:bg-surface-hover text-slate-400 hover:text-white text-[11px] transition-colors disabled:opacity-40"
          title="Omitir este recordatorio"
        >
          Omitir
        </button>
      </div>
    </div>
  );
}

function RemindersTab() {
  const [typeFilter, setTypeFilter] = useState<ReminderType | undefined>(undefined);

  const { data, isLoading } = useReminders({
    status: 'pending',
    type:   typeFilter,
    limit:  100,
  });

  const { data: allPending } = useReminders({ status: 'pending', limit: 200 });

  const countByType = useMemo(() => {
    const counts: Record<ReminderType, number> = { D1: 0, D7: 0, D30: 0 };
    for (const r of allPending?.reminders ?? []) counts[r.reminderType]++;
    return counts;
  }, [allPending]);

  const reminders = data?.reminders ?? [];
  const total     = data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setTypeFilter(undefined)}
          className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
            typeFilter === undefined
              ? 'bg-brand-primary/20 border-brand-primary/40 text-brand-primary'
              : 'border-surface-border text-slate-400 hover:text-white'
          }`}
        >
          Todos
          {allPending && (
            <span className="ml-1.5 opacity-70">{allPending.total}</span>
          )}
        </button>
        {(['D1', 'D7', 'D30'] as ReminderType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(typeFilter === t ? undefined : t)}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
              typeFilter === t
                ? `${REMINDER_BADGE[t]} border-current`
                : 'border-surface-border text-slate-400 hover:text-white'
            }`}
          >
            {REMINDER_LABELS[t]}
            {countByType[t] > 0 && (
              <span className="ml-1.5 opacity-80">{countByType[t]}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Cargando…</div>
      ) : reminders.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          <Bell size={32} className="mx-auto mb-3 opacity-30" />
          <p>No hay recordatorios pendientes</p>
          <p className="text-[11px] mt-1 text-slate-500">
            El cron nocturno los genera automáticamente para cargas vencidas
          </p>
        </div>
      ) : (
        <>
          <p className="text-slate-500 text-[11px]">{total} recordatorio{total !== 1 ? 's' : ''} pendiente{total !== 1 ? 's' : ''}</p>
          <div className="space-y-2">
            {reminders.map((r) => (
              <ReminderRow key={r.id} reminder={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'cartera' | 'recordatorios';

export default function MorosidadPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useDelinquent();
  const [showNotify, setShowNotify] = useState(false);
  const [tab, setTab] = useState<Tab>('cartera');

  const { data: pendingReminders } = useReminders({ status: 'pending', limit: 1 });

  const markOverdue = useMutation({
    mutationFn: () => api.post<{ markedCount: number; totalAmount: string }>('/dashboard/mark-overdue', {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['charges'] }),
  });

  const totalOwed      = data.reduce((s, d) => s + d.totalOwed, 0n);
  const criticalUnits  = data.filter((d) => d.monthsDelinquent >= 3);
  const unitsWithPhone = data.filter((d) => d.phone);

  return (
    <div className="p-5 space-y-5">
      <PageHeader
        title="Morosidad"
        subtitle={`${data.length} unidades en mora · ${formatCOP(totalOwed)} total`}
        actions={<>
          <button
            onClick={() => markOverdue.mutate()}
            disabled={markOverdue.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:bg-surface-hover disabled:opacity-50 text-slate-300 hover:text-white text-[11px] font-semibold rounded-md transition-colors"
            title="Marcar como vencidas todas las cargas activas con fecha de vencimiento pasada"
          >
            <RefreshCw size={13} className={markOverdue.isPending ? 'animate-spin' : ''} />
            {markOverdue.isPending ? 'Marcando…' : 'Marcar vencidas'}
          </button>
          {tab === 'cartera' && data.length > 0 && (
            <button
              onClick={() => setShowNotify(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-whatsapp/10 border border-brand-whatsapp/30 hover:bg-brand-whatsapp/20 text-brand-whatsapp text-[11px] font-semibold rounded-md transition-colors"
            >
              <WhatsAppIcon />
              Notificar en mora
              {unitsWithPhone.length > 0 && (
                <span className="ml-0.5 bg-brand-whatsapp/20 text-brand-whatsapp rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                  {unitsWithPhone.length}
                </span>
              )}
            </button>
          )}
        </>}
      />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-surface-border">
        {([
          { id: 'cartera',       label: 'Cartera morosa',  badge: data.length > 0 ? data.length : undefined },
          { id: 'recordatorios', label: 'Recordatorios',   badge: (pendingReminders?.total ?? 0) > 0 ? pendingReminders?.total : undefined },
        ] as { id: Tab; label: string; badge?: number }[]).map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-[12px] font-semibold border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
              tab === id
                ? 'border-brand-primary text-white'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {label}
            {badge !== undefined && (
              <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 ${
                tab === id ? 'bg-brand-primary/20 text-brand-primary' : 'bg-surface-card text-slate-400'
              }`}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'cartera' ? (
        <>
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
            <EmptyState
              icon={MessageCircle}
              title="Sin unidades en mora"
              subtitle="Todas las unidades están al día. El cron nocturno marcará vencidas las cargas pendientes automáticamente."
            />
          ) : (
            <div className="space-y-2">
              {data.map((unit, i) => (
                <UnitRow key={unit.unitId} unit={unit} rank={i + 1} />
              ))}
            </div>
          )}
        </>
      ) : (
        <RemindersTab />
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
            <span className="flex items-center gap-1 text-brand-whatsapp text-[11px] font-semibold">
              <Check size={14} />
              Enviado
            </span>
          ) : (
            <button
              onClick={() => void generateAndSend()}
              disabled={linkLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-whatsapp/10 hover:bg-brand-whatsapp/20 border border-brand-whatsapp/30 text-brand-whatsapp text-[11px] font-semibold transition-colors disabled:opacity-50"
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

