import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../shared/database/db.js';
import { env } from '../../../config/env.js';
import { resolvePortalToken, type PortalContext } from '../application/portal-token.service.js';
import { PaymentLinkUseCase } from '../../charges/application/payment-link.usecase.js';
import { getAmenityMeta, createBookingIfAvailable } from '../../amenities/application/booking-availability.js';
import { timeStr, dateStr, todayInBogota, bogotaDatePlusDays, toDateOnly } from '../../../shared/validation/datetime.js';

const paymentLinkUC = new PaymentLinkUseCase();

const createPqrsSchema = z.object({
  category:    z.enum(['peticion', 'queja', 'reclamo', 'sugerencia']),
  subject:     z.string().min(5).max(200),
  description: z.string().min(20).max(5000),
});

const createBookingSchema = z.object({
  amenityId: z.string().uuid(),
  date:      dateStr,
  startTime: timeStr,
  endTime:   timeStr,
  attendees: z.number().int().min(1).max(100).default(1),
  notes:     z.string().max(1000).nullable().default(null),
});

/** Uniform 404 — never reveal whether a token exists but is revoked. */
function notFound(res: { status: (n: number) => { json: (b: unknown) => void } }): void {
  res.status(404).json({ error: 'Enlace no válido o vencido. Solicita uno nuevo a tu administración.' });
}

async function getUnit(ctx: PortalContext) {
  return db
    .selectFrom('units')
    .select(['unitId', 'label', 'ownerName'])
    .where('tenantId', '=', ctx.tenantId)
    .where('unitId', '=', ctx.unitId)
    .where('active', '=', true)
    .executeTakeFirst();
}

