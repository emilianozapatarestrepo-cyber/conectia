import { useState } from 'react';
import { format, isPast, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  MessageSquare, AlertTriangle, CheckCircle, Clock, Plus, Send,
  X, Phone, Building2, Calendar, Tag, User,
} from 'lucide-react';
import { clsx } from 'clsx';
import { usePqrs, usePqrsStats, useCreatePqrs, useRespondPqrs, useUpdatePqrsStatus } from '@/hooks/usePqrs';
import { useUnits } from '@/hooks/useUnits';
import type { PqrsItem } from '@/lib/schemas';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<PqrsItem['category'], string> = {
  peticion:   'Petición',
  queja:      'Queja',
  reclamo:    'Reclamo',
  sugerencia: 'Sugerencia',
};

const CATEGORY_COLORS: Record<PqrsItem['category'], string> = {
  peticion:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
  queja:      'bg-red-500/15 text-red-400 border-red-500/30',
  reclamo:    'bg-amber-500/15 text-amber-400 border-amber-500/30',
  sugerencia: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const STATUS_LABELS: Record<PqrsItem['status'], string> = {
  abierta:    'Abierta',
  en_proceso: 'En proceso',
  respondida: 'Respondida',
  cerrada:    'Cerrada',
};

const PRIORITY_COLORS: Record<PqrsItem['priority'], string> = {
  alta:  'text-red-400',
  media: 'text-amber-400',
  baja:  'text-slate-400',
};

type StatusFilter = PqrsItem['status'] | 'all';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all',        label: 'Todas' },
  { value: 'abierta',    label: 'Abiertas' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'respondida', label: 'Respondidas' },
  { value: 'cerrada',    label: 'Cerradas' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color, warning }: {
  label: string; value: number; icon: React.ElementType;
  color: string; warning?: boolean;
}) {
  return (
    <div className={clsx(
      'bg-surface-card border rounded-xl p-4 flex items-center gap-4',
      warning && value > 0 ? 'border-red-500/40' : 'border-surface-border',
    )}>
      <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className={clsx('text-2xl font-bold', warning && value > 0 ? 'text-red-400' : 'text-white')}>
          {value}
        </p>
      </div>
    </div>
  );
}

function DueDateBadge({ dueDate }: { dueDate: Date }) {
  const overdue  = isPast(dueDate);
  const dueSoon  = !overdue && dueDate <= addDays(new Date(), 3);
  // eslint-disable-next-line react-hooks/purity
  const days     = Math.round((dueDate.getTime() - Date.now()) / 86400_000);

  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-400">
        <AlertTriangle size={11} />
        Vencida
      </span>
    );
  }
  if (dueSoon) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
        <Clock size={11} />
        {days === 0 ? 'Hoy' : `${days}d`}
      </span>
    );
  }
  return (
    <span className="text-xs text-slate-400">
      {format(dueDate, 'd MMM', { locale: es })}
    </span>
  );
}

// ── Respond Modal ─────────────────────────────────────────────────────────────

