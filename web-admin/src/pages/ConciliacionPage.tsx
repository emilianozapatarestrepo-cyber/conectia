import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { z } from 'zod';
import { formatCOP, formatDate } from '@/lib/formatters';
import { Check, X, ExternalLink, Landmark } from 'lucide-react';

const piSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  amount: z.string().transform((v) => BigInt(v)),
  status: z.enum(['pending', 'processing', 'confirmed', 'failed', 'reversed', 'settled']),
  comprobanteUrl: z.string().nullable(),
  createdAt: z.string().transform((v) => new Date(v)),
});
type PI = z.infer<typeof piSchema>;

const settlementSchema = z.object({
  pendingCount: z.number(),
  pendingAmount: z.string().transform((v) => BigInt(v)),
});
type SettlementStatus = z.infer<typeof settlementSchema>;

export default function ConciliacionPage() {
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ['charges', 'reconciliation'],
    queryFn: async () => {
      const { data } = await api.get('/charges/reconciliation');
      return z.array(piSchema).parse(data);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const { data: settlement } = useQuery({
    queryKey: ['charges', 'settlement'],
    queryFn: async (): Promise<SettlementStatus> => {
      const { data } = await api.get('/charges/settlement');
      return settlementSchema.parse(data);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const reconcile = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.post(`/charges/reconciliation/${id}`, { action }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['charges'] }),
  });

  const triggerSettlement = useMutation({
    mutationFn: () => api.post('/charges/settlement', {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['charges'] }),
  });

  const hasPendingSettlement = (settlement?.pendingCount ?? 0) > 0;

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-white font-bold text-base">Conciliación</h1>
        <span className="text-[11px] text-slate-400">
          {isLoading ? '…' : `${data.length} pagos por confirmar`}
        </span>
      </div>

      {/* Settlement panel */}
      <div className={`rounded-xl border p-4 flex items-center justify-between gap-4 ${
        hasPendingSettlement
          ? 'bg-blue-950/30 border-blue-700/30'
          : 'bg-surface-card border-surface-border'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${hasPendingSettlement ? 'bg-blue-500/15' : 'bg-surface-hover'}`}>
            <Landmark size={16} className={hasPendingSettlement ? 'text-blue-400' : 'text-slate-500'} />
          </div>
          <div>
            <p className="text-white text-sm font-semibold">Pendiente de liquidación</p>
            <p className="text-slate-400 text-[11px] mt-0.5">
              {hasPendingSettlement
                ? `${settlement!.pendingCount} pago${settlement!.pendingCount > 1 ? 's' : ''} confirmados en procesador Wompi — ${formatCOP(settlement!.pendingAmount)}`
                : 'Sin pagos confirmados pendientes de acreditar al banco'}
            </p>
          </div>
        </div>
        {hasPendingSettlement && (
          <button
            onClick={() => triggerSettlement.mutate()}
            disabled={triggerSettlement.isPending}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[12px] font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            <Landmark size={13} />
            {triggerSettlement.isPending ? 'Registrando…' : 'Registrar liquidación'}
          </button>
        )}
      </div>

      {/* Reconciliation list */}
      <div>
        <p className="text-slate-400 text-[11px] mb-3 uppercase tracking-wide font-medium">Pagos por confirmar</p>

        {!isLoading && data.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">
            Sin pagos pendientes de conciliación
          </div>
        )}

        <div className="space-y-2">
          {data.map((pi: PI) => (
            <div
              key={pi.id}
              className="bg-surface-card border border-surface-border rounded-lg p-4 flex items-center justify-between gap-4"
            >
              <div>
                <p className="text-white font-medium text-sm">Unidad {pi.unitId}</p>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  {formatDate(pi.createdAt)} · {formatCOP(pi.amount)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {pi.comprobanteUrl && (
                  <a
                    href={pi.comprobanteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-brand-primary hover:underline"
                    aria-label="Ver comprobante"
                  >
                    <ExternalLink size={12} />
                    Comprobante
                  </a>
                )}
                <button
                  onClick={() => reconcile.mutate({ id: pi.id, action: 'reject' })}
                  disabled={reconcile.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-status-red/15 text-status-red text-[11px] font-semibold hover:bg-status-red/25 transition-colors disabled:opacity-50"
                  aria-label="Rechazar pago"
                >
                  <X size={12} />
                  Rechazar
                </button>
                <button
                  onClick={() => reconcile.mutate({ id: pi.id, action: 'approve' })}
                  disabled={reconcile.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-status-green/15 text-status-green text-[11px] font-semibold hover:bg-status-green/25 transition-colors disabled:opacity-50"
                  aria-label="Aprobar pago"
                >
                  <Check size={12} />
                  Aprobar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
