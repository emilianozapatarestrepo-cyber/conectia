import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Wallet, Megaphone, MessageSquare, CalendarDays, Loader2,
  CheckCircle2, Clock, XCircle, AlertTriangle, Building2, Send,
} from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCOP } from '@/lib/formatters';
import {
  usePortalSummary, usePortalAnnouncements, usePortalPqrs,
  usePortalAmenities, usePortalBookings,
  usePortalPay, usePortalCreatePqrs, usePortalCreateBooking,
  type PortalPqrs, type PortalBooking,
} from '@/hooks/usePortal';

type Tab = 'cuenta' | 'comunicados' | 'pqrs' | 'reservas';

const TABS: { id: Tab; label: string; Icon: typeof Wallet }[] = [
  { id: 'cuenta',      label: 'Mi cuenta',   Icon: Wallet },
  { id: 'comunicados', label: 'Anuncios',    Icon: Megaphone },
  { id: 'pqrs',        label: 'PQRS',        Icon: MessageSquare },
  { id: 'reservas',    label: 'Reservas',    Icon: CalendarDays },
];

const inputCls = 'w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-[14px] text-white focus:outline-none focus:ring-1 focus:ring-blue-400/60 placeholder:text-slate-500';

// ── Estado de cuenta ──────────────────────────────────────────────────────────

