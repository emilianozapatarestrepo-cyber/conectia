import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { z } from 'zod';
import { delinquentUnitSchema } from '@/lib/schemas';

export function useDelinquent() {
  return useQuery({
    queryKey: ['charges', 'delinquent'],
    queryFn: async () => {
      const { data } = await api.get('/charges/delinquent');
      return z.array(delinquentUnitSchema).parse(data);
    },
    staleTime: 30_000,
  });
}
