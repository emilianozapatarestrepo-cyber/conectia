import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { z } from 'zod';

const periodSchema = z.object({
  id:      z.string(),
  label:   z.string(),
  year:    z.number(),
  month:   z.number(),
  dueDate: z.string(),
});

export type Period = z.infer<typeof periodSchema>;

export function usePeriods() {
  return useQuery({
    queryKey: ['periods'],
    queryFn: async () => {
      const { data } = await api.get('/periods');
      return z.array(periodSchema).parse(data);
    },
    staleTime: 60_000,
  });
}

export function useCreatePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { year: number; month: number; dueDate: string }) => {
      const { data } = await api.post<Period>('/periods', body);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['periods'] });
      void qc.invalidateQueries({ queryKey: ['charges'] });
    },
  });
}
