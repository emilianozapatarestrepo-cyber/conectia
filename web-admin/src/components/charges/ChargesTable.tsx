import { useState, useMemo, useCallback } from 'react';
import { Copy, Check, MessageCircle, Receipt } from 'lucide-react';
import { usePaymentLink } from '@/hooks/useCharges';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCOP, formatDate } from '@/lib/formatters';
import { clsx } from 'clsx';
import type { Charge } from '@/lib/schemas';
import type { Unit } from '@/hooks/useUnits';

interface Props {
  charges: Charge[];
  units:   Unit[];
  loading: boolean;
}

function buildWhatsAppUrl(phone: string, ownerName: string | null, unitLabel: string, amount: bigint, concept: string, dueDate: Date) {
  const name = ownerName ?? 'Estimado residente';
  const due  = formatDate(dueDate);
  const msg  = [
    `Hola ${name},`,
    ``,
    `Le recordamos un cobro pendiente en *${unitLabel}*:`,
    `• *${concept}*`,
    `• Monto: *${formatCOP(amount)}*`,
    `• Vencimiento: ${due}`,
    ``,
    `Por favor realice su pago a la brevedad. ¡Gracias!`,
  ].join('\n');
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
}

function CopyLinkButton({ chargeId }: { chargeId: string }) {
  const paymentLink = usePaymentLink();
  const [copied, setCopied] = useState(false);
  const [url,    setUrl]    = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    let link = url;
    if (!link) {
      const res = await paymentLink.mutateAsync(chargeId);
      link = res.checkoutUrl;
      setUrl(link);
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }, [chargeId, url, paymentLink]);

  return (
    <button
      onClick={() => void handleClick()}
      disabled={paymentLink.isPending}
      title={copied ? 'Enlace copiado' : url ? 'Copiar enlace' : 'Generar enlace de pago'}
      className={clsx(
        'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all',
        copied
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-surface-hover text-slate-400 hover:text-white hover:bg-surface-border',
        paymentLink.isPending && 'opacity-50 cursor-wait',
      )}
    >
      {copied
        ? <><Check size={10} /> Copiado</>
        : <><Copy size={10} /> {url ? 'Copiar' : 'Enlace'}</>
      }
    </button>
  );
}

function RowSkeleton() {
  return (
    <tr className="border-b border-surface-border/50 animate-pulse">
      {[140, 200, 90, 100, 80, 64].map((w, i) => (
        <td key={i} className="px-4 py-4">
          <div className="h-3 bg-surface-hover rounded" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

export function ChargesTable({ charges, units, loading }: Props) {
  const unitMap = useMemo(
    () => new Map(units.map((u) => [u.id, u])),
    [units],
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-surface-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <TableHead />
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)}
          </tbody>
        </table>
      </div>
    );
  }

  if (charges.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface-card flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-11 h-11 rounded-xl bg-surface-hover flex items-center justify-center">
          <Receipt size={20} className="text-slate-500" />
        </div>
        <div className="text-center">
          <p className="text-white text-sm font-medium">No hay cobros</p>
          <p className="text-slate-400 text-[12px] mt-1">
            Usa "Cobrar mes" para generar cobros masivos o "Nuevo cargo" para uno individual.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-surface-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <TableHead />
        </thead>
        <tbody>
          {charges.map((charge) => {
            const unit     = unitMap.get(charge.unitId);
            const phone    = unit?.phone ?? null;
            const isActive  = charge.status === 'active';
            const isOverdue = charge.status === 'overdue';
            const isPaid    = charge.status === 'paid';
            const actionable = isActive || isOverdue;

            return (
              <tr
                key={charge.id}
                className={clsx(
                  'border-b border-surface-border/50 transition-colors group',
                  isOverdue && 'bg-red-950/20 hover:bg-red-950/30',
                  isActive  && 'hover:bg-surface-hover/50',
                  isPaid    && 'opacity-60 hover:opacity-90 hover:bg-surface-hover/30',
                  !isOverdue && !isActive && !isPaid && 'hover:bg-surface-hover/30',
                )}
              >
                {/* Urgency accent */}
                <td className="w-0 p-0 m-0">
                  <div className={clsx(
                    'w-[3px] h-full min-h-[52px]',
                    isOverdue ? 'bg-red-500' : isActive ? 'bg-transparent' : 'bg-transparent',
                  )} />
                </td>

                {/* Unit */}
                <td className="pl-4 pr-3 py-3.5">
                  <p className="text-white font-medium text-[13px] leading-tight">{charge.unitLabel}</p>
                  {charge.ownerName && (
                    <p className="text-slate-400 text-[11px] mt-0.5">{charge.ownerName}</p>
                  )}
                </td>

                {/* Concept */}
                <td className="px-3 py-3.5 max-w-[200px]">
                  <p className="text-slate-300 text-[12px] truncate">{charge.concept}</p>
                </td>

                {/* Due date */}
                <td className="px-3 py-3.5">
                  <span className={clsx(
                    'text-[12px] tabular-nums',
                    isOverdue ? 'text-red-400 font-medium' : 'text-slate-400',
                  )}>
                    {formatDate(charge.dueDate)}
                  </span>
                </td>

                {/* Amount */}
                <td className="px-3 py-3.5 text-right">
                  <span className={clsx(
                    'tabular-nums font-semibold text-[13px]',
                    isOverdue ? 'text-red-300' : isPaid ? 'text-emerald-400' : 'text-white',
                  )}>
                    {formatCOP(charge.amount)}
                  </span>
                </td>

                {/* Status */}
                <td className="px-3 py-3.5 text-center">
                  <StatusBadge status={charge.status} />
                </td>

                {/* Actions — visible on hover */}
                <td className="pl-2 pr-4 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {actionable && (
                      <>
                        <CopyLinkButton chargeId={charge.id} />
                        {phone && (
                          <a
                            href={buildWhatsAppUrl(phone, charge.ownerName, charge.unitLabel, charge.amount, charge.concept, charge.dueDate)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Notificar por WhatsApp"
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-surface-hover text-slate-400 hover:text-green-400 hover:bg-green-500/10 transition-all"
                          >
                            <MessageCircle size={10} />
                            WA
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableHead() {
  const cols = ['', 'Unidad', 'Concepto', 'Vencimiento', 'Monto', 'Estado', ''];
  const aligns = ['', 'left', 'left', 'left', 'right', 'center', 'right'];
  return (
    <tr className="bg-[#0d1526]">
      {cols.map((label, i) => (
        <th
          key={i}
          className={clsx(
            'py-3 text-[10px] font-semibold text-slate-500 tracking-widest uppercase border-b border-surface-border',
            aligns[i] === 'right'  && 'text-right  pr-4',
            aligns[i] === 'center' && 'text-center',
            aligns[i] === 'left'   && 'text-left   px-3',
            i === 0 && 'w-0 p-0',
            i === 1 && 'pl-4',
          )}
        >
          {label}
        </th>
      ))}
    </tr>
  );
}
