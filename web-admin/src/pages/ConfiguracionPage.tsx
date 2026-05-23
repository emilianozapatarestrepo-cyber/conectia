import { useState } from 'react';
import { useBilling, usePlans } from '@/hooks/useBilling';
import { useTenantProfile, useUpdateTenantProfile } from '@/hooks/useTenantProfile';
import { CheckCircle, Clock, AlertTriangle, Zap, Building2, Shield, Pencil, X, Check } from 'lucide-react';

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  trialing:        { label: 'Trial activo',       color: 'text-amber-400',   bg: 'bg-amber-900/20 border-amber-700/30',  icon: Clock },
  active:          { label: 'Activo',             color: 'text-emerald-400', bg: 'bg-emerald-900/20 border-emerald-700/30', icon: CheckCircle },
  past_due:        { label: 'Pago pendiente',     color: 'text-orange-400',  bg: 'bg-orange-900/20 border-orange-700/30', icon: AlertTriangle },
  cancelled:       { label: 'Cancelado',          color: 'text-slate-400',   bg: 'bg-surface-hover border-surface-border', icon: AlertTriangle },
  expired:         { label: 'Vencido',            color: 'text-red-400',     bg: 'bg-red-900/20 border-red-700/30',     icon: AlertTriangle },
  no_subscription: { label: 'Sin suscripción',    color: 'text-slate-400',   bg: 'bg-surface-hover border-surface-border', icon: Clock },
} as const;

const PLAN_ICONS: Record<string, typeof Building2> = {
  trial:      Clock,
  starter:    Building2,
  pro:        Zap,
  enterprise: Shield,
};

const FEATURE_LABELS: Record<string, string> = {
  whatsapp: 'Notificaciones WhatsApp',
  export:   'Export Excel / PDF',
  assembly: 'Modo Asamblea TV',
  api:      'Acceso API REST',
  sla:      'SLA + Soporte dedicado',
};

function formatTrialDays(daysRemaining: number | undefined): string {
  if (daysRemaining === undefined) return '';
  if (daysRemaining <= 0) return 'Trial vencido';
  if (daysRemaining === 1) return '1 día restante';
  return `${daysRemaining} días restantes`;
}

function formatPrice(cents: bigint): string {
  if (cents === 0n) return 'Gratis';
  const pesos = Number(cents) / 100;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(pesos);
}

// ── Building profile card ─────────────────────────────────────────────────────

