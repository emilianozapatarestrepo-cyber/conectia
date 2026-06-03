import { useState } from 'react';
import {
  CalendarDays, Plus, Settings2, CheckCircle2, Clock, XCircle,
  ChevronRight, Users, Phone, Tag, X, Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  useAmenities, useAmenityBookings,
  useCreateAmenityBooking, useApproveBooking, useRejectBooking, useCancelBooking,
  useCreateAmenity, useDeactivateAmenity,
  type Amenity, type AmenityBooking,
} from '@/hooks/useAmenities';
import { useUnits } from '@/hooks/useUnits';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<AmenityBooking['status'], { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  pendiente: { label: 'Pendiente',  color: 'text-amber-400 bg-amber-400/10 border-amber-400/20',  Icon: Clock },
  aprobada:  { label: 'Aprobada',   color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', Icon: CheckCircle2 },
  rechazada: { label: 'Rechazada',  color: 'text-red-400 bg-red-400/10 border-red-400/20',        Icon: XCircle },
  cancelada: { label: 'Cancelada',  color: 'text-slate-400 bg-slate-400/10 border-slate-400/20',  Icon: XCircle },
};

const FILTER_TABS: { value: AmenityBooking['status'] | 'all'; label: string }[] = [
  { value: 'all',       label: 'Todas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobada',  label: 'Aprobadas' },
  { value: 'rechazada', label: 'Rechazadas' },
];

function formatTime(t: string) {
  return t.slice(0, 5); // "HH:MM:SS" → "HH:MM"
}

function formatDateGroup(d: Date) {
  const today = startOfDay(new Date());
  const tom   = addDays(today, 1);
  if (isSameDay(d, today)) return 'Hoy';
  if (isSameDay(d, tom))   return 'Mañana';
  return format(d, "EEEE d 'de' MMMM", { locale: es });
}

function groupByDate(bookings: AmenityBooking[]): [string, AmenityBooking[]][] {
  const map = new Map<string, AmenityBooking[]>();
  for (const b of bookings) {
    const key = format(b.date, 'yyyy-MM-dd');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  return [...map.entries()];
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AmenityBooking['status'] }) {
  const { label, color, Icon } = STATUS_MAP[status];
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold', color)}>
      <Icon size={10} />
      {label}
    </span>
  );
}

// ── Booking Row ───────────────────────────────────────────────────────────────