function RespondModal({ pqrs, onClose }: { pqrs: PqrsItem; onClose: () => void }) {
  const [response, setResponse] = useState(pqrs.adminResponse ?? '');
  const [status, setStatus]     = useState<'respondida' | 'en_proceso'>('respondida');
  const respond                 = useRespondPqrs();

  const handleSubmit = async () => {
    await respond.mutateAsync({ id: pqrs.id, adminResponse: response, status });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-[#0f1629] border border-surface-border rounded-2xl w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-surface-border">
          <div>
            <p className="text-xs text-slate-400 mb-1">
              {CATEGORY_LABELS[pqrs.category]} · {pqrs.unitLabel ?? 'Sin unidad'}
            </p>
            <h2 className="text-white font-semibold">{pqrs.subject}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white ml-4">
            <X size={18} />
          </button>
        </div>

        {/* Original message */}
        <div className="p-5 border-b border-surface-border">
          <p className="text-xs text-slate-400 mb-2">Descripción del residente</p>
          <p className="text-sm text-slate-300 leading-relaxed">{pqrs.description}</p>
          {pqrs.submittedByPhone && (
            <a
              href={`https://wa.me/57${pqrs.submittedByPhone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 text-xs text-emerald-400 hover:text-emerald-300"
            >
              <Phone size={11} />
              Contactar por WhatsApp
            </a>
          )}
        </div>

        {/* Response form */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-2">Respuesta oficial</label>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Estimado/a residente, en respuesta a su solicitud..."
              rows={5}
              className="w-full bg-surface-hover border border-surface-border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-primary resize-none"
            />
            <p className="text-xs text-slate-500 mt-1">{response.length} caracteres · mínimo 10</p>
          </div>

          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="respStatus"
                value="respondida"
                checked={status === 'respondida'}
                onChange={() => setStatus('respondida')}
                className="accent-brand-primary"
              />
              <span className="text-sm text-slate-300">Marcar como respondida</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="respStatus"
                value="en_proceso"
                checked={status === 'en_proceso'}
                onChange={() => setStatus('en_proceso')}
                className="accent-brand-primary"
              />
              <span className="text-sm text-slate-300">En proceso (parcial)</span>
            </label>
          </div>

          <button
            onClick={handleSubmit}
            disabled={response.length < 10 || respond.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-primary rounded-lg text-white font-semibold text-sm hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={15} />
            {respond.isPending ? 'Enviando...' : 'Enviar respuesta'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New PQRS Modal ────────────────────────────────────────────────────────────

function NewPqrsModal({ onClose }: { onClose: () => void }) {
  const { data: units = [] }      = useUnits();
  const create                    = useCreatePqrs();

  const [form, setForm] = useState({
    category:         'queja' as PqrsItem['category'],
    subject:          '',
    description:      '',
    priority:         'media' as PqrsItem['priority'],
    submittedBy:      '',
    submittedByPhone: '',
    submitterType:    'residente' as PqrsItem['submitterType'],
    unitId:           '',
  });

  const selectedUnit = units.find((u) => u.unitId === form.unitId);

  const set = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const valid =
    form.subject.length >= 5 &&
    form.description.length >= 20 &&
    form.submittedBy.length >= 1;

  const handleSubmit = async () => {
    await create.mutateAsync({
      category:         form.category,
      subject:          form.subject,
      description:      form.description,
      priority:         form.priority,
      submittedBy:      form.submittedBy,
      submittedByPhone: form.submittedByPhone || null,
      submitterType:    form.submitterType,
      unitId:           form.unitId || null,
      unitLabel:        (selectedUnit?.label ?? form.unitId) || null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-[#0f1629] border border-surface-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-surface-border sticky top-0 bg-[#0f1629] z-10">
          <h2 className="text-white font-semibold">Registrar PQRS</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Category + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Tipo</label>
              <select
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                className="w-full bg-surface-hover border border-surface-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-primary"
              >
                <option value="peticion">Petición</option>
                <option value="queja">Queja</option>
                <option value="reclamo">Reclamo</option>
                <option value="sugerencia">Sugerencia</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Prioridad</label>
              <select
                value={form.priority}
                onChange={(e) => set('priority', e.target.value)}
                className="w-full bg-surface-hover border border-surface-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-primary"
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>

          {/* Unit */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Unidad (opcional)</label>
            <select
              value={form.unitId}
              onChange={(e) => {
                const u = units.find((x) => x.unitId === e.target.value);
                set('unitId', e.target.value);
                if (u?.ownerName && !form.submittedBy) set('submittedBy', u.ownerName);
                if (u?.phone && !form.submittedByPhone) set('submittedByPhone', u.phone);
              }}
              className="w-full bg-surface-hover border border-surface-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-primary"
            >
              <option value="">Sin unidad asignada</option>
              {units.filter((u) => u.active).map((u) => (
                <option key={u.id} value={u.unitId}>{u.label} – {u.ownerName ?? 'Sin propietario'}</option>
              ))}
            </select>
          </div>

          {/* Submitter */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Presentado por</label>
              <input
                value={form.submittedBy}
                onChange={(e) => set('submittedBy', e.target.value)}
                placeholder="Nombre completo"
                className="w-full bg-surface-hover border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Teléfono</label>
              <input
                value={form.submittedByPhone}
                onChange={(e) => set('submittedByPhone', e.target.value)}
                placeholder="3001234567"
                className="w-full bg-surface-hover border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-primary"
              />
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Asunto</label>
            <input
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              placeholder="Resumen breve del asunto"
              maxLength={200}
              className="w-full bg-surface-hover border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-primary"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Descripción detallada</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Describa en detalle la solicitud, queja, reclamo o sugerencia..."
              rows={4}
              className="w-full bg-surface-hover border border-surface-border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-primary resize-none"
            />
            <p className="text-xs text-slate-500 mt-1">{form.description.length} / 20 mín.</p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!valid || create.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-primary rounded-lg text-white font-semibold text-sm hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={15} />
            {create.isPending ? 'Registrando...' : 'Registrar PQRS'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function PqrsRow({ item, onRespond }: { item: PqrsItem; onRespond: (item: PqrsItem) => void }) {
  const updateStatus = useUpdatePqrsStatus();
  const overdue      = isPast(item.dueDate) && !['respondida', 'cerrada'].includes(item.status);

  return (
    <div className={clsx(
      'group border-b border-surface-border last:border-0 px-4 py-3.5 hover:bg-surface-hover/40 transition-colors',
      overdue && 'border-l-2 border-l-red-500',
    )}>
      <div className="flex items-start gap-3">
        {/* Category badge */}
        <span className={clsx(
          'mt-0.5 shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border',
          CATEGORY_COLORS[item.category],
        )}>
          {CATEGORY_LABELS[item.category]}
        </span>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-white truncate">{item.subject}</p>
            <span className={clsx('text-[11px] font-semibold', PRIORITY_COLORS[item.priority])}>
              {item.priority === 'alta' ? '● Alta' : item.priority === 'media' ? '● Media' : ''}
            </span>
          </div>

          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{item.description}</p>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {item.unitLabel && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <Building2 size={10} />
                {item.unitLabel}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <User size={10} />
              {item.submittedBy}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Calendar size={10} />
              {format(item.createdAt, 'd MMM yyyy', { locale: es })}
            </span>
            {!['respondida', 'cerrada'].includes(item.status) && (
              <DueDateBadge dueDate={item.dueDate} />
            )}
          </div>
        </div>

        {/* Right side: status + actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Status pill */}
          <span className={clsx(
            'text-[11px] px-2 py-0.5 rounded-full font-medium',
            item.status === 'abierta'    ? 'bg-slate-700 text-slate-300' :
            item.status === 'en_proceso' ? 'bg-blue-500/20 text-blue-400' :
            item.status === 'respondida' ? 'bg-emerald-500/20 text-emerald-400' :
                                           'bg-slate-700/50 text-slate-500',
          )}>
            {STATUS_LABELS[item.status]}
          </span>

          {/* Hover-reveal actions */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            {item.status !== 'cerrada' && item.status !== 'respondida' && (
              <button
                onClick={() => onRespond(item)}
                className="px-2.5 py-1 text-[11px] font-medium bg-brand-primary/20 text-brand-primary rounded hover:bg-brand-primary/30 transition-colors whitespace-nowrap"
              >
                Responder
              </button>
            )}
            {item.status !== 'cerrada' && (
              <button
                onClick={() => updateStatus.mutate({ id: item.id, status: 'cerrada' })}
                className="px-2.5 py-1 text-[11px] font-medium bg-slate-700 text-slate-400 rounded hover:bg-slate-600 hover:text-white transition-colors"
              >
                Cerrar
              </button>
            )}
            {item.status === 'abierta' && (
              <button
                onClick={() => updateStatus.mutate({ id: item.id, status: 'en_proceso' })}
                className="px-2.5 py-1 text-[11px] font-medium bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors whitespace-nowrap"
              >
                En proceso
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Response (if exists) */}
      {item.adminResponse && (
        <div className="mt-2.5 ml-[calc(theme(space.2)+52px)] pl-3 border-l-2 border-emerald-500/30">
          <p className="text-[11px] text-emerald-400 mb-0.5 flex items-center gap-1">
            <CheckCircle size={10} />
            Respuesta oficial
          </p>
          <p className="text-xs text-slate-300 line-clamp-2">{item.adminResponse}</p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PqrsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showNew,      setShowNew]      = useState(false);
  const [respondItem,  setRespondItem]  = useState<PqrsItem | null>(null);

  const filter = statusFilter === 'all' ? {} : { status: statusFilter };
  const { data: items = [], isLoading } = usePqrs(filter);
  const { data: stats }                 = usePqrsStats();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">PQRS</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Peticiones, Quejas, Reclamos y Sugerencias · Ley 675/2001
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-primary rounded-lg text-white text-sm font-semibold hover:bg-brand-primary/90 transition-colors shadow-lg shadow-blue-500/20"
        >
          <Plus size={15} />
          Nueva PQRS
        </button>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Abiertas"
            value={stats.abierta + stats.en_proceso}
            icon={MessageSquare}
            color="bg-blue-500/15 text-blue-400"
          />
          <KpiCard
            label="Vencidas (SLA)"
            value={stats.overdue}
            icon={AlertTriangle}
            color="bg-red-500/15 text-red-400"
            warning
          />
          <KpiCard
            label="Respondidas"
            value={stats.respondida}
            icon={CheckCircle}
            color="bg-emerald-500/15 text-emerald-400"
          />
          <KpiCard
            label="Total"
            value={stats.total}
            icon={Tag}
            color="bg-slate-500/15 text-slate-400"
          />
        </div>
      )}

      {/* SLA warning banner */}
      {stats && stats.overdue > 0 && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            <strong>{stats.overdue} PQRS</strong> han superado el plazo de 15 días establecido
            por la Ley 675. Respóndalas para evitar sanciones.
          </p>
        </div>
      )}

      {/* Filter tabs + list */}
      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center gap-1 p-2 border-b border-surface-border bg-[#0a0f1e]/50">
          {STATUS_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                statusFilter === value
                  ? 'bg-brand-primary/20 text-brand-primary'
                  : 'text-slate-400 hover:text-white hover:bg-surface-hover',
              )}
            >
              {label}
              {value !== 'all' && stats && (value === 'abierta' || value === 'en_proceso' || value === 'respondida' || value === 'cerrada') && (
                <span className="ml-1.5 text-[10px] opacity-70">{stats[value]}</span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-0 divide-y divide-surface-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="h-5 w-16 bg-surface-hover rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 bg-surface-hover rounded" />
                    <div className="h-3 w-1/2 bg-surface-hover rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-xl bg-surface-hover flex items-center justify-center">
              <MessageSquare size={20} className="text-slate-500" />
            </div>
            <p className="text-slate-400 text-sm">No hay PQRS {statusFilter !== 'all' ? `con estado "${STATUS_LABELS[statusFilter as PqrsItem['status']]}"` : 'registradas'}</p>
            <button
              onClick={() => setShowNew(true)}
              className="text-xs text-brand-primary hover:underline flex items-center gap-1"
            >
              <Plus size={12} />
              Registrar primera PQRS
            </button>
          </div>
        ) : (
          <div>
            {items.map((item) => (
              <PqrsRow key={item.id} item={item} onRespond={setRespondItem} />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showNew && <NewPqrsModal onClose={() => setShowNew(false)} />}
      {respondItem && <RespondModal pqrs={respondItem} onClose={() => setRespondItem(null)} />}
    </div>
  );
}
