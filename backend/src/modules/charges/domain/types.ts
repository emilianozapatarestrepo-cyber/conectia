export interface Charge {
  id: string;
  tenantId: string;
  periodId: string | null;
  unitId: string;
  unitLabel: string;
  ownerName: string | null;
  amount: bigint;
  currency: string;
  concept: string;
  dueDate: Date;
  status: 'pending' | 'paid' | 'overdue' | 'waived';
  paidAt: Date | null;
}

export interface PaymentIntent {
  id: string;
  tenantId: string;
  chargeId: string | null;
  unitId: string;
  amount: bigint;
  status: 'pending' | 'approved' | 'declined' | 'expired' | 'manual';
  comprobanteUrl: string | null;
  createdAt: Date;
}

export interface ChargeFilter {
  period?: string;    // YYYY-MM
  unitId?: string;
  status?: 'pending' | 'paid' | 'overdue' | 'all';
  limit?: number;
  offset?: number;
}
