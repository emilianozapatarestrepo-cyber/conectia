import { z } from 'zod';

/** Validates a UUID string */
const uuid = z.string().uuid();

/** Validates a ledger line (one side of a double entry) */
const ledgerLineSchema = z.object({
  accountId: uuid,
  entryType: z.enum(['debit', 'credit']),
  amount: z
    .union([z.string(), z.number(), z.bigint()])
    .transform((val) => {
      const n = typeof val === 'bigint' ? val : BigInt(val);
      if (n <= 0n) throw new Error('Amount must be positive');
      return n;
    }),
  description: z.string().optional(),
});

/**
 * Schema for POST /api/v1/ledger/transactions
 *
 * SECURITY: tenantId is NOT accepted from the client.
 * It is resolved server-side by requireTenant middleware
 * (queries tenant_memberships) and injected via req.user.tenantId.
 */
export const postTransactionSchema = z.object({
  transactionType: z.enum([
    'charge',
    'payment',
    'adjustment',
    'reversal',
    'migration',
    'transfer',
    'fee',
    'settlement',
  ]),
  description: z.string().min(1).max(500),
  effectiveDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  periodId: uuid.optional(),
  idempotencyKey: uuid,
  currency: z.enum(['COP', 'USD']).optional(),
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
  lines: z.array(ledgerLineSchema).min(2),
  metadata: z.record(z.unknown()).optional(),
});

export type PostTransactionBody = z.infer<typeof postTransactionSchema>;

/**
 * Schema for GET /api/v1/ledger/balances/:accountId
 *
 * SECURITY: tenantId is NOT accepted from query params.
 * It comes from req.user.tenantId (resolved via DB).
 */
export const getAccountBalanceParamsSchema = z.object({
  accountId: uuid,
});
