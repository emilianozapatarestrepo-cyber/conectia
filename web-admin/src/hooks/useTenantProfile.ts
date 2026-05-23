import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { z } from 'zod';

export const tenantProfileSchema = z.object({
  id:       z.string(),
  name:     z.string(),
  type:     z.string(),
  address:  z.string().nullable(),
  taxId:    z.string().nullable(),
  timezone: z.string(),
  currency: z.string(),
});

export type TenantProfile = z.infer<typeof tenantProfileSchema>;

export function useTenantProfile() {
  return useQuery({
    queryKey: ['tenant', 'profile'],
    queryFn: async (): Promise<TenantProfile> => {
      const { data } = await api.get('/tenants/profile');
      return tenantProfileSchema.parse(data);
    },
    staleTime: 10 * 60_000,
  });
}

export function useUpdateTenantProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<Omit<TenantProfile, 'id' | 'currency'>>) =>
      api.patch('/tenants/profile', updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', 'profile'] }),
  });
}
