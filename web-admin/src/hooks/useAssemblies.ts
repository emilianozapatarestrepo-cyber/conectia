import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/lib/api';

// ── Schemas ───────────────────────────────────────────────────────────────────

const assemblyStatusEnum  = z.enum(['borrador', 'convocada', 'en_curso', 'cerrada']);
const assemblyTypeEnum    = z.enum(['ordinaria', 'extraordinaria']);
const agendaItemTypeEnum  = z.enum(['informativo', 'votacion']);
const attendanceModeEnum  = z.enum(['presencial', 'virtual', 'poder']);
export const voteValueEnum = z.enum(['a_favor', 'en_contra', 'abstencion']);

const assemblySummarySchema = z.object({
  id:                z.string(),
  type:              assemblyTypeEnum,
  title:             z.string(),
  status:            assemblyStatusEnum,
  scheduledDate:     z.string().nullable(),
  scheduledTime:     z.string().nullable(),
  location:          z.string().nullable(),
  quorumPct:         z.string(),
  totalCoefficient:  z.string().nullable(),
  createdAt:         z.string(),
});

const agendaVotesSchema = z.object({
  a_favor:    z.object({ count: z.number(), coefficient: z.number() }),
  en_contra:  z.object({ count: z.number(), coefficient: z.number() }),
  abstencion: z.object({ count: z.number(), coefficient: z.number() }),
  totalVoted: z.number(),
  approved:   z.boolean().nullable(),
}).nullable();

const agendaItemSchema = z.object({
  id:               z.string(),
  assemblyId:       z.string(),
  order:            z.number(),
  title:            z.string(),
  description:      z.string().nullable(),
  type:             agendaItemTypeEnum,
  requiredMajority: z.string(),
  resolvedStatus:   z.string().nullable(),
  createdAt:        z.string(),
  votes:            agendaVotesSchema,
});

const attendanceSchema = z.object({
  id:             z.string(),
  unitId:         z.string(),
  unitLabel:      z.string(),
  ownerName:      z.string().nullable(),
  coefficient:    z.string(),
  attendanceMode: attendanceModeEnum,
  delegateName:   z.string().nullable(),
  registeredAt:   z.string(),
});

const quorumSchema = z.object({
  totalCoefficient:    z.number(),
  presentCoefficient:  z.number(),
  quorumPct:           z.number(),
  quorumReached:       z.boolean(),
  attendanceCount:     z.number(),
  presentPct:          z.number(),
});

const assemblyDetailSchema = z.object({
  assembly:    assemblySummarySchema.extend({
    scheduledDate:      z.string().nullable(),
    notes:              z.string().nullable(),
    minutesText:        z.string().nullable(),
    minutesApprovedAt:  z.string().nullable(),
  }),
  quorum:      quorumSchema,
  agenda:      z.array(agendaItemSchema),
  attendances: z.array(attendanceSchema),
});

export type AssemblySummary    = z.output<typeof assemblySummarySchema>;
export type AssemblyDetail     = z.output<typeof assemblyDetailSchema>;
export type AssemblyAgendaItem = z.output<typeof agendaItemSchema>;
export type AssemblyAttendance = z.output<typeof attendanceSchema>;
export type AssemblyQuorum     = z.output<typeof quorumSchema>;
export type AssemblyStatus     = z.output<typeof assemblyStatusEnum>;
export type AssemblyType       = z.output<typeof assemblyTypeEnum>;
export type AgendaItemType     = z.output<typeof agendaItemTypeEnum>;
export type AttendanceMode     = z.output<typeof attendanceModeEnum>;
export type VoteValue          = z.output<typeof voteValueEnum>;

// ── Queries ───────────────────────────────────────────────────────────────────

export function useAssembliesList(status?: AssemblyStatus) {
  return useQuery({
    queryKey: ['assemblies', { status }],
    queryFn: async () => {
      const params = status ? { status } : {};
      const { data } = await api.get('/assemblies', { params });
      return z.array(assemblySummarySchema).parse(data);
    },
    staleTime: 30_000,
  });
}

