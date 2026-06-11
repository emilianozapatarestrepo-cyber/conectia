import { useState } from 'react';
import { X, Zap, CheckCircle, AlertTriangle, Users } from 'lucide-react';
import { usePeriods, useCreatePeriod } from '@/hooks/usePeriods';
import { useUnits } from '@/hooks/useUnits';
import { useBatchCharges } from '@/hooks/useCharges';
import { formatCOP } from '@/lib/formatters';
import { clsx } from 'clsx';
import type { Period } from '@/hooks/usePeriods';

interface Props {
  onClose:   () => void;
  onSuccess: (period: string) => void;
}

type Step = 'configure' | 'result';

const MONTHS_ES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function defaultDueDate(year: number, month: number): string {
  return new Date(year, month, 5).toISOString().slice(0, 10);
}

function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={clsx('w-1.5 h-1.5 rounded-full transition-all', step === 'configure' ? 'bg-brand-primary' : 'bg-slate-600')} />
      <div className="w-4 h-px bg-surface-border" />
      <div className={clsx('w-1.5 h-1.5 rounded-full transition-all', step === 'result' ? 'bg-brand-primary' : 'bg-slate-600')} />
    </div>
  );
}

export function CobrarMesModal({ onClose, onSuccess }: Props) {
  const { data: periods = [] }  = usePeriods();
  const { data: units   = [] }  = useUnits();
  const createPeriod            = useCreatePeriod();
  const batchCharges            = useBatchCharges();

  const now = new Date();
  const cy  = now.getFullYear();
  const cm  = now.getMonth() + 1;

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(periods[0]?.id ?? '__new__');
  const [newYear,  setNewYear]  = useState(cy);
  const [newMonth, setNewMonth] = useState(cm);
  const [dueDate,  setDueDate]  = useState(defaultDueDate(cy, cm));

  const isNewPeriod     = selectedPeriodId === '__new__' || periods.length === 0;
  const selectedPeriod: Period | undefined = periods.find((p) => p.id === selectedPeriodId);

  const periodLabel = isNewPeriod
    ? `${MONTHS_ES[newMonth]} ${newYear}`
    : (selectedPeriod?.label ?? '');

  const [concept, setConcept] = useState(`Cuota ordinaria ${periodLabel}`);

  const [step,   setStep]   = useState<Step>('configure');
  const [result, setResult] = useState<{ created: number; failed: number; total: number } | null>(null);

  const activeUnits    = units.filter((u) => u.active);
  const totalFeeAmount = activeUnits.reduce((s, u) => s + (u.feeAmount ?? 0n), 0n);
  const isPending      = createPeriod.isPending || batchCharges.isPending;

  function handlePeriodChange(id: string) {
    setSelectedPeriodId(id);
    const p = periods.find((x) => x.id === id);
    if (p) setConcept(`Cuota ordinaria ${p.label}`);
  }

  function handleNewPeriodMonth(m: number) {
    setNewMonth(m);
    setDueDate(defaultDueDate(newYear, m));
    setConcept(`Cuota ordinaria ${MONTHS_ES[m]} ${newYear}`);
  }

  function handleNewPeriodYear(y: number) {
    setNewYear(y);
    setDueDate(defaultDueDate(y, newMonth));
    setConcept(`Cuota ordinaria ${MONTHS_ES[newMonth]} ${y}`);
  }

  async function execute() {
    let periodId: string | null;
    let resolvedDueDate: string;

    if (isNewPeriod) {
      const p = await createPeriod.mutateAsync({ year: newYear, month: newMonth, dueDate });
      periodId = p.id;
      resolvedDueDate = p.dueDate;
    } else {
      periodId = selectedPeriodId;
      resolvedDueDate = selectedPeriod?.dueDate ?? dueDate;
    }

    const res = await batchCharges.mutateAsync({
      useRoster: true,
      concept,
      dueDate: resolvedDueDate,
      periodId,
    });

    setResult(res);
    setStep('result');
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
            <div className="w-8 h-8 rounded-xl bg-brand-primary/15 flex items-center justify-center">
              <Zap size={15} className="text-brand-primary" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-[13px]">Cobrar mes</h2>
              <p className="text-slate-500 text-[11px]">Cobros masivos desde el roster</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StepDots step={step} />
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-surface-hover transition-all"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Step 1: Configure ───────────────────────────────────────── */}
        {step === 'configure' && (
          <div className="p-5 space-y-4">

            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Período</label>
              <select
                value={selectedPeriodId}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="w-full bg-surface-hover border border-surface-border text-white text-[13px] rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-brand-primary/60 hover:border-slate-500 transition-colors"
              >
                <option value="__new__">+ Crear nuevo período</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            {isNewPeriod && (
              <div className="bg-surface-hover/60 border border-surface-border rounded-xl p-3.5 space-y-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Nuevo período</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500">Mes</label>
                    <select
                      value={newMonth}
                      onChange={(e) => handleNewPeriodMonth(Number(e.target.value))}
                      className="w-full bg-surface-card border border-surface-border text-white text-[13px] rounded-lg px-2.5 py-2 focus:outline-none"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{MONTHS_ES[i + 1]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500">Año</label>
                    <select
                      value={newYear}
                      onChange={(e) => handleNewPeriodYear(Number(e.target.value))}
                      className="w-full bg-surface-card border border-surface-border text-white text-[13px] rounded-lg px-2.5 py-2 focus:outline-none"
                    >
                      {[cy - 1, cy, cy + 1].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">Fecha de vencimiento</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-surface-card border border-surface-border text-white text-[13px] rounded-lg px-3 py-2 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Concepto</label>
              <input
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                className="w-full bg-surface-hover border border-surface-border text-white text-[13px] rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-brand-primary/60 hover:border-slate-500 transition-colors"
                placeholder="Cuota ordinaria"
              />
            </div>

            {/* Preview */}
            <div className="bg-surface-hover/60 border border-surface-border rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-300">
                <Users size={13} className="text-slate-400" />
                <span className="text-[13px]">
                  <strong className="text-white">{activeUnits.length}</strong> unidades a cobrar
                </span>
              </div>
              <div className="text-right">
                <p className="text-white font-bold tabular-nums text-[14px]">{formatCOP(totalFeeAmount)}</p>
                <p className="text-slate-500 text-[10px]">total esperado</p>
              </div>
            </div>

            {(createPeriod.isError || batchCharges.isError) && (
              <div className="flex items-center gap-2 text-red-400 text-[11px] bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2.5">
                <AlertTriangle size={12} />
                {(createPeriod.error as Error)?.message ?? (batchCharges.error as Error)?.message ?? 'Error al cobrar'}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-surface-border text-slate-400 hover:text-white hover:border-slate-500 text-[13px] font-medium transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => void execute()}
                disabled={isPending || activeUnits.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-brand-primary hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition-all shadow-lg shadow-indigo-500/20"
              >
                {isPending ? 'Generando cobros…' : `Cobrar ${activeUnits.length} unidades`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Result ──────────────────────────────────────────── */}
        {step === 'result' && result && (
          <div className="p-5 space-y-5">
            <div className="text-center py-3">
              <div className={clsx(
                'w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4',
                result.failed === 0 ? 'bg-emerald-500/15' : 'bg-amber-500/15',
              )}>
                {result.failed === 0
                  ? <CheckCircle size={28} className="text-emerald-400" />
                  : <AlertTriangle size={28} className="text-amber-400" />
                }
              </div>
              <h3 className="text-white font-bold text-[15px]">
                {result.created === 0
                  ? 'Sin cobros nuevos'
                  : `${result.created} cobro${result.created !== 1 ? 's' : ''} generado${result.created !== 1 ? 's' : ''}`
                }
              </h3>
              {result.failed > 0 && (
                <p className="text-amber-400 text-[12px] mt-1.5">
                  {result.failed} {result.failed === 1 ? 'unidad omitida' : 'unidades omitidas'} — sin cuota configurada
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {([
                { label: 'Creados',  value: result.created, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { label: 'Omitidos', value: result.failed,  color: 'text-amber-400',   bg: 'bg-amber-500/10'  },
                { label: 'Total',    value: result.total,   color: 'text-white',        bg: 'bg-surface-hover' },
              ] as const).map(({ label, value, color, bg }) => (
                <div key={label} className={clsx('rounded-xl p-3 text-center border border-surface-border', bg)}>
                  <p className={clsx('text-2xl font-bold tabular-nums', color)}>{value}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                const ym = isNewPeriod
                  ? `${newYear}-${String(newMonth).padStart(2, '0')}`
                  : (selectedPeriod
                    ? `${selectedPeriod.year}-${String(selectedPeriod.month).padStart(2, '0')}`
                    : '');
                onSuccess(ym);
              }}
              className="w-full py-2.5 rounded-xl bg-brand-primary hover:bg-indigo-400 text-white text-[13px] font-semibold transition-all shadow-lg shadow-indigo-500/20"
            >
              Ver cobros generados →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
