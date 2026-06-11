import { sql } from 'kysely';
import { db } from '../../../shared/database/db.js';
import type { ReminderType } from '../../../shared/database/schema.js';

// Reminder schedule: days past due_date when each reminder fires
const REMINDER_DAYS: Record<ReminderType, number> = {
  D1:  1,
  D7:  7,
  D30: 30,
};

/**
 * Called nightly by the cron job.
 * For each overdue charge that doesn't yet have a reminder of a given type,
 * creates a pending reminder if `scheduledFor` ≤ today.
 *
 * Idempotent: the UNIQUE (charge_id, reminder_type) constraint means re-running
 * the cron safely skips already-created reminders via INSERT … ON CONFLICT DO NOTHING.
 */
export async function generateOverdueReminders(tenantId: string): Promise<{ created: number }> {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })
    .format(new Date());

  let created = 0;

  for (const [type, daysAfterDue] of Object.entries(REMINDER_DAYS) as [ReminderType, number][]) {
    // Find overdue charges where:
    //   - status is overdue or partial
    //   - due_date + daysAfterDue <= today (reminder is now due)
    //   - unit has a phone number (no point reminding if we can't reach them)
    //   - no reminder of this type exists yet (handled by ON CONFLICT below)
    const candidates = await db
      .selectFrom('charges as c')
      .innerJoin('units as u', (join) =>
        join
          .onRef('u.unitId', '=', 'c.unitId')
          .on('u.tenantId', '=', tenantId)
          .on('u.active', '=', true)
      )
      .select([
        'c.id as chargeId',
        'c.unitId',
        'c.concept',
        'c.amount',
        'c.paidAmount',
        'c.dueDate',
        'u.label as unitLabel',
        'u.ownerName',
        'u.phone',
      ])
      .where('c.tenantId', '=', tenantId)
      .where('c.status', 'in', ['overdue', 'partial'])
      .where('u.phone', 'is not', null)
      // due_date + interval is past today
      .where(
        sql<boolean>`(c.due_date + ${daysAfterDue} * INTERVAL '1 day')::DATE <= ${todayStr}::DATE`
      )
      .execute();

    const values = candidates
      .map((c) => {
        const outstanding = BigInt(String(c.amount)) - BigInt(String(c.paidAmount));
        if (outstanding <= 0n) return null;

        const dueDate = (c.dueDate instanceof Date
          ? c.dueDate.toISOString()
          : String(c.dueDate)).slice(0, 10);

        const scheduled = new Date(`${dueDate}T12:00:00Z`);
        scheduled.setUTCDate(scheduled.getUTCDate() + daysAfterDue);

        return {
          tenantId,
          chargeId:     c.chargeId,
          unitId:       c.unitId,
          unitLabel:    c.unitLabel ?? null,
          ownerName:    c.ownerName ?? null,
          phone:        c.phone ?? null,
          amountCents:  outstanding,
          concept:      c.concept,
          dueDate,
          reminderType: type,
          scheduledFor: scheduled.toISOString().slice(0, 10),
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (values.length > 0) {
      const inserted = await db
        .insertInto('chargeReminders')
        .values(values)
        .onConflict((oc) => oc.columns(['chargeId', 'reminderType']).doNothing())
        .returning('id')
        .execute();
      created += inserted.length;
    }
  }

  return { created };
}

/**
 * Mark a reminder as sent (manual via wa.me or API).
 * Returns false if the reminder doesn't belong to the tenant.
 */
export async function markReminderSent(
  tenantId: string,
  reminderId: string,
  via: 'manual' | 'whatsapp_link' | 'api',
): Promise<boolean> {
  const row = await db
    .updateTable('chargeReminders')
    .set({ status: 'sent', sentAt: new Date(), sentVia: via })
    .where('id', '=', reminderId)
    .where('tenantId', '=', tenantId)
    .where('status', '=', 'pending')
    .returning('id')
    .executeTakeFirst();
  return !!row;
}

/**
 * Skip a reminder (admin decided not to send it).
 */
export async function skipReminder(tenantId: string, reminderId: string): Promise<boolean> {
  const row = await db
    .updateTable('chargeReminders')
    .set({ status: 'skipped' })
    .where('id', '=', reminderId)
    .where('tenantId', '=', tenantId)
    .where('status', '=', 'pending')
    .returning('id')
    .executeTakeFirst();
  return !!row;
}

/** Build a pre-filled WhatsApp message for an overdue reminder. */
export function buildReminderWhatsAppUrl(opts: {
  phone:       string;
  ownerName:   string | null;
  unitLabel:   string | null;
  concept:     string;
  amountCents: bigint | string;
  daysOverdue: number;
  payUrl:      string;
}): string {
  const pesos = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(Number(opts.amountCents) / 100);

  const name    = opts.ownerName ? `Hola ${opts.ownerName.split(' ')[0]},` : 'Hola,';
  const urgency = opts.daysOverdue >= 30 ? '⚠️ Tu obligación lleva más de un mes vencida.'
    : opts.daysOverdue >= 7 ? 'Tu pago lleva varios días vencido.'
    : 'Tu pago venció ayer.';

  const text = `${name} ${urgency}\n\n`
    + `📋 *${opts.concept}*\n`
    + `🏠 Unidad: *${opts.unitLabel ?? 'N/D'}*\n`
    + `💰 Valor pendiente: *${pesos}*\n\n`
    + `Paga fácil y rápido aquí 👉 ${opts.payUrl}`;

  const normalized = opts.phone.replace(/\D/g, '');
  const full = normalized.startsWith('57') ? normalized : `57${normalized}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}
