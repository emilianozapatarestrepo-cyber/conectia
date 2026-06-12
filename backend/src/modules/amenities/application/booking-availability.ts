import { sql } from 'kysely';
import { db } from '../../../shared/database/db.js';
import type { NewAmenityBooking, AmenityBooking } from '../../../shared/database/schema.js';

export interface AmenityMeta {
  id:          string;
  name:        string;
  capacity:    number;
  openTime:    string;
  closeTime:   string;
  slotMinutes: number;
  advanceDays: number;
}

/** Fetches an active amenity's booking rules, tenant-scoped. */
export async function getAmenityMeta(
  tenantId: string,
  amenityId: string,
): Promise<AmenityMeta | null> {
  const row = await db
    .selectFrom('amenities')
    .select(['id', 'name', 'capacity', 'openTime', 'closeTime', 'slotMinutes', 'advanceDays'])
    .where('id', '=', amenityId)
    .where('tenantId', '=', tenantId)
    .where('active', '=', true)
    .executeTakeFirst();
  return row ?? null;
}

export type CreateBookingResult =
  | { ok: true; row: AmenityBooking }
  | { ok: false; reason: 'amenity_not_found' | 'slot_taken' };

/**
 * Atomically checks slot availability and inserts the booking.
 *
 * Runs inside a transaction holding pg_advisory_xact_lock keyed on
 * (amenity, date), so two concurrent requests for the same slot serialize:
 * the overlap count the second request sees already includes the first
 * insert. Shared by the admin API and the resident portal so the rules can
 * never drift apart.
 */
export async function createBookingIfAvailable(
  values: NewAmenityBooking,
): Promise<CreateBookingResult> {
  return db.transaction().execute(async (trx) => {
    // Serialize bookings per (amenity, date). hashtextextended gives a
    // stable 64-bit key; the lock releases automatically on COMMIT/ROLLBACK.
    await sql`SELECT pg_advisory_xact_lock(
      hashtextextended(${values.amenityId} || '|' || ${String(values.date)}, 0)
    )`.execute(trx);

    const amenity = await trx
      .selectFrom('amenities')
      .select(['id', 'capacity'])
      .where('id', '=', values.amenityId)
      .where('tenantId', '=', values.tenantId)
      .where('active', '=', true)
      .executeTakeFirst();

    if (!amenity) return { ok: false as const, reason: 'amenity_not_found' as const };

    const overlapping = await trx
      .selectFrom('amenityBookings')
      .select('id')
      .where('amenityId', '=', values.amenityId)
      .where('tenantId', '=', values.tenantId)
      .where('date', '=', values.date as unknown as Date)
      .where('status', 'in', ['pendiente', 'aprobada'])
      .where((eb) => eb.or([
        // new booking starts during existing
        eb.and([
          eb('startTime', '<=', values.startTime),
          eb('endTime', '>', values.startTime),
        ]),
        // new booking ends during existing
        eb.and([
          eb('startTime', '<', values.endTime),
          eb('endTime', '>=', values.endTime),
        ]),
        // new booking completely covers existing
        eb.and([
          eb('startTime', '>=', values.startTime),
          eb('endTime', '<=', values.endTime),
        ]),
      ]))
      .execute();

    if (overlapping.length >= amenity.capacity) {
      return { ok: false as const, reason: 'slot_taken' as const };
    }

    const row = await trx
      .insertInto('amenityBookings')
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow();

    return { ok: true as const, row };
  });
}
