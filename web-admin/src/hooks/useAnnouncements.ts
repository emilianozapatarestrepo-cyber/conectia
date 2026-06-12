import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/lib/api';
import {
  announcementSchema, announcementRecipientSchema,
  type Announcement, type AnnouncementRecipient,
} from '@/lib/schemas';

export function useAnnouncements() {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: async () => {
      const { data } = await api.get('/announcements');
      return z.array(announcementSchema).parse(data);
    },
    staleTime: 30_000,
  });
}

export function useAudiencePreview(audience: 'todos' | 'morosos', enabled: boolean) {
  return useQuery({
    queryKey: ['announcements', 'preview-audience', audience],
    queryFn: async () => {
      const { data } = await api.get('/announcements/preview-audience', { params: { audience } });
      return z.object({ count: z.number(), withPhone: z.number() }).parse(data);
    },
    enabled,
    staleTime: 30_000,
  });
}

interface CreateAnnouncementPayload {
  title:    string;
  body:     string;
  audience: Announcement['audience'];
  unitIds?: string[] | null;
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateAnnouncementPayload) => {
      const { data } = await api.post('/announcements', payload);
      return announcementSchema.parse(data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['announcements'] }); },
  });
}

export function usePublishAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/announcements/${id}/publish`);
      return announcementSchema.parse(data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['announcements'] }); },
  });
}

export function useAnnouncementRecipients(id: string | null) {
  return useQuery({
    queryKey: ['announcements', id, 'recipients'],
    queryFn: async () => {
      const { data } = await api.get(`/announcements/${id}/recipients`);
      return z.array(announcementRecipientSchema).parse(data);
    },
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useMarkRecipientSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipientId: string) => {
      await api.patch(`/announcements/recipients/${recipientId}/sent`);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['announcements'] }); },
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/announcements/${id}`);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['announcements'] }); },
  });
}

export type { Announcement, AnnouncementRecipient };
