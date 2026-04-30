import { clsx } from 'clsx';

// Match the real backend status values
type ChargeStatus = 'draft' | 'active' | 'paid' | 'partial' | 'overdue' | 'cancelled' | 'written_off';

const STYLES: Record<ChargeStatus, string> = {
  paid:        'bg-status-green/15  text-status-green',
  active:      'bg-status-yellow/15 text-status-yellow',
  partial:     'bg-brand-primary/15 text-brand-primary',
  draft:       'bg-slate-400/15     text-slate-400',
  overdue:     'bg-status-red/15    text-status-red',
  cancelled:   'bg-slate-600/15     text-slate-500',
  written_off: 'bg-slate-700/15     text-slate-600',
};

const LABELS: Record<ChargeStatus, string> = {
  paid:        'Pagado',
  active:      'Pendiente',
  partial:     'Parcial',
  draft:       'Borrador',
  overdue:     'En mora',
  cancelled:   'Cancelado',
  written_off: 'Castigo',
};

export function StatusBadge({ status }: { status: ChargeStatus }) {
  return (
    <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold', STYLES[status])}>
      {LABELS[status]}
    </span>
  );
}
