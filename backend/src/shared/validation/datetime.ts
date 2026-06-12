import { z } from 'zod';

/** Strict HH:MM (00:00–23:59). Loose `\d{2}:\d{2}` lets "23:99" reach a
 *  failing pg TIME cast → 500 on public endpoints. */
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Calendar-valid YYYY-MM-DD — round-trip check rejects e.g. 2026-02-31. */
export const dateStr = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, {
    message: 'Fecha inválida',
  });

/** Business "today" in the product timezone. `new Date().toISOString()` is
 *  UTC — at 19:01 in Bogotá (UTC-5) that is already tomorrow, which would
 *  wrongly reject same-day bookings every evening. */
export function todayInBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

/** Bogotá-local date N days from now (YYYY-MM-DD). */
export function bogotaDatePlusDays(days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })
    .format(new Date(Date.now() + days * 86_400_000));
}

/** pg DATE columns parse to JS Date at server-midnight; emit date-only
 *  strings so UTC-5 clients don't render the previous day. */
export function toDateOnly(d: Date | string): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}