export function useAssemblyDetail(id: string | null) {
  return useQuery({
    queryKey: ['assemblies', id, 'detail'],
    queryFn: async () => {
      const { data } = await api.get(`/assemblies/${id}`);
      return assemblyDetailSchema.parse(data);
    },
    enabled: !!id,
    staleTime: 10_000,
    refetchInterval: 15_000,  // live quorum + vote updates during active assembly
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateAssembly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      type?: AssemblyType; title: string; scheduledDate?: string | null;
      scheduledTime?: string | null; location?: string | null;
      quorumPct?: number; notes?: string | null;
    }) => {
      const { data } = await api.post('/assemblies', payload);
      return assemblySummarySchema.parse(data);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assemblies'] }),
  });
}

export function useUpdateAssembly(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Parameters<ReturnType<typeof useCreateAssembly>['mutateAsync']>[0]>) => {
      const { data } = await api.put(`/assemblies/${id}`, payload);
      return assemblySummarySchema.parse(data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assemblies'] });
      void qc.invalidateQueries({ queryKey: ['assemblies', id, 'detail'] });
    },
  });
}

export function useStartAssembly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/assemblies/${id}/start`);
      return assemblySummarySchema.parse(data);
    },
    onSuccess: (_d, id) => {
      void qc.invalidateQueries({ queryKey: ['assemblies'] });
      void qc.invalidateQueries({ queryKey: ['assemblies', id, 'detail'] });
    },
  });
}

export function useCloseAssembly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/assemblies/${id}/close`);
      return assemblySummarySchema.parse(data);
    },
    onSuccess: (_d, id) => {
      void qc.invalidateQueries({ queryKey: ['assemblies'] });
      void qc.invalidateQueries({ queryKey: ['assemblies', id, 'detail'] });
    },
  });
}

export function useSaveMinutes(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { minutesText: string; approve?: boolean }) => {
      const { data } = await api.patch(`/assemblies/${id}/minutes`, payload);
      return data as { id: string; minutesText: string | null; minutesApprovedAt: string | null };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assemblies', id, 'detail'] }),
  });
}

export function useAddAgendaItem(assemblyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      title: string; description?: string | null; type?: AgendaItemType;
      requiredMajority?: number; order?: number;
    }) => {
      const { data } = await api.post(`/assemblies/${assemblyId}/agenda`, payload);
      return data as AssemblyAgendaItem;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assemblies', assemblyId, 'detail'] }),
  });
}

export function useUpdateAgendaItem(assemblyId: string, itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title?: string; description?: string | null; requiredMajority?: number; order?: number }) => {
      const { data } = await api.put(`/assemblies/${assemblyId}/agenda/${itemId}`, payload);
      return data as AssemblyAgendaItem;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assemblies', assemblyId, 'detail'] }),
  });
}

export function useDeleteAgendaItem(assemblyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      await api.delete(`/assemblies/${assemblyId}/agenda/${itemId}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assemblies', assemblyId, 'detail'] }),
  });
}

export function useResolveAgendaItem(assemblyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { itemId: string; resolvedStatus: 'aprobado' | 'rechazado' | 'abstencion' | null }) => {
      await api.patch(`/assemblies/${assemblyId}/agenda/${payload.itemId}/resolve`, {
        resolvedStatus: payload.resolvedStatus,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assemblies', assemblyId, 'detail'] }),
  });
}

export function useRegisterAttendance(assemblyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { unitId: string; attendanceMode?: AttendanceMode; delegateName?: string | null }) => {
      const { data } = await api.post(`/assemblies/${assemblyId}/attendances`, payload);
      return data as AssemblyAttendance;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assemblies', assemblyId, 'detail'] }),
  });
}

export function useRemoveAttendance(assemblyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (unitId: string) => {
      await api.delete(`/assemblies/${assemblyId}/attendances/${unitId}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assemblies', assemblyId, 'detail'] }),
  });
}

export function useCastVote(assemblyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { agendaItemId: string; unitId: string; vote: VoteValue }) => {
      const { data } = await api.post(`/assemblies/${assemblyId}/votes`, payload);
      return data as { agendaItemId: string; approved: boolean | null };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assemblies', assemblyId, 'detail'] }),
  });
}
