import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReminderType   = 'D1' | 'D7' | 'D30';
export type ReminderStatus = 'pending' | 'sent' | 'skipped' | 'failed';

export const reminderSchema = z.object({
  id:           z.string().uuid(),
  tenantId:     z.string().uuid(),
  chargeId:     z.string().uuid(),
  unitId:       z.string(),
  unitLabel:    z.string().nullable(),
  ownerName:    z.string().nullable(),
  phone:        z.string().nullable(),
  amountCents:  z.string(),
  concept:      z.string(),
  dueDate:      z.string(),
  reminderType: z.enum(['D1', 'D7', 'D30']),
  status:       z.enum(['pending', 'sent', 'skipped', 'failed']),
  scheduledFor: z.string(),
  sentAt:       z.string().nullable().optional(),
  sentVia:      z.string().nullable().optional(),
  errorMsg:     z.string().nullable().optional(),
  createdAt:    z.string(),
  whatsappUrl:  z.string().nullable(),
});

export type Reminder = z.infer<typeof reminderSchema>;

const remindersResponseSchema = z.object({
  reminders: z.array(reminderSchema),
  total:     z.number(),
});

// ── Query ─────────────────────────────────────────────────────────────────────

interface RemindersFilter {
  status?: ReminderStatus;
  type?:   ReminderType;
  limit?:  number;
  offset?: number;
}

export function useReminders(filter: RemindersFilter = {}) {
  return useQuery({
    queryKey: ['reminders', filter],
    queryFn:  async () => {
      const { data } = await api.get('/charges/reminders', { params: filter });
      return remindersResponseSchema.parse(data);
    },
    staleTime: 30_000,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useMarkReminderSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, via = 'whatsapp_link' }: { id: string; via?: 'manual' | 'whatsapp_link' }) => {
      await api.patch(`/charges/reminders/${id}/send`, { via });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

export function useSkipReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/charges/reminders/${id}/skip`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}
