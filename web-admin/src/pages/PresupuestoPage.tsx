import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, PieChart } from 'lucide-react';
import { clsx } from 'clsx';
import { useBudgetItems, useBudgetSummary, useDeleteBudgetItem, type BudgetItem } from '@/hooks/useBudget';
import { BudgetProgressBar } from '@/components/budget/BudgetProgressBar';
import { BudgetDrawer } from '@/components/budget/BudgetDrawer';
import { SpinnerIcon } from '@/components/ui/icons';
import { formatCOP } from '@/lib/formatters';

function pct(executed: bigint, budgeted: bigint): number {
  if (budgeted === 0n) return 0;
  return Math.min(100, Number((executed * 10000n) / budgeted) / 100);
}

function PctBadge({ value }: { value: number }) {
  const cls =
    value >= 100 ? 'text-status-red bg-status-red/10' :
    value >= 80  ? 'text-status-yellow bg-status-yellow/10' :
                   'text-status-green bg-status-green/10';
  return (
    <span className={clsx('text-[11px] font-bold px-1.5 py-0.5 rounded tabular-nums', cls)}>
      {Math.round(value)}%
    </span>
  );
}

export default function PresupuestoPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [drawer, setDrawer] = useState<{ open: boolean; item?: BudgetItem }>({ open: false });

  const { data: items = [], isLoading } = useBudgetItems(year);
  const { data: summary = [] } = useBudgetSummary(year);
  const deleteMutation = useDeleteBudgetItem();

  const categories = [...new Set(items.map((i) => i.category))].sort();
  const totalBudgeted = items.reduce((s, i) => s + BigInt(i.budgeted), 0n);
  const totalExecuted = items.reduce((s, i) => s + BigInt(i.executed), 0n);
  const totalPct      = pct(totalExecuted, totalBudgeted);

  const grouped = categories.map((cat) => ({
    category: cat,
    items: items.filter((i) => i.category === cat),
  }));

  const handleDelete = (item: BudgetItem) => {
    if (!window.confirm(`¿Eliminar "${item.concept}"?`)) return;
    deleteMutation.mutate(item.id);
  };

  return (
    <div className="p-5 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-[15px] tracking-tight">Presupuesto Anual</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <button onClick={() => setYear((y) => y - 1)} className="text-slate-500 hover:text-white text-[12px] px-1 transition-colors" aria-label="Año anterior">‹</button>
            <span className="text-slate-400 text-[12px] tabular-nums">{year}</span>
            <button onClick={() => setYear((y) => y + 1)} className="text-slate-500 hover:text-white text-[12px] px-1 transition-colors" aria-label="Año siguiente">›</button>
          </div>
        </div>
        <button onClick={() => setDrawer({ open: true })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-primary/10 border border-brand-primary/30 hover:bg-brand-primary/20 text-brand-primary text-[12px] font-semibold transition-colors">
          <Plus size={13} /> Nuevo ítem
        </button>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-1">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total presupuestado</p>
            <p className="text-white font-bold text-[16px] tabular-nums">{formatCOP(totalBudgeted)}</p>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-1">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total ejecutado</p>
            <p className="text-white font-bold text-[16px] tabular-nums">{formatCOP(totalExecuted)}</p>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-1">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">% Ejecución</p>
            <PctBadge value={totalPct} />
          </div>
          <div className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-1">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Categorías</p>
            <p className="text-white font-bold text-[16px]">{summary.length}</p>
          </div>
        </div>
      )}

      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-slate-500 text-[13px]"><SpinnerIcon className="w-4 h-4" /> Cargando…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <PieChart size={32} className="text-slate-700" />
            <p className="text-slate-400 text-[13px]">No hay ítems de presupuesto para {year}</p>
            <button onClick={() => setDrawer({ open: true })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-[12px] font-semibold transition-colors hover:bg-brand-primary/20">
              <Plus size={12} /> Agregar primer ítem
            </button>
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-surface-border text-slate-500 text-[10px] uppercase tracking-wider">
                <th className="text-left px-4 py-2.5 font-semibold">Concepto</th>
                <th className="text-right px-4 py-2.5 font-semibold">Presupuestado</th>
                <th className="text-right px-4 py-2.5 font-semibold">Ejecutado</th>
                <th className="px-4 py-2.5 font-semibold">Ejecución</th>
                <th className="text-left px-4 py-2.5 font-semibold">Notas</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ category, items: catItems }) => (
                <>
                  <tr key={`cat-${category}`} className="bg-surface-deep/50 border-b border-surface-border/50">
                    <td colSpan={6} className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{category}</td>
                  </tr>
                  {catItems.map((item) => {
                    const b = BigInt(item.budgeted);
                    const e = BigInt(item.executed);
                    return (
                      <tr key={item.id} className="border-b border-surface-border/30 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2.5 text-white">{item.concept}</td>
                        <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">{formatCOP(b)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">{formatCOP(e)}</td>
                        <td className="px-4 py-2.5"><BudgetProgressBar budgeted={b} executed={e} /></td>
                        <td className="px-4 py-2.5 text-slate-500 max-w-[180px] truncate">{item.notes ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setDrawer({ open: true, item })} className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:text-white hover:bg-white/10 transition-colors" aria-label="Editar"><Pencil size={12} /></button>
                            <button onClick={() => handleDelete(item)} disabled={deleteMutation.isPending} className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:text-status-red hover:bg-status-red/10 transition-colors disabled:opacity-40" aria-label="Eliminar"><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawer.open && (
        <BudgetDrawer year={year} item={drawer.item} categories={categories} onClose={() => setDrawer({ open: false })} />
      )}
    </div>
  );
}

export function BudgetWidget() {
  const year = new Date().getFullYear();
  const { data: items = [], isLoading } = useBudgetItems(year);
  const totalBudgeted = items.reduce((s, i) => s + BigInt(i.budgeted), 0n);
  const totalExecuted = items.reduce((s, i) => s + BigInt(i.executed), 0n);
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Presupuesto {year}</p>
        <Link to="/presupuesto" className="text-[10px] text-brand-primary hover:underline">Ver detalle →</Link>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-500 text-[11px]"><SpinnerIcon className="w-3 h-3" /> Cargando…</div>
      ) : items.length === 0 ? (
        <p className="text-slate-600 text-[11px]">Sin presupuesto configurado</p>
      ) : (
        <BudgetProgressBar budgeted={totalBudgeted} executed={totalExecuted} showAmounts />
      )}
    </div>
  );
}
