import { useState } from 'react';
import { X, Zap, CheckCircle, AlertTriangle, Users } from 'lucide-react';
import { usePeriods, useCreatePeriod } from '@/hooks/usePeriods';
import { useUnits } from '@/hooks/useUnits';
import { useBatchCharges } from '@/hooks/useCharges';
import { formatCOP } from '@/lib/formatters';
import type { Period } from '@/hooks/usePeriods';

interface Props {
  onClose: () => void;
  onSuccess: (period: string) => void;
}

type Step = 'configure' | 'result';

const MONTHS_ES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function defaultDueDate(year: number, month: number): string {
  return new Date(year, month, 5).toISOString().slice(0, 10);
}

export function CobrarMesModal({ onClose, onSuccess }: Props) {
  const { data: periods = [] }  = usePeriods();
  const { data: units = [] }    = useUnits();
  const createPeriod            = useCreatePeriod();
  const batchCharges            = useBatchCharges();

  const now   = new Date();
  const cy    = now.getFullYear();
  const cm    = now.getMonth() + 1;

  // Period selection
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(periods[0]?.id ?? '__new__');
  const [newYear,  setNewYear]  = useState(cy);
  const [newMonth, setNewMonth] = useState(cm);
  const [dueDate,  setDueDate]  = useState(defaultDueDate(cy, cm));

  const isNewPeriod = selectedPeriodId === '__new__' || periods.length === 0;

  const selectedPeriod: Period | undefined = periods.find((p) => p.id === selectedPeriodId);
  const periodLabel = isNewPeriod
    ? `${MONTHS_ES[newMonth]} ${newYear}`
    : (selectedPeriod?.label ?? '');

  const [concept, setConcept] = useState(`Cuota ordinaria ${periodLabel}`);

  // Update concept when period changes
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

  const [step, setStep] = useState<Step>('configure');
  const [result, setResult] = useState<{ created: number; failed: number; total: number } | null>(null);

  const activeUnits = units.filter((u) => u.active);
  const totalFeeAmount = activeUnits.reduce((s, u) => s + (u.feeAmount ?? 0n), 0n);

  async function execute() {
    let periodId: string | null = null;
    let resolvedDueDate = dueDate;

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

  const isPending = createPeriod.isPending || batchCharges.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-surface-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-primary/15 flex items-center justify-center">
              <Zap size={14} className="text-brand-primary" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">Cobrar mes</h2>
              <p className="text-slate-400 text-[10px]">Genera cobros para todas las unidades del roster</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        {step === 'configure' ? (
          <div className="p-5 space-y-4">
            {/* Period selector */}
            <div>
              <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-2">Período</label>
              <select
                value={selectedPeriodId}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="w-full bg-surface-hover border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              >
                <option value="__new__">+ Crear nuevo período</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* New period fields */}
            {isNewPeriod && (
              <div className="bg-surface-hover rounded-lg p-3 space-y-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Nuevo período</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Mes</label>
                    <select
                      value={newMonth}
                      onChange={(e) => handleNewPeriodMonth(Number(e.target.value))}
                      className="w-full bg-surface-card border border-surface-border text-white text-sm rounded-md px-2 py-1.5"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{MONTHS_ES[i + 1]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Año</label>
                    <select
                      value={newYear}
                      onChange={(e) => handleNewPeriodYear(Number(e.target.value))}
                      className="w-full bg-surface-card border border-surface-border text-white text-sm rounded-md px-2 py-1.5"
                    >
                      {[cy - 1, cy, cy + 1].map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Fecha de vencimiento</label>
                  <input type="date" value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-surface-card border border-surface-border text-white text-sm rounded-md px-3 py-1.5"
                  />
                </div>
              </div>
            )}

            {/* Concept */}
            <div>
              <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-2">Concepto</label>
              <input
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                className="w-full bg-surface-hover border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-primary"
                placeholder="Cuota ordinaria"
              />
            </div>

            {/* Summary preview */}
            <div className="bg-surface-hover rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-300 text-sm">
                <Users size={13} className="text-slate-400" />
                <span>{activeUnits.length} unidades a cobrar</span>
              </div>
              <span className="text-white font-semibold text-sm tabular-nums">
                {formatCOP(totalFeeAmount)}
              </span>
            </div>

            {(createPeriod.isError || batchCharges.isError) && (
              <div className="flex items-center gap-2 text-red-400 text-[11px] bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
                <AlertTriangle size={12} />
                {(createPeriod.error as Error)?.message ?? (batchCharges.error as Error)?.message ?? 'Error al cobrar'}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-surface-border text-slate-400 hover:text-white text-sm transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => void execute()}
                disabled={isPending || activeUnits.length === 0}
                className="flex-1 py-2.5 rounded-lg bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {isPending ? 'Cobrando…' : `Cobrar ${activeUnits.length} unidades`}
              </button>
            </div>
          </div>
        ) : (
          /* Result step */
          <div className="p-5 space-y-4">
            <div className="text-center py-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                result!.failed === 0 ? 'bg-emerald-900/30' : 'bg-amber-900/30'
              }`}>
                {result!.failed === 0
                  ? <CheckCircle size={24} className="text-emerald-400" />
                  : <AlertTriangle size={24} className="text-amber-400" />}
              </div>
              <p className="text-white font-semibold">{result!.created} cobros generados</p>
              {result!.failed > 0 && (
                <p className="text-amber-400 text-[11px] mt-1">{result!.failed} unidades sin cuota configurada — omitidas</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Creados', value: result!.created, color: 'text-emerald-400' },
                { label: 'Omitidos', value: result!.failed, color: 'text-amber-400' },
                { label: 'Total', value: result!.total, color: 'text-white' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-surface-hover rounded-lg p-2.5 text-center">
                  <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
                  <p className="text-[10px] text-slate-400">{label}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                const ym = isNewPeriod
                  ? `${newYear}-${String(newMonth).padStart(2, '0')}`
                  : (selectedPeriod ? `${selectedPeriod.year}-${String(selectedPeriod.month).padStart(2, '0')}` : '');
                onSuccess(ym);
              }}
              className="w-full py-2.5 rounded-lg bg-brand-primary hover:bg-brand-primary/90 text-white text-sm font-semibold"
            >
              Ver cobros
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
