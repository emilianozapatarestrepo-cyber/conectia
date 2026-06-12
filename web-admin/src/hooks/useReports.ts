import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/lib/api';

// ── Schemas ───────────────────────────────────────────────────────────────────

const reportAccountSchema = z.object({
  id:          z.string(),
  code:        z.string(),
  name:        z.string(),
  accountType: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parentId:    z.string().nullable(),
  balance:     z.string(),
});

const balanceGeneralSchema = z.object({
  asOf:        z.string(),
  generatedAt: z.string(),
  accounts:    z.array(reportAccountSchema),
  totals: z.object({
    assets:      z.string(),
    liabilities: z.string(),
    equity:      z.string(),
  }),
});

const estadoResultadosSchema = z.object({
  from:        z.string(),
  to:          z.string(),
  generatedAt: z.string(),
  accounts:    z.array(reportAccountSchema),
  totals: z.object({
    revenue:   z.string(),
    expenses:  z.string(),
    netIncome: z.string(),
  }),
});

export type ReportAccount     = z.output<typeof reportAccountSchema>;
export type BalanceGeneral    = z.output<typeof balanceGeneralSchema>;
export type EstadoResultados  = z.output<typeof estadoResultadosSchema>;

// ── Queries ───────────────────────────────────────────────────────────────────

export function useBalanceGeneral(asOf: string) {
  return useQuery({
    queryKey: ['reports', 'balance-general', asOf],
    queryFn: async () => {
      const { data } = await api.get('/reports/balance-general', { params: { asOf } });
      return balanceGeneralSchema.parse(data);
    },
    staleTime: 2 * 60_000,
    enabled: !!asOf,
  });
}

export function useEstadoResultados(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'estado-resultados', from, to],
    queryFn: async () => {
      const { data } = await api.get('/reports/estado-resultados', { params: { from, to } });
      return estadoResultadosSchema.parse(data);
    },
    staleTime: 2 * 60_000,
    enabled: !!from && !!to,
  });
}