function BookingRow({ booking, onApprove, onReject, onCancel }: {
  booking:   AmenityBooking;
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
  onCancel:  (id: string) => void;
}) {
  const canAct = booking.status === 'pendiente';
  const canCancel = booking.status === 'pendiente' || booking.status === 'aprobada';

  return (
    <div className="group flex items-start gap-3 px-4 py-3.5 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
      {/* Time band */}
      <div className="flex flex-col items-center text-center w-14 flex-shrink-0 pt-0.5">
        <span className="text-[11px] font-bold text-white tabular-nums">{formatTime(booking.startTime)}</span>
        <div className="w-px h-3 bg-slate-700 my-0.5" />
        <span className="text-[10px] text-slate-500 tabular-nums">{formatTime(booking.endTime)}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {booking.amenityIcon && (
            <span className="text-[13px]">{booking.amenityIcon}</span>
          )}
          <span className="text-[12px] font-semibold text-white truncate">{booking.amenityName ?? '—'}</span>
          <StatusBadge status={booking.status} />
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Users size={10} className="flex-shrink-0" />
            {booking.residentName}
            {booking.unitLabel && <span className="text-slate-500">· {booking.unitLabel}</span>}
          </span>
          {booking.residentPhone && (
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Phone size={10} />
              {booking.residentPhone}
            </span>
          )}
          {booking.attendees > 1 && (
            <span className="text-[11px] text-slate-500">{booking.attendees} personas</span>
          )}
        </div>
        {booking.notes && (
          <p className="text-[11px] text-slate-500 mt-1 truncate">{booking.notes}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {canAct && (
          <button
            onClick={() => onApprove(booking.id)}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-[10px] font-semibold transition-all"
          >
            Aprobar
          </button>
        )}
        {canAct && (
          <button
            onClick={() => onReject(booking.id)}
            className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-[10px] font-semibold transition-all"
          >
            Rechazar
          </button>
        )}
        {canCancel && !canAct && (
          <button
            onClick={() => onCancel(booking.id)}
            className="px-2.5 py-1 rounded-lg bg-slate-500/10 border border-slate-500/20 text-slate-400 hover:bg-slate-500/20 text-[10px] font-semibold transition-all"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

// ── Nueva Reserva Modal ───────────────────────────────────────────────────────

function NuevaReservaModal({ amenities, onClose }: { amenities: Amenity[]; onClose: () => void }) {
  const { data: units = [] } = useUnits();
  const create             = useCreateAmenityBooking();

  const [form, setForm] = useState({
    amenityId:    amenities[0]?.id ?? '',
    unitId:       '',
    residentName: '',
    residentPhone: '',
    date:         format(new Date(), 'yyyy-MM-dd'),
    startTime:    '09:00',
    endTime:      '11:00',
    attendees:    1,
    notes:        '',
  });
  const [err, setErr] = useState('');

  const selectedUnit = units.find((u) => u.unitId === form.unitId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await create.mutateAsync({
        ...form,
        unitId:       form.unitId || null,
        unitLabel:    (selectedUnit?.label ?? form.unitId) || null,
        residentPhone: form.residentPhone || null,
        notes:         form.notes || null,
      });
      onClose();
    } catch (ex: unknown) {
      const msg = (ex as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErr(msg ?? 'Error al crear la reserva');
    }
  }

  const field = (label: string, node: React.ReactNode) => (
    <label className="block">
      <span className="block text-[11px] text-slate-400 font-medium mb-1">{label}</span>
      {node}
    </label>
  );

  const inputCls = 'w-full bg-surface-card border border-surface-border rounded-xl px-3 py-2 text-[12px] text-white focus:outline-none focus:ring-1 focus:ring-brand-primary/50 placeholder:text-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-[440px] bg-[#0e1425] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-white font-bold text-[14px]">Nueva reserva</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="p-5 space-y-3.5">
          {field('Zona', (
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
          ))}

          <div className="grid grid-cols-2 gap-3">
            {field('Fecha', (
              <input
                type="date"
                value={form.date}
                min={format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className={inputCls}
                required
              />
            ))}
            {field('Asistentes', (
              <input
                type="number"
                min={1}
                max={100}
                value={form.attendees}
                onChange={(e) => setForm((f) => ({ ...f, attendees: Number(e.target.value) }))}
                className={inputCls}
                required
              />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {field('Hora inicio', (
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className={inputCls}
                required
              />
            ))}
            {field('Hora fin', (
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className={inputCls}
                required
              />
            ))}
          </div>

          {field('Unidad (opcional)', (
            <select
              value={form.unitId}
              onChange={(e) => {
                const u = units.find((x) => x.unitId === e.target.value);
                setForm((f) => ({
                  ...f,
                  unitId: e.target.value,
                  residentName: u?.ownerName ?? f.residentName,
                  residentPhone: u?.phone ?? f.residentPhone,
                }));
              }}
              className={inputCls}
            >
              <option value="">Sin unidad</option>
              {units.filter((u) => u.active).map((u) => (
                <option key={u.id} value={u.unitId}>{u.label}{u.ownerName ? ` — ${u.ownerName}` : ''}</option>
              ))}
            </select>
          ))}

          {field('Nombre del residente', (
            <input
              type="text"
              value={form.residentName}
              onChange={(e) => setForm((f) => ({ ...f, residentName: e.target.value }))}
              className={inputCls}
              placeholder="Nombre completo"
              required
              minLength={2}
            />
          ))}

          {field('Teléfono (opcional)', (
            <input
              type="tel"
              value={form.residentPhone}
              onChange={(e) => setForm((f) => ({ ...f, residentPhone: e.target.value }))}
              className={inputCls}
              placeholder="3001234567"
            />
          ))}

          {field('Notas (opcional)', (
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={clsx(inputCls, 'resize-none h-16')}
              placeholder="Ej: decoraciones para cumpleaños, número de invitados…"
            />
          ))}

          {err && <p className="text-[11px] text-red-400">{err}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl border border-surface-border bg-surface-card text-slate-300 hover:text-white hover:border-slate-500 text-[12px] font-medium transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="flex-1 px-4 py-2 rounded-xl bg-brand-primary hover:bg-blue-400 text-white text-[12px] font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {create.isPending && <Loader2 size={12} className="animate-spin" />}
              Crear reserva
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Gestionar Zonas Modal ─────────────────────────────────────────────────────

function GestionarZonasModal({ amenities, onClose }: { amenities: Amenity[]; onClose: () => void }) {
  const create     = useCreateAmenity();
  const deactivate = useDeactivateAmenity();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm]       = useState({ name: '', icon: '', capacity: 1, openTime: '07:00', closeTime: '22:00', slotMinutes: 120 });

  const inputCls = 'w-full bg-surface border border-surface-border rounded-xl px-3 py-2 text-[12px] text-white focus:outline-none focus:ring-1 focus:ring-brand-primary/50 placeholder:text-slate-600';

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync({ ...form, icon: form.icon || null });
    setShowNew(false);
    setForm({ name: '', icon: '', capacity: 1, openTime: '07:00', closeTime: '22:00', slotMinutes: 120 });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-[440px] bg-[#0e1425] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-white font-bold text-[14px]">Gestionar zonas comunes</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Existing amenities */}
          {amenities.length > 0 && (
            <div className="p-4 space-y-2">
              {amenities.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-3 bg-surface-card border border-surface-border rounded-xl"
                >
                  <span className="text-lg flex-shrink-0 w-7 text-center">{a.icon ?? '🏠'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-white">{a.name}</p>
                    <p className="text-[10px] text-slate-500">
                      Cap. {a.capacity} · {formatTime(a.openTime)}–{formatTime(a.closeTime)} · {a.slotMinutes}min/turno
                    </p>
                  </div>
                  {a.active && (
                    <button
                      onClick={() => void deactivate.mutateAsync(a.id)}
                      disabled={deactivate.isPending}
                      className="text-[10px] text-slate-500 hover:text-red-400 transition-colors"
                    >
                      Desactivar
                    </button>
                  )}
                  {!a.active && (
                    <span className="text-[10px] text-slate-600 italic">Inactiva</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {amenities.length === 0 && !showNew && (
            <div className="py-10 text-center text-slate-500 text-[12px]">
              No hay zonas registradas aún
            </div>
          )}

          {/* New amenity form */}
          {showNew && (
            <form onSubmit={(e) => { void handleCreate(e); }} className="p-4 space-y-3 border-t border-white/[0.05]">
              <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Nueva zona</p>
              <div className="grid grid-cols-[1fr_80px] gap-2">
                <label className="block">
                  <span className="block text-[10px] text-slate-400 mb-1">Nombre</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className={inputCls}
                    placeholder="Piscina, Salón, Gym…"
                    required minLength={2}
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] text-slate-400 mb-1">Emoji</span>
                  <input
                    type="text"
                    value={form.icon}
                    onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                    className={inputCls}
                    placeholder="🏊"
                    maxLength={4}
                  />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="block text-[10px] text-slate-400 mb-1">Capacidad</span>
                  <input
                    type="number" min={1} max={100}
                    value={form.capacity}
                    onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] text-slate-400 mb-1">Apertura</span>
                  <input
                    type="time"
                    value={form.openTime}
                    onChange={(e) => setForm((f) => ({ ...f, openTime: e.target.value }))}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] text-slate-400 mb-1">Cierre</span>
                  <input
                    type="time"
                    value={form.closeTime}
                    onChange={(e) => setForm((f) => ({ ...f, closeTime: e.target.value }))}
                    className={inputCls}
                  />
                </label>
              </div>
              <label className="block">
                <span className="block text-[10px] text-slate-400 mb-1">Duración por turno (minutos)</span>
                <select
                  value={form.slotMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, slotMinutes: Number(e.target.value) }))}
                  className={inputCls}
                >
                  {[30, 60, 90, 120, 180, 240, 360, 480].map((m) => (
                    <option key={m} value={m}>{m} min</option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="flex-1 px-3 py-2 rounded-xl border border-surface-border text-slate-400 text-[11px] hover:text-white transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={create.isPending}
                  className="flex-1 px-3 py-2 rounded-xl bg-brand-primary hover:bg-blue-400 text-white text-[11px] font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {create.isPending && <Loader2 size={10} className="animate-spin" />}
                  Guardar zona
                </button>
              </div>
            </form>
          )}
        </div>

        {!showNew && (
          <div className="px-5 py-3 border-t border-white/[0.06]">
            <button
              onClick={() => setShowNew(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 text-[12px] font-medium transition-all"
            >
              <Plus size={13} />
              Agregar zona
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-surface-card border border-surface-border" />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReservasPage() {
  const [filterStatus,  setFilterStatus]  = useState<AmenityBooking['status'] | 'all'>('all');
  const [filterAmenity, setFilterAmenity] = useState('');
  const [showNueva,     setShowNueva]     = useState(false);
  const [showGestionar, setShowGestionar] = useState(false);

  const { data: amenities = [], isLoading: amenLoading } = useAmenities();
  const activeAmenities = amenities.filter((a) => a.active);

  // load bookings for next 30 days
  const today   = format(new Date(), 'yyyy-MM-dd');
  const in30    = format(addDays(new Date(), 30), 'yyyy-MM-dd');

  const { data: bookings = [], isLoading: bookingsLoading } = useAmenityBookings({
    dateFrom:   today,
    dateTo:     in30,
    amenityId:  filterAmenity || undefined,
    status:     filterStatus === 'all' ? undefined : filterStatus,
    limit:      200,
  });

  const approve = useApproveBooking();
  const reject  = useRejectBooking();
  const cancel  = useCancelBooking();

  // KPIs
  const pending     = bookings.filter((b) => b.status === 'pendiente').length;
  const approved    = bookings.filter((b) => b.status === 'aprobada').length;
  const totalZonas  = activeAmenities.length;

  const grouped = groupByDate(bookings);
  const isLoading = amenLoading || bookingsLoading;

  return (
    <div className="p-5 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-white font-bold text-[15px] tracking-tight">Zonas comunes</h1>
          <p className="text-slate-400 text-[12px] mt-0.5">Reservas y disponibilidad de amenidades</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowGestionar(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-surface-border bg-surface-card text-slate-300 hover:text-white hover:border-slate-500 text-[12px] font-medium transition-all"
          >
            <Settings2 size={13} />
            Gestionar zonas
          </button>
          <button
            onClick={() => setShowNueva(true)}
            disabled={activeAmenities.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-primary hover:bg-blue-400 text-white text-[12px] font-semibold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={13} />
            Nueva reserva
          </button>
        </div>
      </div>

      {/* Empty state if no amenities */}
      {!amenLoading && activeAmenities.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-surface-border rounded-2xl">
          <CalendarDays size={32} className="text-slate-600 mb-3" />
          <p className="text-[13px] font-semibold text-slate-400">No hay zonas comunes configuradas</p>
          <p className="text-[11px] text-slate-500 mt-1 mb-4">Agrega la piscina, salón comunal, gimnasio u otras zonas para empezar a gestionar reservas.</p>
          <button
            onClick={() => setShowGestionar(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-primary hover:bg-blue-400 text-white text-[12px] font-semibold transition-all"
          >
            <Plus size={13} />
            Agregar primera zona
          </button>
        </div>
      )}

      {activeAmenities.length > 0 && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center gap-3 p-4 rounded-2xl border border-amber-500/20 bg-surface-card">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <Clock size={15} className="text-amber-400" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Pendientes</p>
                <p className="text-[22px] font-bold text-amber-300 tabular-nums leading-tight">{pending}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-500/20 bg-surface-card">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 size={15} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Aprobadas</p>
                <p className="text-[22px] font-bold text-white tabular-nums leading-tight">{approved}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-2xl border border-surface-border bg-surface-card">
              <div className="w-8 h-8 rounded-xl bg-brand-primary/15 flex items-center justify-center flex-shrink-0">
                <Tag size={15} className="text-brand-primary" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Zonas activas</p>
                <p className="text-[22px] font-bold text-white tabular-nums leading-tight">{totalZonas}</p>
              </div>
            </div>
          </div>

          {/* Amenity chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilterAmenity('')}
              className={clsx(
                'px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition-all',
                !filterAmenity
                  ? 'bg-brand-primary border-brand-primary text-white'
                  : 'bg-surface-card border-surface-border text-slate-400 hover:text-white',
              )}
            >
              Todas las zonas
            </button>
            {activeAmenities.map((a) => (
              <button
                key={a.id}
                onClick={() => setFilterAmenity(a.id)}
                className={clsx(
                  'px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition-all',
                  filterAmenity === a.id
                    ? 'bg-brand-primary border-brand-primary text-white'
                    : 'bg-surface-card border-surface-border text-slate-400 hover:text-white',
                )}
              >
                {a.icon && <span className="mr-1">{a.icon}</span>}
                {a.name}
              </button>
            ))}

            {/* Status tabs */}
            <div className="ml-auto flex gap-1 p-1 bg-surface-card border border-surface-border rounded-xl">
              {FILTER_TABS.map(({ value, label }) => (
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
          </div>

          {/* Bookings list */}
          <div className="rounded-2xl border border-surface-border overflow-hidden bg-surface-card">
            {isLoading && <div className="p-5"><Skeleton /></div>}

            {!isLoading && bookings.length === 0 && (
              <div className="py-14 text-center">
                <CalendarDays size={28} className="text-slate-600 mx-auto mb-2" />
                <p className="text-[12px] text-slate-500">No hay reservas en los próximos 30 días</p>
              </div>
            )}

            {!isLoading && grouped.map(([dateKey, dayBookings]) => {
              const date = new Date(dateKey + 'T12:00:00');
              return (
                <div key={dateKey}>
                  <div className="flex items-center gap-2 px-4 py-2 bg-surface border-b border-white/[0.04]">
                    <CalendarDays size={12} className="text-slate-500" />
                    <span className="text-[11px] font-semibold text-slate-400 capitalize">
                      {formatDateGroup(date)}
                      <span className="ml-1.5 text-slate-600 font-normal">
                        {format(date, 'd MMM', { locale: es })}
                      </span>
                    </span>
                    <ChevronRight size={10} className="text-slate-600" />
                    <span className="text-[10px] text-slate-600">{dayBookings.length} {dayBookings.length === 1 ? 'reserva' : 'reservas'}</span>
                  </div>
                  {dayBookings.map((b) => (
                    <BookingRow
                      key={b.id}
                      booking={b}
                      onApprove={(id) => void approve.mutateAsync(id)}
                      onReject={(id) => void reject.mutateAsync({ id })}
                      onCancel={(id) => void cancel.mutateAsync(id)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modals */}
      {showNueva && (
        <NuevaReservaModal amenities={activeAmenities} onClose={() => setShowNueva(false)} />
      )}
      {showGestionar && (
        <GestionarZonasModal amenities={amenities} onClose={() => setShowGestionar(false)} />
      )}
    </div>
  );
}
