import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Plus, ChevronLeft, Users, CheckCircle2, XCircle, Minus,
  Play, Square, FileText, Loader2, Trash2, Vote,
  CalendarDays, MapPin, Percent, AlertTriangle,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  useAssembliesList, useAssemblyDetail,
  useCreateAssembly, useStartAssembly, useCloseAssembly,
  useAddAgendaItem, useDeleteAgendaItem, useResolveAgendaItem,
  useRegisterAttendance, useRemoveAttendance, useCastVote, useSaveMinutes,
  type AssemblySummary, type AssemblyStatus,
} from '@/hooks/useAssemblies';
import { useUnits } from '@/hooks/useUnits';

// ── Shared visual helpers ─────────────────────────────────────────────────────

const STATUS_BADGE: Record<AssemblyStatus, { label: string; cls: string }> = {
  borrador:   { label: 'Borrador',   cls: 'bg-slate-500/15 text-slate-400 border-slate-500/25' },
  convocada:  { label: 'Convocada',  cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  en_curso:   { label: 'En curso',   cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25 animate-pulse' },
  cerrada:    { label: 'Cerrada',    cls: 'bg-slate-600/20 text-slate-500 border-slate-600/30' },
};

const inputCls = 'w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-blue-400/50 placeholder:text-slate-500';
const btnPrimary = 'flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-indigo-500 text-white text-[13px] font-semibold transition-all disabled:opacity-50';
const btnGhost = 'flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/[0.08] hover:bg-white/[0.04] text-slate-400 text-[13px] transition-all';

function Badge({ status }: { status: AssemblyStatus }) {
  const s = STATUS_BADGE[status];
  return <span className={clsx('px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider', s.cls)}>{s.label}</span>;
}

// ── Quorum gauge ──────────────────────────────────────────────────────────────

function QuorumGauge({ present, total, quorumPct, reached }: {
  present: number; total: number; quorumPct: number; reached: boolean;
}) {
  const pct = total > 0 ? Math.min((present / total) * 100, 100) : 0;
  const threshold = Math.min(quorumPct, 100);

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[12px]">
        <span className="text-slate-400">Quórum</span>
        <span className={reached ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
          {pct.toFixed(1)}% / {threshold}% requerido
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-white/[0.06]">
        <div
          className="absolute top-0 h-full w-0.5 bg-slate-400/40 rounded-full"
          style={{ left: `${threshold}%` }}
        />
        <div
          className={clsx('h-full rounded-full transition-all duration-500', reached ? 'bg-emerald-500' : 'bg-amber-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-slate-500">
        {present.toFixed(4)} / {total.toFixed(4)} coeficiente presente
        {reached ? ' · ✓ Quórum alcanzado' : ''}
      </p>
    </div>
  );
}

// ── Vote bar ──────────────────────────────────────────────────────────────────

type VoteTally = {
  a_favor:    { count: number; coefficient: number };
  en_contra:  { count: number; coefficient: number };
  abstencion: { count: number; coefficient: number };
  totalVoted: number;
  approved:   boolean | null;
};

function VoteBar({ votes }: { votes: VoteTally }) {
  const total = votes.totalVoted;
  const aFavorPct  = total > 0 ? (votes.a_favor.coefficient  / total) * 100 : 0;
  const contraPct  = total > 0 ? (votes.en_contra.coefficient / total) * 100 : 0;
  const abstPct    = total > 0 ? (votes.abstencion.coefficient / total) * 100 : 0;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        {aFavorPct  > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${aFavorPct}%` }} />}
        {contraPct  > 0 && <div className="bg-red-500    transition-all" style={{ width: `${contraPct}%` }} />}
        {abstPct    > 0 && <div className="bg-slate-500  transition-all" style={{ width: `${abstPct}%` }} />}
        {total === 0 && <div className="bg-white/[0.08] w-full" />}
      </div>
      <div className="flex gap-3 text-[10px] flex-wrap">
        <span className="text-emerald-400">✓ A favor: {votes.a_favor.count} ({votes.a_favor.coefficient.toFixed(2)})</span>
        <span className="text-red-400">✗ En contra: {votes.en_contra.count} ({votes.en_contra.coefficient.toFixed(2)})</span>
        <span className="text-slate-400">~ Abstención: {votes.abstencion.count}</span>
        {votes.approved !== null && (
          <span className={votes.approved ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
            → {votes.approved ? 'APROBADO' : 'RECHAZADO'}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Assembly list ─────────────────────────────────────────────────────────────

function AssemblyList({ onSelect }: { onSelect: (a: AssemblySummary) => void }) {
  const { data: assemblies = [], isLoading } = useAssembliesList();
  const create = useCreateAssembly();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    type: import('@/hooks/useAssemblies').AssemblyType;
    title: string; scheduledDate: string; scheduledTime: string;
    location: string; quorumPct: number;
  }>({
    type: 'ordinaria',
    title: '',
    scheduledDate: '',
    scheduledTime: '',
    location: '',
    quorumPct: 50,
  });
  const [err, setErr] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      const created = await create.mutateAsync({
        ...form,
        scheduledDate: form.scheduledDate || null,
        scheduledTime: form.scheduledTime || null,
        location:      form.location || null,
      });
      setShowForm(false);
      setForm({ type: 'ordinaria', title: '', scheduledDate: '', scheduledTime: '', location: '', quorumPct: 50 });
      onSelect(created);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Error al crear');
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={22} className="animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-white">Asambleas</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">Gestión digital de asambleas (Ley 675)</p>
        </div>
        <button onClick={() => setShowForm(true)} className={btnPrimary}>
          <Plus size={14} /> Nueva
        </button>
      </div>

      {showForm && (
        <form onSubmit={(e) => { void handleCreate(e); }}
          className="p-5 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-3"
        >
          <h2 className="text-[14px] font-semibold text-white">Nueva asamblea</h2>
          <div className="grid grid-cols-2 gap-2">
            {(['ordinaria', 'extraordinaria'] as const).map((t) => (
              <button key={t} type="button"
                onClick={() => setForm((f) => ({ ...f, type: t }))}
                className={clsx('py-2 rounded-lg border text-[12px] font-semibold transition-all capitalize',
                  form.type === t
                    ? 'bg-blue-500/15 border-blue-400/40 text-blue-300'
                    : 'bg-white/[0.03] border-white/[0.08] text-slate-400')}
              >{t}</button>
            ))}
          </div>
          <input className={inputCls} placeholder="Título de la asamblea *" required minLength={5}
            value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className={inputCls}
              value={form.scheduledDate} onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))} />
            <input type="time" className={inputCls}
              value={form.scheduledTime} onChange={(e) => setForm((f) => ({ ...f, scheduledTime: e.target.value }))} />
          </div>
          <input className={inputCls} placeholder="Lugar / enlace virtual"
            value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
          <label className="flex items-center gap-2 text-[12px] text-slate-400">
            <Percent size={12} />
            Quórum requerido: <strong className="text-white">{form.quorumPct}%</strong>
            <input type="range" min={25} max={75} step={1} value={form.quorumPct}
              onChange={(e) => setForm((f) => ({ ...f, quorumPct: Number(e.target.value) }))}
              className="flex-1 accent-blue-400" />
          </label>
          {err && <p className="text-[12px] text-red-400">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className={btnGhost}>Cancelar</button>
            <button type="submit" disabled={create.isPending} className={btnPrimary}>
              {create.isPending && <Loader2 size={12} className="animate-spin" />}
              Crear
            </button>
          </div>
        </form>
      )}

      {assemblies.length === 0 && !showForm && (
        <div className="py-16 text-center">
          <CalendarDays size={32} className="text-slate-600 mx-auto mb-2" />
          <p className="text-slate-500 text-[13px]">No hay asambleas registradas.</p>
        </div>
      )}
      <div className="space-y-2">
        {assemblies.map((a) => (
          <button key={a.id} onClick={() => onSelect(a)}
            className="w-full text-left p-4 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 capitalize">{a.type}</span>
                  <Badge status={a.status} />
                </div>
                <h3 className="text-[14px] font-semibold text-white mt-1">{a.title}</h3>
                {a.scheduledDate && (
                  <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                    <CalendarDays size={10} />
                    {format(parseISO(a.scheduledDate + 'T12:00:00'), "d 'de' MMMM yyyy", { locale: es })}
                    {a.scheduledTime && ` · ${a.scheduledTime.slice(0, 5)}`}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Agenda tab ────────────────────────────────────────────────────────────────

function AgendaTab({ assemblyId, assemblyStatus }: { assemblyId: string; assemblyStatus: AssemblyStatus }) {
  const { data: detail } = useAssemblyDetail(assemblyId);
  const addItem    = useAddAgendaItem(assemblyId);
  const deleteItem = useDeleteAgendaItem(assemblyId);
  const resolve    = useResolveAgendaItem(assemblyId);
  const castVote   = useCastVote(assemblyId);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    title: string; description: string;
    type: import('@/hooks/useAssemblies').AgendaItemType; requiredMajority: number;
  }>({ title: '', description: '', type: 'votacion', requiredMajority: 50 });
  const [voteUnit, setVoteUnit] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');

  const agenda = detail?.agenda ?? [];
  const isClosed = assemblyStatus === 'cerrada';
  const isActive = assemblyStatus === 'en_curso';

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await addItem.mutateAsync({ ...form, description: form.description || null, order: agenda.length });
      setForm({ title: '', description: '', type: 'votacion', requiredMajority: 50 });
      setShowForm(false);
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Error'); }
  }

  async function handleVote(agendaItemId: string, vote: 'a_favor' | 'en_contra' | 'abstencion') {
    const unitId = voteUnit[agendaItemId];
    if (!unitId) return;
    try { await castVote.mutateAsync({ agendaItemId, unitId, vote }); }
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Error al votar'); }
  }

  return (
    <div className="space-y-3">
      {!isClosed && (
        <button onClick={() => setShowForm((s) => !s)} className={btnGhost}>
          <Plus size={13} /> Agregar punto
        </button>
      )}

      {showForm && (
        <form onSubmit={(e) => { void handleAdd(e); }}
          className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-3"
        >
          <div className="grid grid-cols-2 gap-2">
            {(['votacion', 'informativo'] as const).map((t) => (
              <button key={t} type="button"
                onClick={() => setForm((f) => ({ ...f, type: t }))}
                className={clsx('py-1.5 rounded-lg border text-[12px] font-semibold transition-all',
                  form.type === t
                    ? 'bg-blue-500/15 border-blue-400/40 text-blue-300'
                    : 'bg-white/[0.03] border-white/[0.08] text-slate-400')}
              >{t === 'votacion' ? 'Votación' : 'Informativo'}</button>
            ))}
          </div>
          <input className={inputCls} placeholder="Título del punto *" required minLength={3}
            value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <textarea className={clsx(inputCls, 'resize-none h-20')} placeholder="Descripción (opcional)"
            value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          {form.type === 'votacion' && (
            <label className="flex items-center gap-2 text-[12px] text-slate-400">
              Mayoría requerida: <strong className="text-white">{form.requiredMajority}%</strong>
              <input type="range" min={25} max={75} step={1} value={form.requiredMajority}
                onChange={(e) => setForm((f) => ({ ...f, requiredMajority: Number(e.target.value) }))}
                className="flex-1 accent-blue-400" />
            </label>
          )}
          {err && <p className="text-[12px] text-red-400">{err}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)} className={btnGhost}>Cancelar</button>
            <button type="submit" disabled={addItem.isPending} className={btnPrimary}>
              {addItem.isPending && <Loader2 size={12} className="animate-spin" />}
              Agregar
            </button>
          </div>
        </form>
      )}

      {agenda.length === 0 && (
        <p className="text-[12px] text-slate-500 py-4 text-center">Sin puntos en el orden del día</p>
      )}

      {agenda.map((item, i) => (
        <div key={item.id} className="p-4 rounded-xl border border-white/[0.07] bg-white/[0.02] space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-[11px] text-slate-600 font-bold mt-0.5 flex-shrink-0">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-[13px] font-semibold text-white">{item.title}</h4>
                <span className={clsx('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                  item.type === 'votacion' ? 'bg-purple-500/15 text-purple-400' : 'bg-slate-500/15 text-slate-400'
                )}>{item.type}</span>
                {item.resolvedStatus && (
                  <span className={clsx('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border',
                    item.resolvedStatus === 'aprobado'
                      ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
                      : 'text-red-400 border-red-400/30 bg-red-400/10'
                  )}>{item.resolvedStatus}</span>
                )}
              </div>
              {item.description && <p className="text-[12px] text-slate-400 mt-0.5">{item.description}</p>}
            </div>
            {!isClosed && (
              <button onClick={() => void deleteItem.mutateAsync(item.id)}
                className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0 p-1">
                <Trash2 size={13} />
              </button>
            )}
          </div>

          {item.type === 'votacion' && item.votes && (
            <VoteBar votes={item.votes} />
          )}

          {isActive && item.type === 'votacion' && (
            <div className="pt-2 border-t border-white/[0.06] space-y-2">
              <p className="text-[10px] text-slate-600">Registrar voto por unidad</p>
              <div className="flex gap-2 items-center flex-wrap">
                <input
                  className={clsx(inputCls, 'flex-1 min-w-0 h-8 text-[12px]')}
                  placeholder="ID unidad (ej: A-101)"
                  value={voteUnit[item.id] ?? ''}
                  onChange={(e) => setVoteUnit((s) => ({ ...s, [item.id]: e.target.value }))}
                />
                <button onClick={() => void handleVote(item.id, 'a_favor')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-[12px] font-semibold transition-all">
                  <CheckCircle2 size={12} /> A favor
                </button>
                <button onClick={() => void handleVote(item.id, 'en_contra')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-[12px] font-semibold transition-all">
                  <XCircle size={12} /> En contra
                </button>
                <button onClick={() => void handleVote(item.id, 'abstencion')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-500/15 hover:bg-slate-500/25 border border-slate-500/30 text-slate-400 text-[12px] font-semibold transition-all">
                  <Minus size={12} /> Abstención
                </button>
              </div>
            </div>
          )}

          {!isClosed && item.type === 'votacion' && (
            <div className="flex gap-2 pt-1 border-t border-white/[0.04] items-center">
              <p className="text-[10px] text-slate-600">Fallo manual:</p>
              {(['aprobado', 'rechazado'] as const).map((s) => (
                <button key={s}
                  onClick={() => void resolve.mutateAsync({ itemId: item.id, resolvedStatus: item.resolvedStatus === s ? null : s })}
                  className={clsx('px-2 py-0.5 rounded text-[10px] font-semibold border transition-all',
                    item.resolvedStatus === s
                      ? s === 'aprobado' ? 'bg-emerald-400/20 border-emerald-400/40 text-emerald-400' : 'bg-red-400/20 border-red-400/40 text-red-400'
                      : 'border-white/[0.08] text-slate-500 hover:text-white'
                  )}>
                  {s === 'aprobado' ? '✓ Aprobado' : '✗ Rechazado'}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Attendance tab ────────────────────────────────────────────────────────────

function AsistenciaTab({ assemblyId, assemblyStatus }: { assemblyId: string; assemblyStatus: AssemblyStatus }) {
  const { data: detail } = useAssemblyDetail(assemblyId);
  const { data: units = [] } = useUnits();
  const register = useRegisterAttendance(assemblyId);
  const remove   = useRemoveAttendance(assemblyId);

  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');

  const attendances = detail?.attendances ?? [];
  const registeredIds = new Set(attendances.map((a) => a.unitId));
  const isClosed = assemblyStatus === 'cerrada';

  const filteredUnits = units
    .filter((u) =>
      !registeredIds.has(u.unitId) &&
      (search === '' ||
        u.unitId.toLowerCase().includes(search.toLowerCase()) ||
        (u.label ?? '').toLowerCase().includes(search.toLowerCase()))
    )
    .slice(0, 8);

  async function handleRegister(unitId: string) {
    setErr('');
    try { await register.mutateAsync({ unitId }); }
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Error al registrar'); }
  }

  return (
    <div className="space-y-3">
      {detail?.quorum && (
        <div className="p-4 rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <QuorumGauge
            present={detail.quorum.presentCoefficient}
            total={detail.quorum.totalCoefficient}
            quorumPct={detail.quorum.quorumPct}
            reached={detail.quorum.quorumReached}
          />
        </div>
      )}

      {!isClosed && (
        <div>
          <input className={inputCls} placeholder="Buscar unidad para registrar asistencia…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && filteredUnits.length > 0 && (
            <div className="mt-1 rounded-lg border border-white/[0.08] bg-[#0d1525] divide-y divide-white/[0.05]">
              {filteredUnits.map((u) => (
                <button key={u.unitId}
                  onClick={() => { void handleRegister(u.unitId); setSearch(''); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] text-left transition-colors"
                >
                  <span className="text-[13px] font-semibold text-white">{u.unitId}</span>
                  <span className="text-[12px] text-slate-400 flex-1 truncate">{u.label}</span>
                  {u.ownerName && <span className="text-[11px] text-slate-500 truncate">{u.ownerName}</span>}
                  <span className="text-[10px] text-blue-400 flex-shrink-0 tabular-nums">
                    {Number(u.coefficient ?? 0).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {err && <p className="text-[12px] text-red-400 mt-1">{err}</p>}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold px-1">
          {attendances.length} unidades presentes
        </p>
        {attendances.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.01]">
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-semibold text-white">{a.unitId}</span>
              <span className="text-[12px] text-slate-400 ml-2">{a.unitLabel}</span>
              {a.ownerName && <p className="text-[11px] text-slate-500">{a.ownerName}</p>}
            </div>
            <span className="text-[11px] text-blue-400 flex-shrink-0 tabular-nums">
              {Number(a.coefficient).toFixed(4)}
            </span>
            <span className={clsx('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase flex-shrink-0',
              a.attendanceMode === 'presencial'
                ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
                : a.attendanceMode === 'virtual'
                ? 'text-blue-400 border-blue-400/30 bg-blue-400/10'
                : 'text-amber-400 border-amber-400/30 bg-amber-400/10'
            )}>{a.attendanceMode}</span>
            {!isClosed && (
              <button onClick={() => void remove.mutateAsync(a.unitId)}
                className="text-slate-600 hover:text-red-400 transition-colors p-1 flex-shrink-0">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        {attendances.length === 0 && (
          <p className="text-[12px] text-slate-600 py-4 text-center">Sin asistentes registrados</p>
        )}
      </div>
    </div>
  );
}

// ── Minutes tab ───────────────────────────────────────────────────────────────

function ActaTab({ assemblyId }: { assemblyId: string }) {
  const { data: detail } = useAssemblyDetail(assemblyId);
  const save = useSaveMinutes(assemblyId);
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const currentText = text ?? detail?.assembly.minutesText ?? '';

  async function handleSave(approve = false) {
    try {
      await save.mutateAsync({ minutesText: currentText, approve });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* noop */ }
  }

  return (
    <div className="space-y-3">
      {detail?.assembly.minutesApprovedAt && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/20">
          <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
          <p className="text-[12px] text-emerald-300">
            Acta aprobada el {format(new Date(detail.assembly.minutesApprovedAt), "d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
      )}
      <textarea
        className={clsx(inputCls, 'resize-none h-72 font-mono text-[12px]')}
        placeholder="Redacta el acta de la asamblea aquí…"
        value={currentText}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <button onClick={() => void handleSave(false)} disabled={save.isPending} className={btnGhost}>
          {saved ? <CheckCircle2 size={13} className="text-emerald-400" /> : <FileText size={13} />}
          {saved ? 'Guardado' : 'Guardar borrador'}
        </button>
        {!detail?.assembly.minutesApprovedAt && (
          <button onClick={() => void handleSave(true)} disabled={save.isPending} className={btnPrimary}>
            <CheckCircle2 size={13} /> Aprobar acta
          </button>
        )}
      </div>
    </div>
  );
}

// ── Assembly detail ───────────────────────────────────────────────────────────

type DetailTab = 'asistencia' | 'agenda' | 'acta';

function AssemblyDetail({ assembly, onBack }: { assembly: AssemblySummary; onBack: () => void }) {
  const { data: detail, isLoading } = useAssemblyDetail(assembly.id);
  const startAssembly = useStartAssembly();
  const closeAssembly = useCloseAssembly();
  const [activeTab, setActiveTab] = useState<DetailTab>('asistencia');
  const [err, setErr] = useState('');

  const status = detail?.assembly.status ?? assembly.status;

  async function handleStart() {
    setErr('');
    try { await startAssembly.mutateAsync(assembly.id); }
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Error'); }
  }

  async function handleClose() {
    if (!window.confirm('¿Cerrar la asamblea? Esta acción no se puede deshacer.')) return;
    try { await closeAssembly.mutateAsync(assembly.id); }
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Error'); }
  }

  const TABS: { id: DetailTab; label: string; Icon: typeof Vote }[] = [
    { id: 'asistencia', label: 'Asistencia', Icon: Users },
    { id: 'agenda',     label: 'Orden del día', Icon: Vote },
    { id: 'acta',       label: 'Acta', Icon: FileText },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <button onClick={onBack} className={clsx(btnGhost, 'flex-shrink-0 mt-0.5')}>
          <ChevronLeft size={14} /> Volver
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 capitalize">{assembly.type}</span>
            <Badge status={status} />
          </div>
          <h2 className="text-[18px] font-bold text-white truncate mt-0.5">{assembly.title}</h2>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 flex-wrap">
            {assembly.scheduledDate && (
              <span className="flex items-center gap-1">
                <CalendarDays size={10} />
                {format(parseISO(assembly.scheduledDate + 'T12:00:00'), "d 'de' MMMM yyyy", { locale: es })}
                {assembly.scheduledTime && ` · ${assembly.scheduledTime.slice(0, 5)}`}
              </span>
            )}
            {detail?.assembly.location && (
              <span className="flex items-center gap-1">
                <MapPin size={10} /> {detail.assembly.location}
              </span>
            )}
          </div>
        </div>
      </div>

      {detail?.quorum && (
        <div className={clsx(
          'flex items-center gap-3 px-4 py-2.5 rounded-xl border',
          detail.quorum.quorumReached
            ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
            : 'border-amber-500/25 bg-amber-500/[0.06]'
        )}>
          <AlertTriangle size={14} className={detail.quorum.quorumReached ? 'text-emerald-400' : 'text-amber-400'} />
          <p className="text-[12px] font-semibold text-white">
            {detail.quorum.quorumReached ? 'Quórum alcanzado' : 'Sin quórum aún'}
            {' '}— {detail.quorum.presentPct.toFixed(1)}% presente ({detail.quorum.attendanceCount} unidades)
          </p>
        </div>
      )}

      {err && (
        <p className="text-[12px] text-red-400 flex items-center gap-1.5">
          <AlertTriangle size={12} /> {err}
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        {(status === 'borrador' || status === 'convocada') && (
          <button onClick={() => void handleStart()} disabled={startAssembly.isPending}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-semibold transition-all disabled:opacity-50">
            {startAssembly.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Iniciar asamblea
          </button>
        )}
        {status === 'en_curso' && (
          <button onClick={() => void handleClose()} disabled={closeAssembly.isPending}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-[13px] font-semibold transition-all disabled:opacity-50">
            {closeAssembly.isPending ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />}
            Cerrar asamblea
          </button>
        )}
      </div>

      <div className="flex border-b border-white/[0.07]">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors',
              activeTab === id
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            )}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-slate-500" />
        </div>
      )}

      {!isLoading && activeTab === 'asistencia' && (
        <AsistenciaTab assemblyId={assembly.id} assemblyStatus={status} />
      )}
      {!isLoading && activeTab === 'agenda' && (
        <AgendaTab assemblyId={assembly.id} assemblyStatus={status} />
      )}
      {!isLoading && activeTab === 'acta' && (
        <ActaTab assemblyId={assembly.id} />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AsambleaPage() {
  const [selected, setSelected] = useState<AssemblySummary | null>(null);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {selected
        ? <AssemblyDetail assembly={selected} onBack={() => setSelected(null)} />
        : <AssemblyList onSelect={setSelected} />
      }
    </div>
  );
}
