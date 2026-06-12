import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { z } from 'zod';
import { pqrsSchema, pqrsStatsSchema, type PqrsItem } from '@/lib/schemas';

interface PqrsFilter {
  status?:   string;
  category?: string;
  priority?: string;
  limit?:    number;
  offset?:   number;
}

export function usePqrs(filter: PqrsFilter = {}) {
  return useQuery({
    queryKey: ['pqrs', filter],
    queryFn: async () => {
      const { data } = await api.get('/pqrs', { params: filter });
      return z.array(pqrsSchema).parse(data);
    },
    staleTime: 30_000,
  });
}

export function usePqrsStats() {
  return useQuery({
    queryKey: ['pqrs', 'stats'],
    queryFn: async () => {
      const { data } = await api.get('/pqrs/stats');
      return pqrsStatsSchema.parse(data);
    },
    staleTime: 60_000,
  });
}

interface CreatePqrsPayload {
  unitId?:          string | null;
  unitLabel?:       string | null;
  category:         PqrsItem['category'];
  subject:          string;
  description:      string;
  priority:         PqrsItem['priority'];
  submittedBy:      string;
  submittedByPhone?: string | null;
  submitterType:    PqrsItem['submitterType'];
}

export function useCreatePqrs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreatePqrsPayload) => {
      const { data } = await api.post('/pqrs', payload);
      return pqrsSchema.parse(data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pqrs'] });
    },
  });
}

interface RespondPayload {
  id:            string;
  adminResponse: string;
  status:        'respondida' | 'en_proceso';
}

export function useRespondPqrs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: RespondPayload) => {
      const { data } = await api.patch(`/pqrs/${id}/respond`, body);
      return pqrsSchema.parse(data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pqrs'] });
    },
  });
}

export function useUpdatePqrsStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PqrsItem['status'] }) => {
      const { data } = await api.patch(`/pqrs/${id}/status`, { status });
      return pqrsSchema.parse(data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pqrs'] });
    },
  });
}
