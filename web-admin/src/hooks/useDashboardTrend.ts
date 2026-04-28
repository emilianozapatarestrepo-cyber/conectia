import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { z } from 'zod';
import { trendPointSchema } from '@/lib/schemas';

export function useDashboardTrend(months = 6) {
  return useQuery({
    queryKey: ['dashboard', 'trend', months],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/trend', { params: { months } });
      return z.array(trendPointSchema).parse(data);
    },
    staleTime: 5 * 60_000,
  });
}
