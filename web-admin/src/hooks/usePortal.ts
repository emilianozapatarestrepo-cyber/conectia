import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { portalApi } from '@/lib/portalApi';

// ── Schemas (portal payloads are narrower than admin ones) ───────────────────

const portalSummarySchema = z.object({
  building: z.object({ name: z.string(), address: z.string().nullable() }),
  unit:     z.object({ unitId: z.string(), label: z.string(), ownerName: z.string().nullable() }),
  totalDueCents: z.string().transform((v) => BigInt(v)),
  pendingCharges: z.array(z.object({
    id:        z.string(),
    concept:   z.string(),
    amountDue: z.string().transform((v) => BigInt(v)),
    dueDate:   z.string(),
    status:    z.enum(['active', 'overdue', 'partial']),
  })),
  paymentHistory: z.array(z.object({
    id:          z.string(),
    concept:     z.string(),
    amountCents: z.string().transform((v) => BigInt(v)),
    paidAt:      z.string().nullable().transform((v) => (v ? new Date(v) : null)),
  })),
});

const portalAnnouncementSchema = z.object({
  id:          z.string(),
  title:       z.string(),
  body:        z.string(),
  publishedAt: z.string().nullable().transform((v) => (v ? new Date(v) : null)),
});

const portalPqrsSchema = z.object({
  id:            z.string(),
  category:      z.enum(['peticion', 'queja', 'reclamo', 'sugerencia']),
  subject:       z.string(),
  description:   z.string(),
  status:        z.enum(['abierta', 'en_proceso', 'respondida', 'cerrada']),
  adminResponse: z.string().nullable(),
  respondedAt:   z.string().nullable().transform((v) => (v ? new Date(v) : null)),
  createdAt:     z.string().transform((v) => new Date(v)),
});

const portalAmenitySchema = z.object({
  id:          z.string(),
  name:        z.string(),
  description: z.string().nullable(),
  icon:        z.string().nullable(),
  capacity:    z.number(),
  openTime:    z.string(),
  closeTime:   z.string(),
  slotMinutes: z.number(),
  advanceDays: z.number(),
});

const portalBookingSchema = z.object({
  id:          z.string(),
  date:        z.string(),  // YYYY-MM-DD — parse as local noon to avoid UTC midnight off-by-one
  startTime:   z.string(),
  endTime:     z.string(),
  attendees:   z.number(),
  status:      z.enum(['pendiente', 'aprobada', 'rechazada', 'cancelada']),
  notes:       z.string().nullable(),
  adminNotes:  z.string().nullable(),
  createdAt:   z.string().transform((v) => new Date(v)),
  amenityName: z.string(),
  amenityIcon: z.string().nullable(),
});

export type PortalSummary      = z.output<typeof portalSummarySchema>;
export type PortalAnnouncement = z.output<typeof portalAnnouncementSchema>;
export type PortalPqrs         = z.output<typeof portalPqrsSchema>;
export type PortalAmenity      = z.output<typeof portalAmenitySchema>;
export type PortalBooking      = z.output<typeof portalBookingSchema>;

// ── Queries ───────────────────────────────────────────────────────────────────

export function usePortalSummary(token: string) {
  return useQuery({
    queryKey: ['portal', token, 'summary'],
    queryFn: async () => {
      const { data } = await portalApi.get(`/portal/${token}`);
      return portalSummarySchema.parse(data);
    },
    staleTime: 30_000,
    retry: false,
  });
}

export function usePortalAnnouncements(token: string, enabled: boolean) {
  return useQuery({
    queryKey: ['portal', token, 'announcements'],
    queryFn: async () => {
      const { data } = await portalApi.get(`/portal/${token}/announcements`);
      return z.array(portalAnnouncementSchema).parse(data);
    },
    enabled,
    staleTime: 60_000,
  });
}

export function usePortalPqrs(token: string, enabled: boolean) {
  return useQuery({
    queryKey: ['portal', token, 'pqrs'],
    queryFn: async () => {
      const { data } = await portalApi.get(`/portal/${token}/pqrs`);
      return z.array(portalPqrsSchema).parse(data);
    },
    enabled,
    staleTime: 30_000,
  });
}

export function usePortalAmenities(token: string, enabled: boolean) {
  return useQuery({
    queryKey: ['portal', token, 'amenities'],
    queryFn: async () => {
      const { data } = await portalApi.get(`/portal/${token}/amenities`);
      return z.array(portalAmenitySchema).parse(data);
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function usePortalBookings(token: string, enabled: boolean) {
  return useQuery({
    queryKey: ['portal', token, 'bookings'],
    queryFn: async () => {
      const { data } = await portalApi.get(`/portal/${token}/bookings`);
      return z.array(portalBookingSchema).parse(data);
    },
    enabled,
    staleTime: 30_000,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function usePortalPay(token: string) {
  return useMutation({
    mutationFn: async (chargeId: string) => {
      const { data } = await portalApi.post(`/portal/${token}/pay/${chargeId}`);
      return z.object({ payUrl: z.string(), wompiUrl: z.string() }).parse(data);
    },
  });
}

export function usePortalCreatePqrs(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { category: PortalPqrs['category']; subject: string; description: string }) => {
      const { data } = await portalApi.post(`/portal/${token}/pqrs`, payload);
      return data as { id: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', token, 'pqrs'] });
    },
  });
}

export function usePortalCreateBooking(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      amenityId: string; date: string; startTime: string; endTime: string;
      attendees: number; notes?: string | null;
    }) => {
      const { data } = await portalApi.post(`/portal/${token}/bookings`, payload);
      return data as { id: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', token, 'bookings'] });
    },
  });
}
