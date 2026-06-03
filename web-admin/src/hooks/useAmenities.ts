import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/lib/api';
import { amenitySchema, amenityBookingSchema, type Amenity, type AmenityBooking } from '@/lib/schemas';

// ── Amenities ─────────────────────────────────────────────────────────────────

export function useAmenities() {
  return useQuery({
    queryKey: ['amenities'],
    queryFn: async () => {
      const { data } = await api.get('/amenities');
      return z.array(amenitySchema).parse(data);
    },
    staleTime: 60_000,
  });
}

interface AmenityPayload {
  name:        string;
  description?: string | null;
  icon?:        string | null;
  capacity?:    number;
  openTime?:    string;
  closeTime?:   string;
  slotMinutes?: number;
  advanceDays?: number;
}

export function useCreateAmenity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AmenityPayload) => {
      const { data } = await api.post('/amenities', payload);
      return amenitySchema.parse(data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['amenities'] }); },
  });
}

export function useUpdateAmenity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: AmenityPayload & { id: string }) => {
      const { data } = await api.put(`/amenities/${id}`, body);
      return amenitySchema.parse(data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['amenities'] }); },
  });
}

export function useDeactivateAmenity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/amenities/${id}`);
      return amenitySchema.parse(data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['amenities'] }); },
  });
}

// ── Bookings ──────────────────────────────────────────────────────────────────

interface BookingFilter {
  amenityId?: string;
  status?:    AmenityBooking['status'];
  dateFrom?:  string;
  dateTo?:    string;
  limit?:     number;
}

export function useAmenityBookings(filter: BookingFilter = {}) {
  return useQuery({
    queryKey: ['amenity-bookings', filter],
    queryFn: async () => {
      const { data } = await api.get('/amenities/bookings', { params: filter });
      return z.array(amenityBookingSchema).parse(data);
    },
    staleTime: 20_000,
  });
}

interface CreateBookingPayload {
  amenityId:     string;
  unitId?:       string | null;
  unitLabel?:    string | null;
  residentName:  string;
  residentPhone?: string | null;
  date:          string;
  startTime:     string;
  endTime:       string;
  attendees?:    number;
  notes?:        string | null;
}

export function useCreateAmenityBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateBookingPayload) => {
      const { data } = await api.post('/amenities/bookings', payload);
      return amenityBookingSchema.parse(data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['amenity-bookings'] }); },
  });
}

export function useApproveBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/amenities/bookings/${id}/approve`);
      return amenityBookingSchema.parse(data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['amenity-bookings'] }); },
  });
}

export function useRejectBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, adminNotes }: { id: string; adminNotes?: string | null }) => {
      const { data } = await api.patch(`/amenities/bookings/${id}/reject`, { adminNotes });
      return amenityBookingSchema.parse(data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['amenity-bookings'] }); },
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/amenities/bookings/${id}/cancel`);
      return amenityBookingSchema.parse(data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['amenity-bookings'] }); },
  });
}

// Re-export types
export type { Amenity, AmenityBooking };
