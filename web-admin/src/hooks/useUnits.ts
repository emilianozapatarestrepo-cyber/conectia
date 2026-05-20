import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { z } from 'zod';

const unitSchema = z.object({
  id:        z.string(),
  unitId:    z.string(),
  label:     z.string(),
  ownerName: z.string().nullable(),
  phone:     z.string().nullable(),
  email:     z.string().nullable(),
  feeAmount: z.string().transform((v) => BigInt(v)),
  active:    z.boolean(),
});

export type Unit = z.infer<typeof unitSchema>;

export interface UnitInput {
  unitId:    string;
  label:     string;
  ownerName: string | null;
  phone:     string | null;
  email:     string | null;
  feeAmount: number;
}

export function useUnits() {
  return useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const { data } = await api.get('/units');
      return z.array(unitSchema).parse(data);
    },
    staleTime: 60_000,
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UnitInput) => api.post('/units', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['units'] }),
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<UnitInput & { active: boolean }>) =>
      api.put(`/units/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['units'] }),
  });
}

export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/units/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['units'] }),
  });
}

export function useImportUnits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (units: UnitInput[]) => api.post('/units/import', { units }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['units'] }),
  });
}
