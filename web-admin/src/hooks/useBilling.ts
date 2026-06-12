import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { z } from 'zod';

export const subscriptionSchema = z.object({
  id:                z.string().optional(),
  planCode:          z.string(),
  planName:          z.string(),
  maxUnits:          z.number().nullable(),
  monthlyPriceCents: z.string().transform((v) => BigInt(v)),
  status:            z.enum(['trialing', 'active', 'past_due', 'cancelled', 'expired', 'no_subscription']),
  trialEndsAt:       z.string().nullable().transform((v) => (v ? new Date(v) : null)),
  currentPeriodEnd:  z.string().transform((v) => new Date(v)).optional(),
  daysRemaining:     z.number().optional(),
  isTrialing:        z.boolean().optional(),
  isActive:          z.boolean().optional(),
  isExpired:         z.boolean().optional(),
  features:          z.record(z.string(), z.unknown()).optional(),
});

export type BillingStatus = z.infer<typeof subscriptionSchema>;

export const planSchema = z.object({
  id:                z.string(),
  code:              z.string(),
  name:              z.string(),
  maxUnits:          z.number().nullable(),
  monthlyPriceCents: z.string().transform((v) => BigInt(v)),
  features:          z.record(z.string(), z.unknown()),
});
export type Plan = z.infer<typeof planSchema>;

export function useBilling() {
  return useQuery({
    queryKey: ['billing', 'status'],
    queryFn: async (): Promise<BillingStatus> => {
      const { data } = await api.get('/billing/status');
      return subscriptionSchema.parse(data);
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: async (): Promise<Plan[]> => {
      const { data } = await api.get('/billing/plans');
      return z.array(planSchema).parse(data);
    },
    staleTime: 10 * 60_000,
  });
}
