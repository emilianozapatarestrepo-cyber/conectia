import { useState } from 'react';
import { X, Plus, AlertTriangle } from 'lucide-react';
import { useUnits } from '@/hooks/useUnits';
import { usePeriods } from '@/hooks/usePeriods';
import { useCreateCharge } from '@/hooks/useCharges';
import { useAuthStore } from '@/store/auth.store';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  preselectedUnitId?: string;
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}

export function CreateChargeModal({ onClose, onSuccess, preselectedUnitId }: Props) {
  const { data: units = [] }   = useUnits();
  const { data: periods = [] } = usePeriods();
  const createCharge           = useCreateCharge();
  const { user }               = useAuthStore();

  const [unitId,   setUnitId]   = useState(preselectedUnitId ?? (units[0]?.id ?? ''));
  const [amount,   setAmount]   = useState('');
  const [concept,  setConcept]  = useState('');
  const [dueDate,  setDueDate]  = useState(defaultDueDate());
  const [periodId, setPeriodId] = useState<string>('');

  const selectedUnit = units.find((u) => u.id === unitId);

  function handleUnitChange(id: string) {
    setUnitId(id);
    const u = units.find((x) => x.id === id);
    if (u && !amount) setAmount(String(u.feeAmount));
  }

  // Pre-populate amount when units load and none set yet
  if (selectedUnit && !amount) {
    setAmount(String(selectedUnit.feeAmount));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUnit || !user) return;

    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) return;

    await createCharge.mutateAsync({
      unitId:    selectedUnit.id,
      unitLabel: selectedUnit.label,
      ownerName: selectedUnit.ownerName,
      userId:    user.uid,
      amount:    amountNum,
      concept,
      dueDate,
      periodId:  periodId || null,
    });
    onSuccess();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-surface-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <Plus size={14} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">Nuevo cargo</h2>
              <p className="text-slate-400 text-[10px]">Cargo individual para una unidad</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="p-5 space-y-4">
          {/* Unit */}
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-2">Unidad</label>
            <select
              value={unitId}
              onChange={(e) => handleUnitChange(e.target.value)}
              required
              className="w-full bg-surface-hover border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <option value="">Seleccionar unidad…</option>
              {units.filter((u) => u.active).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}{u.ownerName ? ` — ${u.ownerName}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-2">Monto (COP)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="0"
              className="w-full bg-surface-hover border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-primary tabular-nums"
            />
          </div>

          {/* Concept */}
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-2">Concepto</label>
            <input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              required
              placeholder="Ej. Cuota extraordinaria obras"
              className="w-full bg-surface-hover border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Due date */}
            <div>
              <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-2">Vencimiento</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full bg-surface-hover border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            {/* Period (optional) */}
            <div>
              <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-2">
                Período <span className="normal-case text-slate-500">(opcional)</span>
              </label>
              <select
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
                className="w-full bg-surface-hover border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              >
                <option value="">Sin período</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {createCharge.isError && (
            <div className="flex items-center gap-2 text-red-400 text-[11px] bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
              <AlertTriangle size={12} />
              {(createCharge.error as Error)?.message ?? 'Error al crear cargo'}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-surface-border text-slate-400 hover:text-white text-sm transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createCharge.isPending || !unitId || !concept}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {createCharge.isPending ? 'Creando…' : 'Crear cargo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
