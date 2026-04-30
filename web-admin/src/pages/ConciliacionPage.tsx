import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { z } from 'zod';
import { formatCOP, formatDate } from '@/lib/formatters';
import { Check, X, ExternalLink } from 'lucide-react';

const piSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  amount: z.string().transform((v) => BigInt(v)),
  status: z.enum(['pending', 'processing', 'confirmed', 'failed', 'reversed', 'settled']),
  comprobanteUrl: z.string().nullable(),
  createdAt: z.string().transform((v) => new Date(v)),
});
type PI = z.infer<typeof piSchema>;

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

  const reconcile = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.post(`/charges/reconciliation/${id}`, { action }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['charges'] }),
  });

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-white font-bold text-base">Conciliación</h1>
        <span className="text-[11px] text-slate-400">
          {isLoading ? '…' : `${data.length} pagos por confirmar`}
        </span>
      </div>

      {!isLoading && data.length === 0 && (
        <div className="text-center py-16 text-slate-400 text-sm">
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
  );
}
