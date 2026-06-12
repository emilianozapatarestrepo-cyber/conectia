import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { SpinnerIcon } from '@/components/ui/icons';
import {
  useCreateBudgetItem,
  useUpdateBudgetItem,
  type BudgetItem,
} from '@/hooks/useBudget';

interface Props {
  year:       number;
  item?:      BudgetItem;
  categories: string[];
  onClose:    () => void;
}

export function BudgetDrawer({ year, item, categories, onClose }: Props) {
  const isEdit = !!item;

  const [category, setCategory]   = useState(item?.category ?? '');
  const [concept, setConcept]     = useState(item?.concept ?? '');
  const [budgeted, setBudgeted]   = useState(
    item ? String(BigInt(item.budgeted) / 100n) : ''
  );
  const [executed, setExecuted]   = useState(
    item ? String(BigInt(item.executed) / 100n) : '0'
  );
  const [notes, setNotes]         = useState(item?.notes ?? '');
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  const createMutation = useCreateBudgetItem();
  const updateMutation = useUpdateBudgetItem();

  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (createMutation.isSuccess || updateMutation.isSuccess) {
      onClose();
    }
  }, [createMutation.isSuccess, updateMutation.isSuccess, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const budgetedCents = String(BigInt(Math.round(Number(budgeted) * 100)));
    const executedCents = String(BigInt(Math.round(Number(executed) * 100)));

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id:       item.id,
          category: category.trim(),
          concept:  concept.trim(),
          budgeted: budgetedCents,
          executed: executedCents,
          notes:    notes.trim() || null,
        });
      } else {
        await createMutation.mutateAsync({
          periodYear: year,
          category:   category.trim(),
          concept:    concept.trim(),
          budgeted:   budgetedCents,
          executed:   executedCents,
          notes:      notes.trim() || null,
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al guardar');
    }
  };

  const listId = 'budget-categories-list';

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden />

      <aside
        className="fixed right-0 top-0 bottom-0 z-40 w-[480px] bg-surface-card border-l border-surface-border flex flex-col shadow-2xl shadow-black/60"
        role="dialog"
        aria-label={isEdit ? 'Editar ítem de presupuesto' : 'Nuevo ítem de presupuesto'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border flex-shrink-0">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
              Presupuesto {year}
            </p>
            <h2 className="text-white font-bold text-[15px] leading-tight">
              {isEdit ? 'Editar ítem' : 'Nuevo ítem'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-white hover:bg-surface-hover transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Categoría
            </label>
            <input
              type="text"
              list={listId}
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ej: Mantenimiento"
              className="w-full bg-surface-deep border border-surface-border rounded-md px-3 py-2 text-[13px] text-white placeholder-slate-600 focus:outline-none focus:border-brand-primary/50 transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Concepto
            </label>
            <input
              type="text"
              required
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Ej: Pintura fachada"
              className="w-full bg-surface-deep border border-surface-border rounded-md px-3 py-2 text-[13px] text-white placeholder-slate-600 focus:outline-none focus:border-brand-primary/50 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Presupuestado (COP)
              </label>
              <input
                type="number"
                required
                min="0"
                step="1"
                value={budgeted}
                onChange={(e) => setBudgeted(e.target.value)}
                placeholder="0"
                className="w-full bg-surface-deep border border-surface-border rounded-md px-3 py-2 text-[13px] text-white placeholder-slate-600 focus:outline-none focus:border-brand-primary/50 transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Ejecutado (COP)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={executed}
                onChange={(e) => setExecuted(e.target.value)}
                placeholder="0"
                className="w-full bg-surface-deep border border-surface-border rounded-md px-3 py-2 text-[13px] text-white placeholder-slate-600 focus:outline-none focus:border-brand-primary/50 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Notas <span className="text-slate-600 font-normal normal-case">(opcional)</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones adicionales…"
              className="w-full bg-surface-deep border border-surface-border rounded-md px-3 py-2 text-[13px] text-white placeholder-slate-600 focus:outline-none focus:border-brand-primary/50 transition-colors resize-none"
            />
          </div>

          {errorMsg && (
            <p className="text-status-red text-[12px]">{errorMsg}</p>
          )}
        </form>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-surface-border flex-shrink-0">
          <button
            type="submit"
            form=""
            onClick={(e) => {
              e.currentTarget.closest('aside')?.querySelector('form')?.requestSubmit();
            }}
            disabled={isPending}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-md bg-brand-primary/10 border border-brand-primary/30 hover:bg-brand-primary/20 text-brand-primary text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? <SpinnerIcon className="w-3.5 h-3.5" /> : null}
            {isPending ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Crear ítem')}
          </button>
        </div>
      </aside>
    </>
  );
}
