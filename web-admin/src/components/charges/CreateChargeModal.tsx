import { useState, useEffect, useRef } from 'react';
import { X, Plus, AlertTriangle, Sparkles } from 'lucide-react';
import { useUnits } from '@/hooks/useUnits';
import { usePeriods } from '@/hooks/usePeriods';
import { useCreateCharge } from '@/hooks/useCharges';
import { useAuthStore } from '@/store/auth.store';
import { formatCOP } from '@/lib/formatters';

interface Props {
  onClose:             () => void;
  onSuccess:           () => void;
  preselectedUnitId?:  string;
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}

// amounts are always stored as centavos COP in the DB
function centavosToPesos(centavos: bigint): string {
  return String(Number(centavos) / 100);
}
function pesosToCentavos(pesos: string): number {
  return Math.round(Number(pesos) * 100);
}

export function CreateChargeModal({ onClose, onSuccess, preselectedUnitId }: Props) {
  const { data: units   = [] } = useUnits();
  const { data: periods = [] } = usePeriods();
  const createCharge           = useCreateCharge();
  const { user }               = useAuthStore();

  const [unitId,    setUnitId]    = useState(preselectedUnitId ?? '');
  const [amtPesos,  setAmtPesos]  = useState('');
  const [concept,   setConcept]   = useState('');
  const [dueDate,   setDueDate]   = useState(defaultDueDate());
  const [periodId,  setPeriodId]  = useState('');

  const selectedUnit = units.find((u) => u.id === unitId);

  // Auto-select first active unit when units load (if none preselected)
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (didAutoSelect.current || unitId || units.length === 0) return;
    const first = units.find((u) => u.active);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (first) setUnitId(first.id);
    didAutoSelect.current = true;
  }, [units, unitId]);

  // Pre-fill amount when selected unit changes (reset to unit's fee)
  const lastFilledUnitId = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedUnit || lastFilledUnitId.current === selectedUnit.id) return;
    lastFilledUnitId.current = selectedUnit.id;
    setAmtPesos(centavosToPesos(selectedUnit.feeAmount));
  }, [selectedUnit]);

  function handleUnitChange(id: string) {
    setUnitId(id);
    // Reset the tracker so the amount effect fires for the new unit
    lastFilledUnitId.current = null;
  }

  function fillBaseFee() {
    if (selectedUnit) setAmtPesos(centavosToPesos(selectedUnit.feeAmount));
  }

  const amtNum  = Number(amtPesos);
  const preview = amtNum > 0 ? formatCOP(BigInt(pesosToCentavos(amtPesos))) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUnit || !user || !amtNum || amtNum <= 0) return;

    await createCharge.mutateAsync({
      unitId:    selectedUnit.id,
      unitLabel: selectedUnit.label,
      ownerName: selectedUnit.ownerName,
      userId:    user.uid,
      amount:    pesosToCentavos(amtPesos),
      concept,
      dueDate,
      periodId:  periodId || null,
    });
    onSuccess();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-2xl shadow-black/40">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-surface-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <Plus size={15} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-[13px]">Nuevo cargo</h2>
              <p className="text-slate-500 text-[11px]">Cargo individual para una unidad</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-surface-hover transition-all"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="p-5 space-y-4">

          {/* Unit selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
              Unidad
            </label>
            <select
              value={unitId}
              onChange={(e) => handleUnitChange(e.target.value)}
              required
              className="w-full bg-surface-hover border border-surface-border text-white text-[13px] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-brand-primary/60 hover:border-slate-500 transition-colors"
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
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
              Monto <span className="normal-case tracking-normal font-normal">(pesos colombianos)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[13px] font-medium pointer-events-none select-none">
                $
              </span>
              <input
                type="number"
                min="100"
                step="100"
                value={amtPesos}
                onChange={(e) => setAmtPesos(e.target.value)}
                required
                placeholder="150000"
                className="w-full pl-7 pr-28 bg-surface-hover border border-surface-border text-white text-[13px] rounded-xl py-2.5 focus:outline-none focus:ring-1 focus:ring-brand-primary/60 tabular-nums hover:border-slate-500 transition-colors"
              />
              {selectedUnit && (
                <button
                  type="button"
                  onClick={fillBaseFee}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-primary/15 text-brand-primary text-[10px] font-semibold hover:bg-brand-primary/25 transition-colors"
                >
                  <Sparkles size={9} />
                  Usar cuota
                </button>
              )}
            </div>
            {preview && (
              <p className="text-[11px] text-emerald-400 font-medium">{preview}</p>
            )}
          </div>

          {/* Concept */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
              Concepto
            </label>
            <input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              required
              placeholder="Ej. Cuota extraordinaria obras ascensor"
              className="w-full bg-surface-hover border border-surface-border text-white text-[13px] rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-brand-primary/60 hover:border-slate-500 transition-colors placeholder:text-slate-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Due date */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
                Vencimiento
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full bg-surface-hover border border-surface-border text-white text-[13px] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-brand-primary/60 hover:border-slate-500 transition-colors"
              />
            </div>

            {/* Period (optional) */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
                Período <span className="normal-case font-normal text-slate-600">(opc.)</span>
              </label>
              <select
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
                className="w-full bg-surface-hover border border-surface-border text-white text-[13px] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-brand-primary/60 hover:border-slate-500 transition-colors"
              >
                <option value="">Sin período</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Error */}
          {createCharge.isError && (
            <div className="flex items-center gap-2 text-red-400 text-[11px] bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2.5">
              <AlertTriangle size={12} />
              {(createCharge.error as Error)?.message ?? 'Error al crear cargo'}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-surface-border text-slate-400 hover:text-white hover:border-slate-500 text-[13px] font-medium transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createCharge.isPending || !unitId || !concept || !amtPesos}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition-all shadow-lg shadow-emerald-900/30"
            >
              {createCharge.isPending ? 'Creando…' : 'Crear cargo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
