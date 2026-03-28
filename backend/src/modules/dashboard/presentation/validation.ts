import { z } from 'zod';

export const summaryQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM').optional(),
});

export const trendQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});
