import { useState } from 'react';
import { Zap, Plus, MessageCircle, Copy, Check, ExternalLink, ChevronDown } from 'lucide-react';
import { useCharges, usePaymentLink } from '@/hooks/useCharges';
import { usePeriods } from '@/hooks/usePeriods';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCOP, formatDate } from '@/lib/formatters';
import { CobrarMesModal } from '@/components/charges/CobrarMesModal';
import { CreateChargeModal } from '@/components/charges/CreateChargeModal';
import type { Charge } from '@/lib/schemas';

type FilterStatus = 'all' | 'paid' | 'pending' | 'overdue';

const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: 'all',     label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'overdue', label: 'En mora' },
  { value: 'paid',    label: 'Pagados' },
];

function buildWhatsAppUrl(phone: string, ownerName: string | null, unitLabel: string, amount: bigint, concept: string, dueDate: Date) {
  const name = ownerName ?? 'Estimado residente';
  const due  = formatDate(dueDate);
  const msg  = `Hola ${name}, le recordamos que tiene un cobro pendiente en ${unitLabel}:\n\n*${concept}*\nMonto: *${formatCOP(amount)}*\nVencimiento: ${due}\n\nPor favor realice su pago a la brevedad. Gracias.`;
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
}

function PaymentLinkButton({ charge }: { charge: Charge }) {
  const paymentLink = usePaymentLink();
  const [copied, setCopied]   = useState(false);
  const [url,    setUrl]      = useState<string | null>(null);

  async function handleClick() {
    if (url) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    const res = await paymentLink.mutateAsync(charge.id);
    setUrl(res.checkoutUrl);
    await navigator.clipboard.writeText(res.checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={() => void handleClick()}
      disabled={paymentLink.isPending}
      title={url ? 'Copiar enlace de pago' : 'Generar enlace de pago'}
      className="p-1.5 rounded-md text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
    >
      {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
    </button>
  );
}

export default function RecaudoPage() {
  const { data: periods = [] } = usePeriods();

  const [filterPeriod, setFilterPeriod] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showCobrarMes,    setShowCobrarMes]    = useState(false);
  const [showCreateCharge, setShowCreateCharge] = useState(false);

  const { data = [], isLoading } = useCharges({
    period: filterPeriod || undefined,
    status: filterStatus === 'all' ? undefined : filterStatus,
  });

  const pendingCount = data.filter((c) => c.status === 'active' || c.status === 'overdue').length;
  const totalAmount  = data.reduce((s, c) => s + c.amount, 0n);
  const paidAmount   = data.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amount, 0n);

  const COLUMNS: Column<Charge>[] = [
    {
      key: 'unit',
      header: 'Unidad',
      render: (r) => (
        <div>
          <p className="font-medium text-white">{r.unitLabel}</p>
          {r.ownerName && <p className="text-[11px] text-slate-400">{r.ownerName}</p>}
        </div>
      ),
    },
    { key: 'concept', header: 'Concepto',    render: (r) => <span className="text-slate-300 text-[12px]">{r.concept}</span> },
    { key: 'due',     header: 'Vencimiento', render: (r) => <span className="text-slate-400 text-[12px] tabular-nums">{formatDate(r.dueDate)}</span> },
    { key: 'amount',  header: 'Monto',       render: (r) => <span className="tabular-nums font-medium">{formatCOP(r.amount)}</span>, align: 'right' },
    { key: 'status',  header: 'Estado',      render: (r) => <StatusBadge status={r.status} />, align: 'center' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => {
        const actionable = r.status === 'active' || r.status === 'overdue';
        if (!actionable) return null;
        return (
          <div className="flex items-center gap-0.5 justify-end">
            <PaymentLinkButton charge={r} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(r as any).phone && (
              <a
                href={buildWhatsAppUrl((r as any).phone, r.ownerName, r.unitLabel, r.amount, r.concept, r.dueDate)}
                target="_blank"
                rel="noopener noreferrer"
                title="Notificar por WhatsApp"
                className="p-1.5 rounded-md text-slate-400 hover:text-green-400 hover:bg-green-500/10 transition-colors"
              >
                <MessageCircle size={13} />
              </a>
            )}
          </div>
        );
      },
    },
  ];

  function handleCobrarMesSuccess(ym: string) {
    setShowCobrarMes(false);
    if (ym) setFilterPeriod(ym);
  }

  return (
    <div className="p-5 space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-white font-bold text-base">Recaudo</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateCharge(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-card border border-surface-border text-slate-300 hover:text-white text-[12px] font-medium transition-colors"
          >
            <Plus size={13} />
            Nuevo cargo
          </button>
          <button
            onClick={() => setShowCobrarMes(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary/90 text-white text-[12px] font-semibold transition-colors"
          >
            <Zap size={13} />
            Cobrar mes
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Period filter */}
        <div className="relative">
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="appearance-none bg-surface-card border border-surface-border text-sm text-white rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-primary cursor-pointer"
          >
            <option value="">Todos los períodos</option>
            {periods.map((p) => (
              <option key={p.id} value={`${p.year}-${String(p.month).padStart(2, '0')}`}>
                {p.label}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Status tabs */}
        <div className="flex gap-1">
          {FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilterStatus(value)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                filterStatus === value
                  ? 'bg-brand-primary text-white'
                  : 'bg-surface-card text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      <div className="bg-surface-card border border-surface-border rounded-xl px-4 py-3 grid grid-cols-3 gap-4">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Total cobrado</p>
          <p className="text-white font-bold tabular-nums mt-0.5">{formatCOP(paidAmount)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Total pendiente</p>
          <p className="text-amber-400 font-bold tabular-nums mt-0.5">
            {formatCOP(data.filter((c) => c.status !== 'paid').reduce((s, c) => s + c.amount, 0n))}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Registros</p>
          <p className="text-white font-bold tabular-nums mt-0.5">
            {data.length}
            {pendingCount > 0 && (
              <span className="text-[11px] text-amber-400 font-normal ml-1.5">({pendingCount} sin pagar)</span>
            )}
          </p>
        </div>
      </div>

      {/* Bulk notify hint */}
      {filterStatus !== 'paid' && pendingCount > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-surface-card border border-surface-border rounded-lg px-3 py-2">
          <ExternalLink size={11} />
          Usa los botones <Copy size={10} className="inline" /> y <MessageCircle size={10} className="inline" /> en cada fila para generar enlace de pago o notificar por WhatsApp.
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        data={data}
        keyFn={(r) => r.id}
        loading={isLoading}
        emptyMessage="No hay cobros para los filtros seleccionados"
      />

      {showCobrarMes && (
        <CobrarMesModal
          onClose={() => setShowCobrarMes(false)}
          onSuccess={handleCobrarMesSuccess}
        />
      )}

      {showCreateCharge && (
        <CreateChargeModal
          onClose={() => setShowCreateCharge(false)}
          onSuccess={() => setShowCreateCharge(false)}
        />
      )}
    </div>
  );
}
