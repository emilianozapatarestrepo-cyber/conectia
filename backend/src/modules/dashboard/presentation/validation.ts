import { z } from 'zod';

// Shared period schema — reuse this everywhere
export const periodSchema = z.string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be YYYY-MM with valid month (01-12)');

export const summaryQuerySchema = z.object({
  period: periodSchema.optional(),
});

export const trendQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});
