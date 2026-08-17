import { useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useCharges } from '@/hooks/useCharges';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCOP, formatDate } from '@/lib/formatters';
import { api } from '@/lib/api';
import type { Charge } from '@/lib/schemas';

interface UnitPortfolio {
  unitId: string;
  unitLabel: string;
  ownerName: string | null;
  status: Charge['status'];
  totalOwed: bigint;
  lastPaymentDate: Date | null;
  chargeCount: number;
}

// Worse status wins when a unit has multiple charges in the window
const STATUS_RANK: Record<Charge['status'], number> = {
  overdue: 0,
  active: 1,
  draft: 1,
  partial: 2,
  paid: 3,
  cancelled: 4,
  written_off: 4,
};

function groupByUnit(charges: Charge[]): UnitPortfolio[] {
  const byUnit = new Map<string, UnitPortfolio>();

  for (const c of charges) {
    const existing = byUnit.get(c.unitId);
    const owed = c.status === 'paid' || c.status === 'cancelled' || c.status === 'written_off' ? 0n : c.amount;

    if (!existing) {
      byUnit.set(c.unitId, {
        unitId: c.unitId,
        unitLabel: c.unitLabel,
        ownerName: c.ownerName,
        status: c.status,
        totalOwed: owed,
        lastPaymentDate: c.paidAt,
        chargeCount: 1,
      });
      continue;
    }

    existing.totalOwed += owed;
    existing.chargeCount += 1;
    if (STATUS_RANK[c.status] < STATUS_RANK[existing.status]) existing.status = c.status;
    if (c.paidAt && (!existing.lastPaymentDate || c.paidAt > existing.lastPaymentDate)) {
      existing.lastPaymentDate = c.paidAt;
    }
  }

  return Array.from(byUnit.values()).sort((a, b) => (b.totalOwed > a.totalOwed ? 1 : -1));
}

const COLUMNS: Column<UnitPortfolio>[] = [
  { key: 'unit',   header: 'Unidad',       render: (r) => <span className="font-medium">{r.unitLabel}</span> },
  { key: 'owner',  header: 'Propietario',  render: (r) => r.ownerName ?? '—' },
  { key: 'charges', header: 'Cargos',      render: (r) => r.chargeCount, align: 'center' },
  { key: 'last',   header: 'Último pago',  render: (r) => (r.lastPaymentDate ? formatDate(r.lastPaymentDate) : '—') },
  { key: 'status', header: 'Estado',       render: (r) => <StatusBadge status={r.status} />, align: 'center' },
  { key: 'owed',   header: 'Saldo',        render: (r) => (
    <span className={r.totalOwed > 0n ? 'text-status-red font-semibold' : 'text-slate-400'}>
      {formatCOP(r.totalOwed)}
    </span>
  ), align: 'right' },
];

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function CarteraPage() {
  const [exporting, setExporting] = useState(false);
  const { data = [], isLoading } = useCharges();
  const units = useMemo(() => groupByUnit(data), [data]);

  const totalOwed = units.reduce((s, u) => s + u.totalOwed, 0n);
  const unitsWithBalance = units.filter((u) => u.totalOwed > 0n).length;

  const handleExport = async () => {
    setExporting(true);
    try {
      const period = currentPeriod();
      const { data: blob } = await api.get('/export/portfolio', {
        params: { period },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(blob as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cartera-${period}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-white font-bold text-base">Cartera</h1>
        <button
          onClick={handleExport}
          disabled={exporting || units.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-primary text-white text-[11px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Exportar Excel
        </button>
      </div>

      {/* Summary bar */}
      <div className="bg-surface-card rounded-lg px-4 py-2.5 flex gap-6 text-sm">
        <span className="text-slate-400">{units.length} unidades</span>
        <span className="text-slate-400">{unitsWithBalance} con saldo pendiente</span>
        <span className="text-white font-semibold tabular-nums">{formatCOP(totalOwed)} por cobrar</span>
      </div>

      <DataTable
        columns={COLUMNS}
        data={units}
        keyFn={(r) => r.unitId}
        loading={isLoading}
        emptyMessage="No hay unidades en la cartera"
      />
    </div>
  );
}
