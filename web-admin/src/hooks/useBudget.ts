import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/lib/api';

// ── Schemas ───────────────────────────────────────────────────────────────────

const budgetItemSchema = z.object({
  id:         z.string(),
  periodYear: z.number(),
  category:   z.string(),
  concept:    z.string(),
  budgeted:   z.string(),
  executed:   z.string(),
  notes:      z.string().nullable(),
  createdAt:  z.string(),
});

const budgetSummarySchema = z.object({
  category:  z.string(),
  budgeted:  z.string(),
  executed:  z.string(),
  itemCount: z.number(),
});

export type BudgetItem    = z.output<typeof budgetItemSchema>;
export type BudgetSummary = z.output<typeof budgetSummarySchema>;

// ── Queries ───────────────────────────────────────────────────────────────────

export function useBudgetItems(year: number) {
  return useQuery({
    queryKey: ['budgets', { year }],
    queryFn: async () => {
      const { data } = await api.get('/budgets', { params: { year } });
      return z.array(budgetItemSchema).parse(data);
    },
    staleTime: 60_000,
  });
}

export function useBudgetSummary(year: number) {
  return useQuery({
    queryKey: ['budgets', 'summary', { year }],
    queryFn: async () => {
      const { data } = await api.get('/budgets/summary', { params: { year } });
      return z.array(budgetSummarySchema).parse(data);
    },
    staleTime: 60_000,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateBudgetItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      periodYear: number;
      category: string;
      concept: string;
      budgeted: string;
      executed?: string;
      notes?: string | null;
    }) => {
      const { data } = await api.post('/budgets', payload);
      return budgetItemSchema.parse(data);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['budgets'] }),
  });
}

export function useUpdateBudgetItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: {
      id: string;
      category?: string;
      concept?: string;
      budgeted?: string;
      executed?: string;
      notes?: string | null;
    }) => {
      const { data } = await api.put(`/budgets/${id}`, payload);
      return budgetItemSchema.parse(data);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['budgets'] }),
  });
}

export function useDeleteBudgetItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/budgets/${id}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['budgets'] }),
  });
}
