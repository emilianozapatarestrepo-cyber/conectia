import { useState } from 'react';
import { useCharges } from '@/hooks/useCharges';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCOP, formatDate } from '@/lib/formatters';
import type { Charge } from '@/lib/schemas';

type FilterStatus = 'all' | 'paid' | 'active' | 'overdue';

const COLUMNS: Column<Charge>[] = [
  { key: 'unit',    header: 'Unidad',       render: (r) => <span className="font-medium">{r.unitLabel}</span> },
  { key: 'owner',   header: 'Propietario',  render: (r) => r.ownerName ?? '—' },
  { key: 'concept', header: 'Concepto',     render: (r) => r.concept },
  { key: 'due',     header: 'Vencimiento',  render: (r) => <span className="text-slate-300">{formatDate(r.dueDate)}</span> },
  { key: 'amount',  header: 'Monto',        render: (r) => formatCOP(r.amount), align: 'right' },
  { key: 'status',  header: 'Estado',       render: (r) => <StatusBadge status={r.status} />, align: 'center' },
];

export default function RecaudoPage() {
  const [status, setStatus] = useState<FilterStatus>('all');
  const { data = [], isLoading } = useCharges({ status: status === 'all' ? undefined : status });

  const total = data.reduce((s, c) => s + c.amount, 0n);

  const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
    { value: 'all',     label: 'Todos' },
    { value: 'paid',    label: 'Pagados' },
    { value: 'active',  label: 'Pendientes' },
    { value: 'overdue', label: 'En mora' },
  ];

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-white font-bold text-base">Recaudo</h1>
        <div className="flex gap-2">
          {FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatus(value)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                status === value ? 'bg-brand-primary text-white' : 'bg-surface-card text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      <div className="bg-surface-card rounded-lg px-4 py-2.5 flex gap-6 text-sm">
        <span className="text-slate-400">{data.length} registros</span>
        <span className="text-white font-semibold tabular-nums">{formatCOP(total)} total</span>
      </div>

      <DataTable
        columns={COLUMNS}
        data={data}
        keyFn={(r) => r.id}
        loading={isLoading}
        emptyMessage="No hay cobros para el filtro seleccionado"
      />
    </div>
  );
}