function CuentaTab({ token }: { token: string }) {
  const { data } = usePortalSummary(token);
  const pay = usePortalPay(token);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payError, setPayError] = useState('');

  // bfcache restore — the user pressed back from Wompi; re-enable pay buttons
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) setPayingId(null);
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  if (!data) return null;

  async function handlePay(chargeId: string) {
    setPayingId(chargeId);
    setPayError('');
    try {
      const { payUrl } = await pay.mutateAsync(chargeId);
      window.location.href = payUrl;
    } catch (ex) {
      const msg = (ex as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPayError(msg ?? (ex instanceof Error ? ex.message : 'Error generando el pago'));
      setPayingId(null);
    }
  }

  const hasDebt = data.totalDueCents > 0n;

  return (
    <div className="space-y-4">
      {/* Balance card */}
      <div className={clsx(
        'rounded-2xl border p-5',
        hasDebt
          ? 'border-amber-500/25 bg-gradient-to-br from-amber-500/[0.08] to-transparent'
          : 'border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] to-transparent',
      )}>
        <p className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold">
          {hasDebt ? 'Total pendiente' : 'Estado de cuenta'}
        </p>
        <p className={clsx(
          'text-[32px] font-bold tabular-nums tracking-tight mt-1',
          hasDebt ? 'text-white' : 'text-emerald-400',
        )}>
          {hasDebt ? formatCOP(data.totalDueCents) : 'Al día ✓'}
        </p>
        {hasDebt && (
          <p className="text-[12px] text-slate-400 mt-1">
            {data.pendingCharges.length} {data.pendingCharges.length === 1 ? 'cargo pendiente' : 'cargos pendientes'}
          </p>
        )}
      </div>

      {payError && (
        <p className="text-[12px] text-red-400 flex items-center gap-1.5">
          <AlertTriangle size={12} /> {payError}
        </p>
      )}

      {/* Pending charges */}
      {data.pendingCharges.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider px-1">Por pagar</h2>
          {data.pendingCharges.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-4 rounded-2xl border border-white/[0.08] bg-white/[0.03]">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate">{c.concept}</p>
                <p className={clsx(
                  'text-[11px] mt-0.5',
                  c.status === 'overdue' ? 'text-red-400 font-semibold' : 'text-slate-500',
                )}>
                  {c.status === 'overdue' ? 'Vencido · ' : 'Vence '}
                  {format(new Date(c.dueDate + 'T12:00:00'), "d 'de' MMMM", { locale: es })}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[14px] font-bold text-white tabular-nums">{formatCOP(c.amountDue)}</p>
                <button
                  onClick={() => void handlePay(c.id)}
                  disabled={payingId !== null}
                  className="mt-1.5 px-4 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-[12px] font-bold transition-all disabled:opacity-60 flex items-center gap-1.5"
                >
                  {payingId === c.id && <Loader2 size={11} className="animate-spin" />}
                  Pagar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment history */}
      {data.paymentHistory.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider px-1">Historial de pagos</h2>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.05]">
            {data.paymentHistory.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-white truncate">{p.concept}</p>
                  {p.paidAt && (
                    <p className="text-[10px] text-slate-500">
                      {format(p.paidAt, "d MMM yyyy", { locale: es })}
                    </p>
                  )}
                </div>
                <span className="text-[12px] font-semibold text-slate-300 tabular-nums flex-shrink-0">
                  {formatCOP(p.amountCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Comunicados ───────────────────────────────────────────────────────────────

function ComunicadosTab({ token }: { token: string }) {
  const { data: announcements = [], isLoading } = usePortalAnnouncements(token, true);

  if (isLoading) return <CenterSpinner />;
  if (announcements.length === 0) {
    return <EmptyState icon={Megaphone} text="No hay anuncios de la administración" />;
  }

  return (
    <div className="space-y-3">
      {announcements.map((a) => (
        <div key={a.id} className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.03]">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Megaphone size={13} className="text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-bold text-white">{a.title}</h3>
              {a.publishedAt && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {format(a.publishedAt, "d 'de' MMMM yyyy", { locale: es })}
                </p>
              )}
            </div>
          </div>
          <p className="text-[13px] text-slate-300 mt-2.5 whitespace-pre-wrap leading-relaxed">{a.body}</p>
        </div>
      ))}
    </div>
  );
}

// ── PQRS ──────────────────────────────────────────────────────────────────────

const PQRS_STATUS: Record<PortalPqrs['status'], { label: string; cls: string }> = {
  abierta:    { label: 'Abierta',     cls: 'text-amber-400 bg-amber-400/10 border-amber-400/25' },
  en_proceso: { label: 'En proceso',  cls: 'text-blue-400 bg-blue-400/10 border-blue-400/25' },
  respondida: { label: 'Respondida',  cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25' },
  cerrada:    { label: 'Cerrada',     cls: 'text-slate-400 bg-slate-400/10 border-slate-400/25' },
};

const PQRS_CATEGORIES: { value: PortalPqrs['category']; label: string }[] = [
  { value: 'peticion',   label: 'Petición' },
  { value: 'queja',      label: 'Queja' },
  { value: 'reclamo',    label: 'Reclamo' },
  { value: 'sugerencia', label: 'Sugerencia' },
];

function PqrsTab({ token }: { token: string }) {
  const { data: items = [], isLoading } = usePortalPqrs(token, true);
  const create = usePortalCreatePqrs(token);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: 'peticion' as PortalPqrs['category'], subject: '', description: '' });
  const [err, setErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await create.mutateAsync(form);
      setForm({ category: 'peticion', subject: '', description: '' });
      setShowForm(false);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Error al radicar');
    }
  }

  return (
    <div className="space-y-3">
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-bold transition-all"
        >
          <Send size={14} />
          Radicar nueva solicitud
        </button>
      )}

      {showForm && (
        <form onSubmit={(e) => { void handleSubmit(e); }} className="p-4 rounded-2xl border border-white/[0.1] bg-white/[0.03] space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {PQRS_CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, category: c.value }))}
                className={clsx(
                  'py-2 rounded-xl border text-[12px] font-semibold transition-all',
                  form.category === c.value
                    ? 'bg-blue-500/15 border-blue-400/40 text-blue-300'
                    : 'bg-white/[0.03] border-white/[0.08] text-slate-400',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            className={inputCls}
            placeholder="Asunto (mínimo 5 caracteres)"
            minLength={5}
            maxLength={200}
            required
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className={clsx(inputCls, 'resize-none h-28')}
            placeholder="Describe tu solicitud con detalle (mínimo 20 caracteres)"
            minLength={20}
            maxLength={5000}
            required
          />
          {err && <p className="text-[12px] text-red-400">{err}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 rounded-xl border border-white/[0.1] text-slate-400 text-[13px] font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {create.isPending && <Loader2 size={12} className="animate-spin" />}
              Radicar
            </button>
          </div>
        </form>
      )}

      {isLoading && <CenterSpinner />}
      {!isLoading && items.length === 0 && !showForm && (
        <EmptyState icon={MessageSquare} text="No has radicado solicitudes aún" />
      )}

      {items.map((p) => {
        const st = PQRS_STATUS[p.status];
        return (
          <div key={p.id} className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.03]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                {PQRS_CATEGORIES.find((c) => c.value === p.category)?.label}
              </span>
              <span className={clsx('px-2 py-0.5 rounded-md border text-[10px] font-semibold ml-auto', st.cls)}>
                {st.label}
              </span>
            </div>
            <h3 className="text-[13px] font-bold text-white mt-1.5">{p.subject}</h3>
            <p className="text-[12px] text-slate-400 mt-1 line-clamp-3">{p.description}</p>
            <p className="text-[10px] text-slate-600 mt-2">
              Radicada el {format(p.createdAt, "d 'de' MMMM yyyy", { locale: es })}
            </p>
            {p.adminResponse && (
              <div className="mt-3 p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15">
                <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-400 mb-1">
                  Respuesta de la administración
                </p>
                <p className="text-[12px] text-slate-300 whitespace-pre-wrap">{p.adminResponse}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Reservas ──────────────────────────────────────────────────────────────────

const BOOKING_STATUS: Record<PortalBooking['status'], { label: string; cls: string; Icon: typeof Clock }> = {
  pendiente: { label: 'Pendiente',  cls: 'text-amber-400 bg-amber-400/10 border-amber-400/25',     Icon: Clock },
  aprobada:  { label: 'Aprobada',   cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25', Icon: CheckCircle2 },
  rechazada: { label: 'Rechazada',  cls: 'text-red-400 bg-red-400/10 border-red-400/25',           Icon: XCircle },
  cancelada: { label: 'Cancelada',  cls: 'text-slate-400 bg-slate-400/10 border-slate-400/25',     Icon: XCircle },
};

function ReservasTab({ token }: { token: string }) {
  const { data: amenities = [] } = usePortalAmenities(token, true);
  const { data: bookings = [], isLoading } = usePortalBookings(token, true);
  const create = usePortalCreateBooking(token);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    amenityId: '', date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00', endTime: '11:00', attendees: 1,
  });
  const [err, setErr] = useState('');

  const selected = amenities.find((a) => a.id === form.amenityId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await create.mutateAsync(form);
      setShowForm(false);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Error al solicitar la reserva');
    }
  }

  return (
    <div className="space-y-3">
      {amenities.length === 0 && (
        <EmptyState icon={CalendarDays} text="Tu conjunto no tiene zonas comunes habilitadas para reserva" />
      )}

      {amenities.length > 0 && !showForm && (
        <button
          onClick={() => {
            setForm((f) => ({ ...f, amenityId: amenities[0]?.id ?? '' }));
            setShowForm(true);
          }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-bold transition-all"
        >
          <CalendarDays size={14} />
          Solicitar reserva
        </button>
      )}

      {showForm && (
        <form onSubmit={(e) => { void handleSubmit(e); }} className="p-4 rounded-2xl border border-white/[0.1] bg-white/[0.03] space-y-3">
          <select
            value={form.amenityId}
            onChange={(e) => setForm((f) => ({ ...f, amenityId: e.target.value }))}
            className={inputCls}
            required
          >
            {amenities.map((a) => (
              <option key={a.id} value={a.id}>{a.icon ? `${a.icon} ` : ''}{a.name}</option>
            ))}
          </select>
          {selected && (
            <p className="text-[11px] text-slate-500">
              Horario: {selected.openTime.slice(0, 5)}–{selected.closeTime.slice(0, 5)} · Reserva con máx. {selected.advanceDays} días de anticipación
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={form.date}
              min={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className={inputCls}
              required
            />
            <input
              type="number"
              min={1} max={100}
              value={form.attendees}
              onChange={(e) => setForm((f) => ({ ...f, attendees: Number(e.target.value) }))}
              className={inputCls}
              placeholder="Personas"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              className={inputCls}
              required
            />
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              className={inputCls}
              required
            />
          </div>
          {err && <p className="text-[12px] text-red-400">{err}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 rounded-xl border border-white/[0.1] text-slate-400 text-[13px] font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {create.isPending && <Loader2 size={12} className="animate-spin" />}
              Solicitar
            </button>
          </div>
        </form>
      )}

      {isLoading && <CenterSpinner />}
      {!isLoading && bookings.length === 0 && amenities.length > 0 && !showForm && (
        <EmptyState icon={CalendarDays} text="No tienes reservas" />
      )}

      {bookings.map((b) => {
        const st = BOOKING_STATUS[b.status];
        return (
          <div key={b.id} className="flex items-center gap-3 p-4 rounded-2xl border border-white/[0.08] bg-white/[0.03]">
            <span className="text-xl flex-shrink-0">{b.amenityIcon ?? '🏠'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white truncate">{b.amenityName}</p>
              <p className="text-[11px] text-slate-500">
                {format(new Date(b.date + 'T12:00:00'), "d 'de' MMM", { locale: es })} · {b.startTime.slice(0, 5)}–{b.endTime.slice(0, 5)}
              </p>
              {b.status === 'rechazada' && b.adminNotes && (
                <p className="text-[11px] text-red-400/80 mt-0.5">{b.adminNotes}</p>
              )}
            </div>
            <span className={clsx('flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold flex-shrink-0', st.cls)}>
              <st.Icon size={10} />
              {st.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function CenterSpinner() {
  return (
    <div className="py-10 flex justify-center">
      <Loader2 size={20} className="animate-spin text-slate-500" />
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Wallet; text: string }) {
  return (
    <div className="py-12 flex flex-col items-center text-center">
      <Icon size={28} className="text-slate-600 mb-2" />
      <p className="text-[12px] text-slate-500 max-w-[260px]">{text}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortalPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [tab, setTab] = useState<Tab>('cuenta');

  // Prevent leaking the capability token in the Referer header when
  // the pay button redirects out to Wompi
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'referrer';
      document.head.appendChild(meta);
    }
    meta.content = 'no-referrer';
    return () => { meta?.remove(); };
  }, []);

  const { data, isLoading, error } = usePortalSummary(token);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#080d1a] flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-blue-400" />
      </div>
    );
  }

  const httpStatus = (error as { response?: { status?: number } } | null)?.response?.status;
  const isInvalidLink = httpStatus === 404;

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#080d1a] flex flex-col items-center justify-center px-6 text-center">
        <AlertTriangle size={32} className={isInvalidLink ? 'text-amber-400 mb-3' : 'text-red-400 mb-3'} />
        <h1 className="text-white font-bold text-[16px]">
          {isInvalidLink ? 'Enlace no válido' : 'Error de conexión'}
        </h1>
        <p className="text-slate-400 text-[13px] mt-2 max-w-[300px]">
          {isInvalidLink
            ? 'Este enlace venció o fue reemplazado. Pídele a tu administración que te envíe uno nuevo por WhatsApp.'
            : 'No pudimos cargar tu estado de cuenta. Verifica tu conexión e intenta de nuevo.'}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080d1a] text-white flex flex-col">
      {/* Header */}
      <header className="px-5 pt-6 pb-4 max-w-md mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 flex-shrink-0">
            <Building2 size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-white truncate">{data.building.name}</h1>
            <p className="text-[12px] text-slate-400 truncate">
              {data.unit.label}{data.unit.ownerName ? ` · ${data.unit.ownerName}` : ''}
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-5 pb-24 max-w-md mx-auto w-full">
        {tab === 'cuenta'      && <CuentaTab token={token} />}
        {tab === 'comunicados' && <ComunicadosTab token={token} />}
        {tab === 'pqrs'        && <PqrsTab token={token} />}
        {tab === 'reservas'    && <ReservasTab token={token} />}
      </main>

      {/* Bottom tab bar (mobile-first) */}
      <nav className="fixed bottom-0 inset-x-0 bg-[#0a101f]/95 backdrop-blur-lg border-t border-white/[0.07]">
        <div className="max-w-md mx-auto grid grid-cols-4">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                'flex flex-col items-center gap-1 py-2.5 transition-colors',
                tab === id ? 'text-blue-400' : 'text-slate-500',
              )}
            >
              <Icon size={18} strokeWidth={tab === id ? 2.2 : 1.7} />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </div>
        {/* iOS safe area */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
