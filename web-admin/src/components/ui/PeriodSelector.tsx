import { useState } from 'react';
import { usePeriods, useCreatePeriod } from '@/hooks/usePeriods';

interface Props {
  value: string;   // 'YYYY-MM'
  onChange: (v: string) => void;
}

function currentYM(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function defaultDueDate(year: number, month: number): string {
  // 5th of the following month
  const d = new Date(year, month, 5);  // month is 0-indexed, so month here = next month
  return d.toISOString().slice(0, 10);
}

const MONTHS_ES = [
  '', 'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

export function PeriodSelector({ value, onChange }: Props) {
  const { data: periods = [] } = usePeriods();
  const createPeriod           = useCreatePeriod();
  const [creating, setCreating] = useState(false);
  const { year: cy, month: cm } = currentYM();
  const [newYear,  setNewYear]  = useState(cy);
  const [newMonth, setNewMonth] = useState(cm);
  const [dueDate,  setDueDate]  = useState(defaultDueDate(cy, cm));

  const handleCreate = async () => {
    const period = await createPeriod.mutateAsync({ year: newYear, month: newMonth, dueDate });
    onChange(`${period.year}-${String(period.month).padStart(2, '0')}`);
    setCreating(false);
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface-card border border-surface-border text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-primary"
      >
        {periods.map((p) => {
          const ym = `${p.year}-${String(p.month).padStart(2, '0')}`;
          return <option key={p.id} value={ym}>{p.label}</option>;
        })}
        {periods.length === 0 && (
          <option disabled value="">Sin períodos</option>
        )}
      </select>

      <button
        onClick={() => setCreating(true)}
        title="Crear período"
        className="p-1.5 rounded-md border border-surface-border text-slate-400 hover:text-white hover:border-brand-primary transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setCreating(false); }}
        >
          <div className="bg-surface-card border border-surface-border rounded-xl w-full max-w-xs p-5 space-y-4">
            <h3 className="text-white font-semibold text-sm">Nuevo período de cobro</h3>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 text-[11px] block mb-1">Mes</label>
                <select
                  value={newMonth}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    setNewMonth(m);
                    setDueDate(defaultDueDate(newYear, m));
                  }}
                  className="w-full bg-surface-hover border border-surface-border text-white text-sm rounded-md px-2 py-1.5"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{MONTHS_ES[i + 1]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-[11px] block mb-1">Año</label>
                <select
                  value={newYear}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    setNewYear(y);
                    setDueDate(defaultDueDate(y, newMonth));
                  }}
                  className="w-full bg-surface-hover border border-surface-border text-white text-sm rounded-md px-2 py-1.5"
                >
                  {[cy - 1, cy, cy + 1].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-slate-400 text-[11px] block mb-1">Fecha de vencimiento</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-surface-hover border border-surface-border text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setCreating(false)}
                className="flex-1 py-2 rounded-lg border border-surface-border text-slate-400 hover:text-white text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleCreate()}
                disabled={createPeriod.isPending}
                className="flex-1 py-2 rounded-lg bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {createPeriod.isPending ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
