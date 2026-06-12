import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { unitStatementSchema, type UnitStatement } from '@/lib/schemas';

export function useUnitStatement(unitId: string | null) {
  return useQuery<UnitStatement, Error>({
    queryKey: ['unit-statement', unitId],
    queryFn: async () => {
      const { data } = await api.get(`/units/${unitId}/estado-cuenta`);
      return unitStatementSchema.parse(data);
    },
    enabled: !!unitId,
    staleTime: 30_000,
  });
}
