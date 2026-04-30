import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { z } from 'zod';
import { chargeSchema } from '@/lib/schemas';

interface ChargeFilter { period?: string; status?: string; unitId?: string }

export function useCharges(filter: ChargeFilter = {}) {
  return useQuery({
    queryKey: ['charges', filter],
    queryFn: async () => {
      const { data } = await api.get('/charges', { params: filter });
      return z.array(chargeSchema).parse(data);
    },
    staleTime: 30_000,
  });
}
