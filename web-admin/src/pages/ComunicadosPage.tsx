import { useState } from 'react';
import {
  Megaphone, Plus, X, Loader2, Send, CheckCircle2, Users,
  AlertTriangle, MessageCircle, Trash2, ChevronRight, FileText,
} from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  useAnnouncements, useCreateAnnouncement, usePublishAnnouncement,
  useAnnouncementRecipients, useMarkRecipientSent, useDeleteAnnouncement,
  useAudiencePreview,
  type Announcement,
} from '@/hooks/useAnnouncements';
import { useUnits } from '@/hooks/useUnits';

// ── Audience meta ─────────────────────────────────────────────────────────────

const AUDIENCE_META: Record<Announcement['audience'], { label: string; Icon: typeof Users; hint: string }> = {
  todos:     { label: 'Todos',         Icon: Users,         hint: 'Todas las unidades activas' },
  morosos:   { label: 'Morosos',       Icon: AlertTriangle, hint: 'Solo unidades con cargos en mora' },
  seleccion: { label: 'Selección',     Icon: CheckCircle2,  hint: 'Unidades específicas' },
};

// ── Composer Modal ────────────────────────────────────────────────────────────

function ComposerModal({ onClose }: { onClose: () => void }) {
  const { data: units = [] } = useUnits();
  const create  = useCreateAnnouncement();
  const publish = usePublishAnnouncement();

  const [form, setForm] = useState({
    title:    '',
    body:     '',
    audience: 'todos' as Announcement['audience'],
  });
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');

  const preview = useAudiencePreview(
    form.audience === 'seleccion' ? 'todos' : form.audience,
    form.audience !== 'seleccion',
  );

  const recipientCount = form.audience === 'seleccion'
    ? selectedUnits.size
    : preview.data?.count ?? null;

  const toggleUnit = (unitId: string) => {
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  async function handleSubmit(publishNow: boolean) {
    setErr('');
    try {
      const created = await create.mutateAsync({
        title:    form.title,
        body:     form.body,
        audience: form.audience,
        unitIds:  form.audience === 'seleccion' ? [...selectedUnits] : null,
      });
      if (publishNow) {
        await publish.mutateAsync(created.id);
      }
      onClose();
    } catch (ex: unknown) {
      const msg = (ex as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErr(msg ?? 'Error al guardar el comunicado');
    }
  }

  const busy = create.isPending || publish.isPending;
  const valid = form.title.length >= 5 && form.body.length >= 10
    && (form.audience !== 'seleccion' || selectedUnits.size > 0);

  const inputCls = 'w-full bg-surface-card border border-surface-border rounded-xl px-3 py-2 text-[12px] text-white focus:outline-none focus:ring-1 focus:ring-brand-primary/50 placeholder:text-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-[520px] bg-[#0e1425] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-white font-bold text-[14px]">Nuevo comunicado</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <label className="block">
            <span className="block text-[11px] text-slate-400 font-medium mb-1">Asunto</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className={inputCls}
              placeholder="Ej: Corte de agua programado — Torre B"
              maxLength={150}
            />
          </label>

          <label className="block">
            <span className="block text-[11px] text-slate-400 font-medium mb-1">Mensaje</span>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              className={clsx(inputCls, 'resize-none h-32')}
              placeholder="Escribe el comunicado. Se enviará por WhatsApp con saludo personalizado por residente."
              maxLength={2000}
            />
            <span className="block text-right text-[10px] text-slate-600 mt-0.5">{form.body.length}/2000</span>
          </label>

          {/* Audience selector */}
          <div>
            <span className="block text-[11px] text-slate-400 font-medium mb-1.5">Audiencia</span>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(AUDIENCE_META) as [Announcement['audience'], typeof AUDIENCE_META.todos][]).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, audience: key }))}
                  className={clsx(
                    'flex flex-col items-center gap-1 p-3 rounded-xl border text-[11px] font-semibold transition-all',
                    form.audience === key
                      ? 'bg-brand-primary/10 border-brand-primary/40 text-brand-primary'
                      : 'bg-surface-card border-surface-border text-slate-400 hover:text-white hover:border-slate-500',
                  )}
                >
                  <meta.Icon size={15} />
                  {meta.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">
              {AUDIENCE_META[form.audience].hint}
              {recipientCount !== null && (
                <span className="text-slate-300 font-semibold"> · {recipientCount} destinatarios</span>
              )}
            </p>
          </div>

          {/* Unit picker for selección */}
          {form.audience === 'seleccion' && (
            <div className="border border-surface-border rounded-xl max-h-44 overflow-y-auto divide-y divide-white/[0.04]">
              {units.filter((u) => u.active).map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-white/[0.03] transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedUnits.has(u.unitId)}
                    onChange={() => toggleUnit(u.unitId)}
                    className="accent-blue-500"
                  />
                  <span className="text-[12px] text-white">{u.label}</span>
                  {u.ownerName && <span className="text-[11px] text-slate-500 truncate">{u.ownerName}</span>}
                  {!u.phone && <span className="ml-auto text-[9px] text-amber-500/80 uppercase font-bold">sin tel.</span>}
                </label>
              ))}
            </div>
          )}

          {err && <p className="text-[11px] text-red-400">{err}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-white/[0.06]">
          <button
            onClick={() => void handleSubmit(false)}
            disabled={busy || !valid}
            className="flex-1 px-4 py-2 rounded-xl border border-surface-border bg-surface-card text-slate-300 hover:text-white hover:border-slate-500 text-[12px] font-medium transition-all disabled:opacity-50"
          >
            Guardar borrador
          </button>
          <button
            onClick={() => void handleSubmit(true)}
            disabled={busy || !valid}
            className="flex-1 px-4 py-2 rounded-xl bg-brand-primary hover:bg-blue-400 text-white text-[12px] font-semibold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Publicar ahora
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Recipients (send) Modal ───────────────────────────────────────────────────

function RecipientsModal({ announcement, onClose }: { announcement: Announcement; onClose: () => void }) {
  const { data: recipients = [], isLoading } = useAnnouncementRecipients(announcement.id);
  const markSent = useMarkRecipientSent();

  const withPhone    = recipients.filter((r) => r.whatsappUrl);
  const withoutPhone = recipients.filter((r) => !r.whatsappUrl);
  const sentCount    = recipients.filter((r) => r.sent).length;
  const progress     = recipients.length > 0 ? (sentCount / recipients.length) * 100 : 0;

  function handleSend(recipientId: string, whatsappUrl: string) {
    window.open(whatsappUrl, '_blank', 'noopener');
    void markSent.mutateAsync(recipientId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-[480px] bg-[#0e1425] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-bold text-[14px] truncate pr-3">{announcement.title}</h2>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors flex-shrink-0">
              <X size={15} />
            </button>
          </div>
          {/* Progress */}
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Enviados</span>
              <span className="text-slate-300 font-semibold tabular-nums">{sentCount} / {recipients.length}</span>
            </div>
            <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-8 flex justify-center">
              <Loader2 size={18} className="animate-spin text-slate-500" />
            </div>
          )}

          {withPhone.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-white truncate">{r.unitLabel ?? r.unitId}</p>
                <p className="text-[11px] text-slate-500 truncate">{r.ownerName ?? '—'} · {r.phone}</p>
              </div>
              {r.sent ? (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold flex-shrink-0">
                  <CheckCircle2 size={11} />
                  Enviado
                </span>
              ) : (
                <button
                  onClick={() => handleSend(r.id, r.whatsappUrl!)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 text-[10px] font-semibold transition-all flex-shrink-0"
                >
                  <MessageCircle size={11} />
                  WhatsApp
                </button>
              )}
            </div>
          ))}

          {withoutPhone.length > 0 && (
            <div className="px-4 py-3 bg-amber-950/20 border-t border-amber-700/20">
              <p className="text-[11px] text-amber-400/90 flex items-center gap-1.5">
                <AlertTriangle size={11} className="flex-shrink-0" />
                {withoutPhone.length} {withoutPhone.length === 1 ? 'unidad sin teléfono' : 'unidades sin teléfono'}: {withoutPhone.map((r) => r.unitLabel ?? r.unitId).join(', ')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Announcement Card ─────────────────────────────────────────────────────────

function AnnouncementCard({ a, onOpen, onPublish, onDelete }: {
  a:         Announcement;
  onOpen:    () => void;
  onPublish: () => void;
  onDelete:  () => void;
}) {
  const meta = AUDIENCE_META[a.audience];
  const isDraft  = a.status === 'borrador';
  const progress = a.recipientCount > 0 ? (a.sentCount / a.recipientCount) * 100 : 0;

  return (
    <div className="group flex items-start gap-3.5 p-4 rounded-2xl border border-surface-border bg-surface-card hover:border-slate-600 transition-all">
      <div className={clsx(
        'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
        isDraft ? 'bg-slate-500/10 text-slate-500' : 'bg-brand-primary/10 text-brand-primary',
      )}>
        {isDraft ? <FileText size={15} /> : <Megaphone size={15} />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[13px] font-semibold text-white truncate">{a.title}</h3>
          {isDraft && (
            <span className="px-1.5 py-0.5 rounded-md bg-slate-500/10 border border-slate-500/20 text-slate-400 text-[9px] font-bold uppercase tracking-wider">
              Borrador
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{a.body}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <meta.Icon size={10} />
            {meta.label}
          </span>
          <span className="text-[10px] text-slate-600">
            {format(a.createdAt, "d MMM yyyy", { locale: es })}
          </span>
          {!isDraft && a.recipientCount > 0 && (
            <span className={clsx(
              'text-[10px] font-semibold tabular-nums',
              a.sentCount === a.recipientCount ? 'text-emerald-400' : 'text-amber-400',
            )}>
              {a.sentCount}/{a.recipientCount} enviados
            </span>
          )}
        </div>
        {!isDraft && a.recipientCount > 0 && (
          <div className="h-1 bg-surface-hover rounded-full overflow-hidden mt-1.5 max-w-[180px]">
            <div
              className={clsx('h-full rounded-full transition-all', a.sentCount === a.recipientCount ? 'bg-emerald-500' : 'bg-amber-500')}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isDraft && (
          <>
            <button
              onClick={onPublish}
              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-primary/10 border border-brand-primary/25 text-brand-primary hover:bg-brand-primary/20 text-[10px] font-semibold transition-all"
            >
              <Send size={10} />
              Publicar
            </button>
            <button
              onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-600 hover:text-red-400 transition-all"
              title="Eliminar borrador"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
        {!isDraft && (
          <button
            onClick={onOpen}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-surface-border text-slate-400 hover:text-white hover:border-slate-500 text-[10px] font-semibold transition-all"
          >
            {a.sentCount < a.recipientCount ? 'Enviar' : 'Ver'}
            <ChevronRight size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ComunicadosPage() {
  const { data: announcements = [], isLoading } = useAnnouncements();
  const publish    = usePublishAnnouncement();
  const deleteAnn  = useDeleteAnnouncement();

  const [showComposer, setShowComposer] = useState(false);
  const [openedId,     setOpenedId]     = useState<string | null>(null);

  const opened = announcements.find((a) => a.id === openedId) ?? null;

  const published = announcements.filter((a) => a.status === 'publicado');
  const pendingSends = published.reduce((s, a) => s + (a.recipientCount - a.sentCount), 0);

  return (
    <div className="p-5 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-white font-bold text-[15px] tracking-tight">Comunicados</h1>
          <p className="text-slate-400 text-[12px] mt-0.5">Anuncios masivos por WhatsApp con segmentación</p>
        </div>
        <button
          onClick={() => setShowComposer(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-primary hover:bg-blue-400 text-white text-[12px] font-semibold transition-all shadow-lg shadow-blue-500/20 shrink-0"
        >
          <Plus size={13} />
          Nuevo comunicado
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-surface-border bg-surface-card">
          <div className="w-8 h-8 rounded-xl bg-brand-primary/15 flex items-center justify-center flex-shrink-0">
            <Megaphone size={15} className="text-brand-primary" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Publicados</p>
            <p className="text-[22px] font-bold text-white tabular-nums leading-tight">{published.length}</p>
          </div>
        </div>
        <div className={clsx(
          'flex items-center gap-3 p-4 rounded-2xl border bg-surface-card',
          pendingSends > 0 ? 'border-amber-500/20' : 'border-surface-border',
        )}>
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <Send size={15} className="text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Envíos pendientes</p>
            <p className={clsx('text-[22px] font-bold tabular-nums leading-tight', pendingSends > 0 ? 'text-amber-300' : 'text-white')}>
              {pendingSends}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-surface-border bg-surface-card">
          <div className="w-8 h-8 rounded-xl bg-slate-500/15 flex items-center justify-center flex-shrink-0">
            <FileText size={15} className="text-slate-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Borradores</p>
            <p className="text-[22px] font-bold text-white tabular-nums leading-tight">
              {announcements.length - published.length}
            </p>
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading && (
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-surface-card border border-surface-border" />
          ))}
        </div>
      )}

      {!isLoading && announcements.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-surface-border rounded-2xl">
          <Megaphone size={32} className="text-slate-600 mb-3" />
          <p className="text-[13px] font-semibold text-slate-400">Aún no hay comunicados</p>
          <p className="text-[11px] text-slate-500 mt-1 mb-4">
            Envía anuncios a todo el conjunto, solo a morosos o a unidades específicas — directo al WhatsApp de cada residente.
          </p>
          <button
            onClick={() => setShowComposer(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-primary hover:bg-blue-400 text-white text-[12px] font-semibold transition-all"
          >
            <Plus size={13} />
            Crear el primero
          </button>
        </div>
      )}

      {!isLoading && announcements.length > 0 && (
        <div className="space-y-3">
          {announcements.map((a) => (
            <AnnouncementCard
              key={a.id}
              a={a}
              onOpen={() => setOpenedId(a.id)}
              onPublish={() => {
                void publish.mutateAsync(a.id).then(() => setOpenedId(a.id));
              }}
              onDelete={() => void deleteAnn.mutateAsync(a.id)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showComposer && <ComposerModal onClose={() => setShowComposer(false)} />}
      {opened && <RecipientsModal announcement={opened} onClose={() => setOpenedId(null)} />}
    </div>
  );
}
