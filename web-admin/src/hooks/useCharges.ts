import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { z } from 'zod';
import { chargeSchema } from '@/lib/schemas';

interface ChargeFilter { period?: string; status?: string; unitId?: string }

export function useCharges(filter: ChargeFilter = {}, refetchInterval?: number) {
  return useQuery({
    queryKey: ['charges', filter],
    queryFn: async () => {
      const { data } = await api.get('/charges', { params: filter });
      return z.array(chargeSchema).parse(data);
    },
    staleTime: 30_000,
    refetchInterval,
  });
}

interface BatchChargesPayload {
  useRoster: true;
  concept: string;
  dueDate: string;
  periodId: string | null;
}

interface BatchResult { created: number; failed: number; total: number }

export function useBatchCharges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BatchChargesPayload): Promise<BatchResult> => {
      const { data } = await api.post<BatchResult>('/charges/batch', payload);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['charges'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

interface CreateChargePayload {
  unitId: string;
  unitLabel: string;
  ownerName: string | null;
  userId: string;
  amount: number;
  concept: string;
  dueDate: string;
  periodId: string | null;
}

export function useCreateCharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateChargePayload) => {
      const { data } = await api.post('/charges', payload);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['charges'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

interface PaymentLinkResult { checkoutUrl: string; reference: string }

export function usePaymentLink() {
  return useMutation({
    mutationFn: async (chargeId: string): Promise<PaymentLinkResult> => {
      const { data } = await api.post<PaymentLinkResult>(`/charges/${chargeId}/payment-link`);
      return data;
    },
  });
}
