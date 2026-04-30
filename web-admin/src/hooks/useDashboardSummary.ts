import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { summaryResponseSchema, type SummaryResponse } from '@/lib/schemas';

export function useDashboardSummary(period?: string) {
  return useQuery<SummaryResponse, Error>({
    queryKey: ['dashboard', 'summary', period],
    queryFn: async () => {
      const params = period ? { period } : {};
      const { data } = await api.get('/dashboard/summary', { params });
      return summaryResponseSchema.parse(data);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