function BuildingProfileCard() {
  const { data: profile, isLoading } = useTenantProfile();
  const update = useUpdateTenantProfile();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', taxId: '' });

  function startEdit() {
    setForm({
      name:    profile?.name    ?? '',
      address: profile?.address ?? '',
      taxId:   profile?.taxId   ?? '',
    });
    setEditing(true);
  }

  async function save() {
    await update.mutateAsync({
      name:    form.name    || undefined,
      address: form.address || null,
      taxId:   form.taxId   || null,
    });
    setEditing(false);
  }

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-slate-400 text-[10px] uppercase tracking-widest">Perfil del conjunto</p>
        {!editing ? (
          <button onClick={startEdit}
            className="flex items-center gap-1 text-slate-400 hover:text-white text-[11px] transition-colors">
            <Pencil size={11} /> Editar
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(false)}
              className="flex items-center gap-1 text-slate-400 hover:text-white text-[11px]">
              <X size={11} /> Cancelar
            </button>
            <button onClick={save} disabled={update.isPending}
              className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-[11px] font-semibold">
              <Check size={11} /> {update.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-surface-hover rounded animate-pulse" />
          ))}
        </div>
      ) : editing ? (
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Nombre del conjunto</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-surface-hover border border-surface-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-primary/50"
              placeholder="Torres del Parque"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Dirección</label>
            <input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full bg-surface-hover border border-surface-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-primary/50"
              placeholder="Cra 15 #93-40, Bogotá"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">NIT</label>
            <input
              value={form.taxId}
              onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
              className="w-full bg-surface-hover border border-surface-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-primary/50"
              placeholder="900.123.456-7"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface-hover rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-slate-400 mb-0.5">Nombre</p>
            <p className="text-white font-semibold text-sm truncate">{profile?.name ?? '—'}</p>
          </div>
          <div className="bg-surface-hover rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-slate-400 mb-0.5">Dirección</p>
            <p className="text-white text-sm truncate">{profile?.address ?? '—'}</p>
          </div>
          <div className="bg-surface-hover rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-slate-400 mb-0.5">NIT</p>
            <p className="text-white text-sm">{profile?.taxId ?? '—'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const { data: billing, isLoading: billingLoading } = useBilling();
  const { data: plans = [] } = usePlans();

  const statusCfg = billing ? STATUS_CONFIG[billing.status] : STATUS_CONFIG['no_subscription'];
  const StatusIcon = statusCfg.icon;

  const contactUrl = `https://wa.me/573001234567?text=${encodeURIComponent(
    `Hola, quiero activar el plan Pro de Conectia para mi conjunto. ¿Cómo procedo?`
  )}`;

  return (
    <div className="p-5 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-white font-bold text-base">Configuración</h1>
        <p className="text-slate-400 text-[11px] mt-0.5">Plan, suscripción y facturación</p>
      </div>

      {/* Current plan card */}
      <div className="bg-surface-card border border-surface-border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">Plan actual</p>
            {billingLoading ? (
              <div className="h-6 w-32 bg-surface-hover animate-pulse rounded" />
            ) : (
              <p className="text-white font-bold text-xl">{billing?.planName ?? 'Sin plan'}</p>
            )}
          </div>
          {billing && (
            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.color}`}>
              <StatusIcon size={12} />
              {statusCfg.label}
            </span>
          )}
        </div>

        {billing && (
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="bg-surface-hover rounded-lg px-3 py-2.5">
              <p className="text-[10px] text-slate-400 mb-0.5">Precio mensual</p>
              <p className="text-white font-semibold text-sm">
                {billing.status === 'no_subscription' ? '—' : formatPrice(billing.monthlyPriceCents)}
              </p>
            </div>
            <div className="bg-surface-hover rounded-lg px-3 py-2.5">
              <p className="text-[10px] text-slate-400 mb-0.5">Límite de unidades</p>
              <p className="text-white font-semibold text-sm">
                {billing.maxUnits ? `${billing.maxUnits} unidades` : 'Ilimitadas'}
              </p>
            </div>
            <div className="bg-surface-hover rounded-lg px-3 py-2.5">
              <p className="text-[10px] text-slate-400 mb-0.5">
                {billing.isTrialing ? 'Trial vence' : 'Próximo pago'}
              </p>
              <p className={`font-semibold text-sm ${(billing.daysRemaining ?? 30) <= 7 ? 'text-amber-400' : 'text-white'}`}>
                {billing.isTrialing
                  ? formatTrialDays(billing.daysRemaining)
                  : billing.currentPeriodEnd
                    ? billing.currentPeriodEnd.toLocaleDateString('es-CO')
                    : '—'}
              </p>
            </div>
          </div>
        )}

        {billing?.features && Object.keys(billing.features).length > 0 && (
          <div className="pt-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Incluye</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(billing.features).map(([key, enabled]) =>
                enabled ? (
                  <span key={key}
                    className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-900/15 border border-emerald-700/20 rounded-full px-2 py-1">
                    <CheckCircle size={9} />
                    {FEATURE_LABELS[key] ?? key}
                  </span>
                ) : null
              )}
            </div>
          </div>
        )}
      </div>

      {/* Building profile */}
      <BuildingProfileCard />

      {/* Trial warning */}
      {billing?.isTrialing && (billing.daysRemaining ?? 30) <= 7 && (
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 text-sm font-semibold">Tu trial vence pronto</p>
            <p className="text-amber-400/70 text-[11px] mt-0.5">
              Te quedan {billing.daysRemaining} día{billing.daysRemaining !== 1 ? 's' : ''} de acceso completo. Activa un plan para continuar sin interrupciones.
            </p>
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div>
        <p className="text-slate-400 text-[10px] uppercase tracking-widest mb-3">Planes disponibles</p>
        <div className="grid grid-cols-3 gap-3">
          {plans.filter((p) => p.code !== 'trial').map((plan) => {
            const PlanIcon = PLAN_ICONS[plan.code] ?? Building2;
            const isCurrent = billing?.planCode === plan.code;
            return (
              <div key={plan.code}
                className={`rounded-xl border p-4 space-y-3 ${
                  isCurrent
                    ? 'border-brand-primary/50 bg-brand-primary/5'
                    : 'border-surface-border bg-surface-card hover:border-slate-600 transition-colors'
                }`}>
                <div className="flex items-center justify-between">
                  <PlanIcon size={16} className={isCurrent ? 'text-brand-primary' : 'text-slate-400'} />
                  {isCurrent && (
                    <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest">
                      Actual
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{plan.name}</p>
                  <p className="text-slate-400 text-[10px] mt-0.5">
                    {plan.maxUnits ? `Hasta ${plan.maxUnits} unidades` : 'Unidades ilimitadas'}
                  </p>
                </div>
                <p className="text-white font-bold text-lg tabular-nums">
                  {formatPrice(plan.monthlyPriceCents)}
                  <span className="text-slate-500 text-[11px] font-normal">/mes</span>
                </p>
                <div className="space-y-1">
                  {Object.entries(plan.features as Record<string, boolean>).map(([key, val]) => (
                    <p key={key} className={`text-[10px] flex items-center gap-1.5 ${val ? 'text-slate-300' : 'text-slate-600 line-through'}`}>
                      <CheckCircle size={9} className={val ? 'text-emerald-400' : 'text-slate-600'} />
                      {FEATURE_LABELS[key] ?? key}
                    </p>
                  ))}
                </div>
                {!isCurrent && (
                  <a
                    href={contactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-full py-2 rounded-lg bg-brand-primary/10 hover:bg-brand-primary/20 border border-brand-primary/30 text-brand-primary text-[11px] font-semibold transition-colors"
                  >
                    Activar plan
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Contact note */}
      <p className="text-slate-600 text-[11px] text-center">
        Para activar o cambiar de plan escribe a{' '}
        <a href={contactUrl} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">
          soporte@conectia.co
        </a>
        {' '}· Procesamos la activación en menos de 24 horas
      </p>
    </div>
  );
}
