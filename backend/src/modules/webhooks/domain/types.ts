// Wompi event payload types
// Docs: https://docs.wompi.co/docs/en/events

export interface WompiTransactionEvent {
  event: string;            // 'transaction.updated'
  data: {
    transaction: {
      id: string;           // Wompi transaction ID (our providerRef)
      status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';
      amount_in_cents: number;
      currency: string;
      reference: string;    // Our idempotency_key — set when creating payment link
      customer_email: string | null;
      payment_method_type: string;
      finalized_at: string | null;
      created_at: string;
    };
  };
  environment: 'production' | 'sandbox';
  signature: {
    checksum: string;
    properties: string[];   // e.g. ['transaction.id', 'transaction.status', 'transaction.amount_in_cents']
  };
  timestamp: number;        // Unix seconds
}

export type WompiTransactionStatus = WompiTransactionEvent['data']['transaction']['status'];

export interface ReconcileResult {
  outcome: 'confirmed' | 'declined' | 'suspense' | 'duplicate' | 'ignored';
  chargeId?: string;
  paymentIntentId?: string;
  message: string;
}
