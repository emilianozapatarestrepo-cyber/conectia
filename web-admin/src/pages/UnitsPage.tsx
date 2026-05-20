import { useState } from 'react';
import { useUnits, useCreateUnit, useUpdateUnit, useDeleteUnit, type Unit, type UnitInput } from '@/hooks/useUnits';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { formatCOP } from '@/lib/formatters';

// ── Unit form modal ───────────────────────────────────────────────────────────

interface UnitModalProps {
  initial?: Unit;
  onClose:  () => void;
  onSave:   (data: UnitInput) => Promise<void>;
}

function UnitModal({ initial, onClose, onSave }: UnitModalProps) {
  const [form, setForm] = useState<UnitInput>({
    unitId:    initial?.unitId    ?? '',
    label:     initial?.label     ?? '',
    ownerName: initial?.ownerName ?? null,
    phone:     initial?.phone     ?? null,
    email:     initial?.email     ?? null,
    feeAmount: initial ? Number(initial.feeAmount) : 0,
  });
  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState<string | null>(null);

  const field = (key: keyof UnitInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value || null }));

  const handleSave = async () => {
    if (!form.unitId.trim() || !form.label.trim()) {
      setError('ID de unidad y nombre son obligatorios');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...form, feeAmount: form.feeAmount || 0 });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-card border border-surface-border rounded-xl w-full max-w-sm p-5 space-y-4">
        <h2 className="text-white font-semibold text-sm">
          {initial ? 'Editar unidad' : 'Nueva unidad'}
        </h2>

        {error && (
          <p className="text-red-400 text-[11px] bg-red-900/20 rounded px-3 py-2">{error}</p>
        )}

        <div className="space-y-3">
          <Field label="ID de unidad *" placeholder="A-101, Torre B Apto 302…"
            value={form.unitId}
            onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}
            disabled={!!initial}
          />
          <Field label="Nombre para mostrar *" placeholder="Apto 101 Torre A"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
          <Field label="Propietario" placeholder="Juan Ramírez"
            value={form.ownerName ?? ''}
            onChange={field('ownerName')}
          />
          <Field label="Teléfono WhatsApp" placeholder="3001234567"
            value={form.phone ?? ''}
            onChange={field('phone')}
            type="tel"
          />
          <Field label="Email" placeholder="juan@email.com"
            value={form.email ?? ''}
            onChange={field('email')}
            type="email"
          />
          <div>
            <label className="text-slate-400 text-[11px] block mb-1">Cuota mensual (pesos COP)</label>
            <input
              type="number"
              min={0}
              value={form.feeAmount / 100}
              onChange={(e) => setForm((f) => ({
                ...f,
                feeAmount: Math.round(Number(e.target.value) * 100),
              }))}
              className="w-full bg-surface-hover border border-surface-border text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              placeholder="450000"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-surface-border text-slate-400 hover:text-white text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-slate-400 text-[11px] block mb-1">{label}</label>
      <input
        {...props}
        className="w-full bg-surface-hover border border-surface-border text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-primary placeholder:text-slate-600"
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UnitsPage() {
  const { data: units = [], isLoading } = useUnits();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();
  const deleteUnit = useDeleteUnit();

  const [modal, setModal]     = useState<'new' | Unit | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const totalFee = units.reduce((s, u) => s + u.feeAmount, 0n);

  const COLUMNS: Column<Unit>[] = [
    { key: 'unitId',    header: 'ID',           render: (r) => <span className="font-mono text-slate-300 text-[11px]">{r.unitId}</span> },
    { key: 'label',     header: 'Nombre',        render: (r) => <span className="font-medium text-white">{r.label}</span> },
    { key: 'owner',     header: 'Propietario',   render: (r) => r.ownerName ?? <span className="text-slate-500">—</span> },
    {
      key: 'phone',
      header: 'WhatsApp',
      render: (r) => r.phone
        ? (
          <a
            href={`https://wa.me/57${r.phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-status-green text-[11px] flex items-center gap-1 hover:underline"
          >
            <WhatsAppIcon />
            {r.phone}
          </a>
        )
        : <span className="text-slate-500 text-[11px]">Sin teléfono</span>,
    },
    {
      key: 'fee',
      header: 'Cuota',
      align: 'right',
      render: (r) => (
        <span className={r.feeAmount > 0n ? 'text-white tabular-nums' : 'text-slate-500'}>
          {r.feeAmount > 0n ? formatCOP(r.feeAmount) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'center',
      render: (r) => (
        <div className="flex items-center gap-1 justify-center">
          <button
            onClick={() => setModal(r)}
            className="p-1.5 rounded hover:bg-surface-hover text-slate-400 hover:text-white transition-colors"
            title="Editar"
          >
            <PencilIcon />
          </button>
          <button
            onClick={() => setDeleting(r.id)}
            className="p-1.5 rounded hover:bg-red-900/30 text-slate-500 hover:text-red-400 transition-colors"
            title="Eliminar"
          >
            <TrashIcon />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-base">Unidades</h1>
          <p className="text-slate-400 text-[11px] mt-0.5">
            {units.length} unidades · Cuota total {formatCOP(totalFee)}/mes
          </p>
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary hover:bg-brand-primary/90 text-white text-[12px] font-semibold rounded-md transition-colors"
        >
          <span className="text-base leading-none">+</span>
          Nueva unidad
        </button>
      </div>

      {/* Warning if units have no phone */}
      {units.length > 0 && units.filter((u) => !u.phone).length > 0 && (
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg px-3 py-2 flex items-center gap-2">
          <span className="text-amber-400 text-sm">⚠</span>
          <p className="text-amber-300 text-[11px]">
            {units.filter((u) => !u.phone).length} unidades sin teléfono — no recibirán notificaciones de WhatsApp
          </p>
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        data={units}
        keyFn={(r) => r.id}
        loading={isLoading}
        emptyMessage="Sin unidades registradas. Agrega la primera unidad para comenzar."
      />

      {/* Modals */}
      {modal === 'new' && (
        <UnitModal
          onClose={() => setModal(null)}
          onSave={(data) => createUnit.mutateAsync(data).then(() => {})}
        />
      )}
      {modal && modal !== 'new' && (
        <UnitModal
          initial={modal}
          onClose={() => setModal(null)}
          onSave={(data) => updateUnit.mutateAsync({ id: (modal as Unit).id, ...data }).then(() => {})}
        />
      )}

      {/* Delete confirm */}
      {deleting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleting(null); }}
        >
          <div className="bg-surface-card border border-surface-border rounded-xl w-full max-w-xs p-5 space-y-4">
            <p className="text-white text-sm font-semibold">¿Eliminar esta unidad?</p>
            <p className="text-slate-400 text-[12px]">La unidad quedará inactiva. El historial de cargos se conserva.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleting(null)}
                className="flex-1 py-2 rounded-lg border border-surface-border text-slate-400 text-sm">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await deleteUnit.mutateAsync(deleting);
                  setDeleting(null);
                }}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
