import type { Charge, PaymentIntent, ChargeFilter } from './types.js';

export interface IChargesRepository {
  list(tenantId: string, filter: ChargeFilter): Promise<Charge[]>;
  getDelinquent(tenantId: string): Promise<Charge[]>;
  getPendingReconciliation(tenantId: string): Promise<PaymentIntent[]>;
  getPaymentIntent(tenantId: string, id: string): Promise<PaymentIntent | null>;
  approve(tenantId: string, paymentIntentId: string, actorId: string): Promise<void>;
  reject(tenantId: string, paymentIntentId: string, actorId: string, reason: string): Promise<void>;
}
