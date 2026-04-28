import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { z } from 'zod';
import { alertSchema } from '@/lib/schemas';

export function useAlerts() {
  return useQuery({
    queryKey: ['dashboard', 'alerts'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/alerts');
      return z.array(alertSchema).parse(data);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
