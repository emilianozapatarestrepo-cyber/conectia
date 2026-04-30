import { useDelinquent } from '@/hooks/useDelinquent';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { formatCOP, formatDate } from '@/lib/formatters';
import type { DelinquentUnit } from '@/lib/schemas';

const moraColor = (months: number): string =>
  months >= 3 ? 'text-status-red font-semibold' : months >= 2 ? 'text-status-yellow' : 'text-slate-300';

const COLUMNS: Column<DelinquentUnit>[] = [
  { key: 'rank',   header: '#',            render: (_, i) => <span className="text-slate-400">{i + 1}</span>, width: 'w-10' },
  { key: 'unit',   header: 'Unidad',       render: (r) => <span className="font-medium text-white">{r.unitLabel}</span> },
  { key: 'owner',  header: 'Propietario',  render: (r) => r.ownerName ?? '—' },
  { key: 'months', header: 'Meses mora',   render: (r) => (
    <span className={moraColor(r.monthsDelinquent)}>
      {r.monthsDelinquent} {r.monthsDelinquent === 1 ? 'mes' : 'meses'}
    </span>
  ), align: 'center' },
  { key: 'last',   header: 'Último pago',  render: (r) => r.lastPaymentDate ? formatDate(r.lastPaymentDate) : <span className="text-status-red">Nunca</span> },
  { key: 'owed',   header: 'Total adeudado', render: (r) => <span className="text-status-red font-semibold tabular-nums">{formatCOP(r.totalOwed)}</span>, align: 'right' },
];

export default function MorosidadPage() {
  const { data = [], isLoading } = useDelinquent();
  const totalOwed = data.reduce((s, d) => s + d.totalOwed, 0n);

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-white font-bold text-base">Morosidad</h1>
        <div className="text-right">
          <p className="text-[11px] text-slate-400">{data.length} unidades en mora</p>
          <p className="text-status-red font-bold tabular-nums">{formatCOP(totalOwed)} total</p>
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        data={data}
        keyFn={(r) => r.unitId}
        loading={isLoading}
        emptyMessage="No hay unidades en mora"
      />
    </div>
  );
}