export function createPortalRouter(): Router {
  const router = Router();

  // ── GET /portal/:token — estado de cuenta + historial ──────────────────────
  router.get('/:token', async (req, res, next) => {
    try {
      const ctx = await resolvePortalToken(req.params['token'] ?? '');
      if (!ctx) { notFound(res); return; }

      const unit = await getUnit(ctx);
      if (!unit) { notFound(res); return; }

      const tenant = await db
        .selectFrom('tenants')
        .select(['name', 'address'])
        .where('id', '=', ctx.tenantId)
        .executeTakeFirstOrThrow();

      const openCharges = await db
        .selectFrom('charges')
        .select(['id', 'concept', 'amount', 'paidAmount', 'dueDate', 'status'])
        .where('tenantId', '=', ctx.tenantId)
        .where('unitId', '=', ctx.unitId)
        .where('status', 'in', ['active', 'overdue', 'partial'])
        .orderBy('dueDate', 'asc')
        .execute();

      const paidCharges = await db
        .selectFrom('charges')
        .select(['id', 'concept', 'amount', 'paidAt'])
        .where('tenantId', '=', ctx.tenantId)
        .where('unitId', '=', ctx.unitId)
        .where('status', '=', 'paid')
        .orderBy('paidAt', 'desc')
        .limit(12)
        .execute();

      const toCents = (v: bigint | string): bigint =>
        typeof v === 'bigint' ? v : BigInt(String(v));

      let totalDue = 0n;
      const pending = openCharges.map((c) => {
        const due = toCents(c.amount) - toCents(c.paidAmount);
        totalDue += due > 0n ? due : 0n;
        return {
          id:        c.id,
          concept:   c.concept,
          amountDue: due.toString(),
          dueDate:   c.dueDate instanceof Date ? c.dueDate.toISOString().slice(0, 10) : String(c.dueDate).slice(0, 10),
          status:    c.status,
        };
      });

      res.json({
        building: { name: tenant.name, address: tenant.address ?? null },
        unit:     { unitId: unit.unitId, label: unit.label, ownerName: unit.ownerName },
        totalDueCents: totalDue.toString(),
        pendingCharges: pending,
        paymentHistory: paidCharges.map((c) => ({
          id:          c.id,
          concept:     c.concept,
          amountCents: toCents(c.amount).toString(),
          paidAt:      c.paidAt instanceof Date ? c.paidAt.toISOString() : c.paidAt,
        })),
      });
    } catch (err) { next(err); }
  });

  // ── POST /portal/:token/pay/:chargeId — link de pago Wompi ─────────────────
  router.post('/:token/pay/:chargeId', async (req, res, next) => {
    try {
      const ctx = await resolvePortalToken(req.params['token'] ?? '');
      if (!ctx) { notFound(res); return; }

      const chargeId = z.string().uuid().parse(req.params['chargeId']);

      // Charge MUST belong to this unit AND be in a payable state —
      // never trust the path param alone; also avoids calling Wompi for stale intents
      const charge = await db
        .selectFrom('charges')
        .select(['id', 'unitId', 'status'])
        .where('id', '=', chargeId)
        .where('tenantId', '=', ctx.tenantId)
        .where('unitId', '=', ctx.unitId)
        .executeTakeFirst();

      if (!charge) {
        res.status(404).json({ error: 'Cargo no encontrado' });
        return;
      }

      if (charge.status === 'paid') {
        res.status(409).json({ error: 'Este cargo ya fue pagado' });
        return;
      }
      if (charge.status === 'cancelled' || charge.status === 'written_off') {
        res.status(409).json({ error: 'Este cargo no está disponible para pago' });
        return;
      }

      const link = await paymentLinkUC.execute({
        tenantId: ctx.tenantId,
        chargeId,
        actorId:  `portal:${ctx.unitId}`,
      });

      const appUrl = env.APP_URL ?? '';
      res.json({
        payUrl:   appUrl ? `${appUrl}/pay/${link.reference}` : link.url,
        wompiUrl: link.url,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'CHARGE_ALREADY_PAID') {
        res.status(409).json({ error: 'Este cargo ya fue pagado' });
        return;
      }
      if (err instanceof Error && err.message === 'CHARGE_NOT_PAYABLE') {
        res.status(409).json({ error: 'Este cargo no está disponible para pago' });
        return;
      }
      next(err);
    }
  });

  // ── GET /portal/:token/announcements ────────────────────────────────────────
  router.get('/:token/announcements', async (req, res, next) => {
    try {
      const ctx = await resolvePortalToken(req.params['token'] ?? '');
      if (!ctx) { notFound(res); return; }

      const rows = await db
        .selectFrom('announcementRecipients as r')
        .innerJoin('announcements as a', 'a.id', 'r.announcementId')
        .select(['a.id', 'a.title', 'a.body', 'a.publishedAt'])
        .where('r.tenantId', '=', ctx.tenantId)
        .where('r.unitId', '=', ctx.unitId)
        .where('a.status', '=', 'publicado')
        .orderBy('a.publishedAt', 'desc')
        .limit(20)
        .execute();

      res.json(rows);
    } catch (err) { next(err); }
  });

  // ── GET /portal/:token/pqrs ──────────────────────────────────────────────────
  router.get('/:token/pqrs', async (req, res, next) => {
    try {
      const ctx = await resolvePortalToken(req.params['token'] ?? '');
      if (!ctx) { notFound(res); return; }

      const rows = await db
        .selectFrom('pqrs')
        .select(['id', 'category', 'subject', 'description', 'status', 'adminResponse', 'respondedAt', 'createdAt'])
        .where('tenantId', '=', ctx.tenantId)
        .where('unitId', '=', ctx.unitId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .execute();

      res.json(rows);
    } catch (err) { next(err); }
  });

  // ── POST /portal/:token/pqrs — radicar desde el portal ─────────────────────
  router.post('/:token/pqrs', async (req, res, next) => {
    try {
      const ctx = await resolvePortalToken(req.params['token'] ?? '');
      if (!ctx) { notFound(res); return; }

      const unit = await getUnit(ctx);
      if (!unit) { notFound(res); return; }

      const body = createPqrsSchema.parse(req.body);

      // Anti-abuse: max 5 open PQRS per unit from the portal
      const openCount = await db
        .selectFrom('pqrs')
        .select((eb) => eb.fn.count<string>('id').as('count'))
        .where('tenantId', '=', ctx.tenantId)
        .where('unitId', '=', ctx.unitId)
        .where('status', 'in', ['abierta', 'en_proceso'])
        .executeTakeFirst();

      if (Number(openCount?.count ?? 0) >= 5) {
        res.status(429).json({
          error: 'Ya tienes 5 solicitudes abiertas. Espera respuesta de la administración antes de radicar otra.',
        });
        return;
      }

      const row = await db
        .insertInto('pqrs')
        .values({
          tenantId:      ctx.tenantId,
          unitId:        ctx.unitId,
          unitLabel:     unit.label,
          category:      body.category,
          subject:       body.subject,
          description:   body.description,
          status:        'abierta',
          priority:      'media',
          submittedBy:   unit.ownerName ?? `Residente ${unit.label}`,
          submittedByPhone: null,
          submitterType: 'residente',
        })
        .returning(['id', 'category', 'subject', 'status', 'createdAt'])
        .executeTakeFirstOrThrow();

      res.status(201).json(row);
    } catch (err) { next(err); }
  });

  // ── GET /portal/:token/amenities ─────────────────────────────────────────────
  router.get('/:token/amenities', async (req, res, next) => {
    try {
      const ctx = await resolvePortalToken(req.params['token'] ?? '');
      if (!ctx) { notFound(res); return; }

      const rows = await db
        .selectFrom('amenities')
        .select(['id', 'name', 'description', 'icon', 'capacity', 'openTime', 'closeTime', 'slotMinutes', 'advanceDays'])
        .where('tenantId', '=', ctx.tenantId)
        .where('active', '=', true)
        .orderBy('name', 'asc')
        .execute();

      res.json(rows);
    } catch (err) { next(err); }
  });

  // ── GET /portal/:token/bookings — reservas de mi unidad ────────────────────
  router.get('/:token/bookings', async (req, res, next) => {
    try {
      const ctx = await resolvePortalToken(req.params['token'] ?? '');
      if (!ctx) { notFound(res); return; }

      const rows = await db
        .selectFrom('amenityBookings as b')
        .innerJoin('amenities as a', 'a.id', 'b.amenityId')
        .select([
          'b.id', 'b.date', 'b.startTime', 'b.endTime', 'b.attendees',
          'b.status', 'b.notes', 'b.adminNotes', 'b.createdAt',
          'a.name as amenityName', 'a.icon as amenityIcon',
        ])
        .where('b.tenantId', '=', ctx.tenantId)
        .where('b.unitId', '=', ctx.unitId)
        .orderBy('b.date', 'desc')
        .limit(20)
        .execute();

      res.json(rows.map((r) => ({ ...r, date: toDateOnly(r.date) })));
    } catch (err) { next(err); }
  });

  // ── POST /portal/:token/bookings — solicitar reserva ───────────────────────
  router.post('/:token/bookings', async (req, res, next) => {
    try {
      const ctx = await resolvePortalToken(req.params['token'] ?? '');
      if (!ctx) { notFound(res); return; }

      const unit = await getUnit(ctx);
      if (!unit) { notFound(res); return; }

      const body = createBookingSchema.parse(req.body);

      if (body.endTime <= body.startTime) {
        res.status(422).json({ error: 'La hora de fin debe ser posterior a la de inicio' });
        return;
      }

      // Fetch amenity rules — needed for hours + advance-window checks.
      // getAmenityMeta also verifies active=true and tenant scope.
      const amenity = await getAmenityMeta(ctx.tenantId, body.amenityId);
      if (!amenity) {
        res.status(404).json({ error: 'Zona no encontrada' });
        return;
      }

      // Bogotá-local dates — UTC "today" is wrong at 7 pm Bogotá (UTC-5)
      const todayStr = todayInBogota();
      const maxDate  = bogotaDatePlusDays(amenity.advanceDays);

      if (body.date < todayStr) {
        res.status(422).json({ error: 'No puedes reservar en fechas pasadas' });
        return;
      }
      if (body.date > maxDate) {
        res.status(422).json({ error: `Solo puedes reservar con máximo ${amenity.advanceDays} días de anticipación` });
        return;
      }

      const open  = amenity.openTime.slice(0, 5);
      const close = amenity.closeTime.slice(0, 5);
      if (body.startTime < open || body.endTime > close) {
        res.status(422).json({ error: `Horario de la zona: ${open} a ${close}` });
        return;
      }

      // Anti-abuse: max 3 pending requests per unit
      const pendingCount = await db
        .selectFrom('amenityBookings')
        .select((eb) => eb.fn.count<string>('id').as('count'))
        .where('tenantId', '=', ctx.tenantId)
        .where('unitId', '=', ctx.unitId)
        .where('status', '=', 'pendiente')
        .executeTakeFirst();

      if (Number(pendingCount?.count ?? 0) >= 3) {
        res.status(429).json({
          error: 'Ya tienes 3 solicitudes pendientes de aprobación. Espera a que la administración las revise.',
        });
        return;
      }

      // Atomic capacity check + insert — advisory lock prevents double-booking
      const result = await createBookingIfAvailable({
        tenantId:     ctx.tenantId,
        amenityId:    body.amenityId,
        unitId:       ctx.unitId,
        unitLabel:    unit.label,
        residentName: unit.ownerName ?? `Residente ${unit.label}`,
        residentPhone: null,
        date:         body.date,
        startTime:    body.startTime,
        endTime:      body.endTime,
        attendees:    body.attendees,
        notes:        body.notes,
      });

      if (!result.ok) {
        res.status(409).json({ error: 'Horario no disponible. La zona ya alcanzó su capacidad máxima en ese horario.' });
        return;
      }

      res.status(201).json({ ...result.row, date: toDateOnly(result.row.date) });
    } catch (err) { next(err); }
  });

  return router;
}
