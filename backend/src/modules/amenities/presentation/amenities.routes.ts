import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../shared/database/db.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';
import { requireSubscription } from '../../billing/application/require-subscription.js';

const bookingStatusEnum = z.enum(['pendiente', 'aprobada', 'rechazada', 'cancelada']);

const createAmenitySchema = z.object({
  name:        z.string().min(2).max(100),
  description: z.string().max(500).nullable().default(null),
  icon:        z.string().max(10).nullable().default(null),
  capacity:    z.number().int().min(1).default(1),
  openTime:    z.string().regex(/^\d{2}:\d{2}$/).default('07:00'),
  closeTime:   z.string().regex(/^\d{2}:\d{2}$/).default('22:00'),
  slotMinutes: z.number().int().min(30).max(1440).default(120),
  advanceDays: z.number().int().min(1).max(365).default(30),
});

const createBookingSchema = z.object({
  amenityId:     z.string().uuid(),
  unitId:        z.string().nullable().default(null),
  unitLabel:     z.string().nullable().default(null),
  residentName:  z.string().min(2).max(200),
  residentPhone: z.string().nullable().default(null),
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime:     z.string().regex(/^\d{2}:\d{2}$/),
  endTime:       z.string().regex(/^\d{2}:\d{2}$/),
  attendees:     z.number().int().min(1).default(1),
  notes:         z.string().max(1000).nullable().default(null),
});

export function createAmenitiesRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireTenant, requireSubscription);

  // ── GET /amenities ──────────────────────────────────────────────────────────
  router.get('/', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const rows = await db
        .selectFrom('amenities')
        .selectAll()
        .where('tenantId', '=', tenantId)
        .orderBy('name', 'asc')
        .execute();
      res.json(rows);
    } catch (err) { next(err); }
  });

  // ── POST /amenities ─────────────────────────────────────────────────────────
  router.post('/', requireAdmin, async (req, res, next) => {
    try {
      const body     = createAmenitySchema.parse(req.body);
      const tenantId = req.user!.tenantId!;
      const row = await db
        .insertInto('amenities')
        .values({ tenantId, ...body })
        .returningAll()
        .executeTakeFirstOrThrow();
      res.status(201).json(row);
    } catch (err) { next(err); }
  });

  // ── PUT /amenities/:id ──────────────────────────────────────────────────────
  router.put('/:id', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;
      const body     = createAmenitySchema.partial().parse(req.body);
      const row = await db
        .updateTable('amenities')
        .set(body)
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .returningAll()
        .executeTakeFirst();
      if (!row) { res.status(404).json({ error: 'Amenity not found' }); return; }
      res.json(row);
    } catch (err) { next(err); }
  });

  // ── DELETE /amenities/:id (soft-delete) ─────────────────────────────────────
  router.delete('/:id', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;
      const row = await db
        .updateTable('amenities')
        .set({ active: false })
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .returningAll()
        .executeTakeFirst();
      if (!row) { res.status(404).json({ error: 'Amenity not found' }); return; }
      res.json(row);
    } catch (err) { next(err); }
  });

  // ── GET /amenities/bookings ─────────────────────────────────────────────────
  router.get('/bookings', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const filter   = z.object({
        amenityId: z.string().uuid().optional(),
        status:    bookingStatusEnum.optional(),
        dateFrom:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dateTo:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        limit:     z.coerce.number().int().min(1).max(200).default(100),
        offset:    z.coerce.number().int().min(0).default(0),
      }).parse(req.query);

      let query = db
        .selectFrom('amenityBookings as b')
        .innerJoin('amenities as a', 'a.id', 'b.amenityId')
        .select([
          'b.id', 'b.amenityId', 'b.unitId', 'b.unitLabel',
          'b.residentName', 'b.residentPhone', 'b.date', 'b.startTime', 'b.endTime',
          'b.attendees', 'b.status', 'b.notes', 'b.adminNotes',
          'b.approvedBy', 'b.approvedAt', 'b.createdAt', 'b.updatedAt',
          'a.name as amenityName', 'a.icon as amenityIcon',
        ])
        .where('b.tenantId', '=', tenantId);

      if (filter.amenityId) query = query.where('b.amenityId', '=', filter.amenityId);
      if (filter.status)    query = query.where('b.status', '=', filter.status);
      if (filter.dateFrom)  query = query.where('b.date', '>=', filter.dateFrom as unknown as Date);
      if (filter.dateTo)    query = query.where('b.date', '<=', filter.dateTo as unknown as Date);

      const rows = await query
        .orderBy('b.date', 'asc')
        .orderBy('b.startTime', 'asc')
        .limit(filter.limit)
        .offset(filter.offset)
        .execute();

      res.json(rows);
    } catch (err) { next(err); }
  });

  // ── POST /amenities/bookings ────────────────────────────────────────────────
  router.post('/bookings', requireAdmin, async (req, res, next) => {
    try {
      const body     = createBookingSchema.parse(req.body);
      const tenantId = req.user!.tenantId!;

      // Verify amenity belongs to this tenant
      const amenity = await db
        .selectFrom('amenities')
        .select(['id', 'capacity'])
        .where('id', '=', body.amenityId)
        .where('tenantId', '=', tenantId)
        .where('active', '=', true)
        .executeTakeFirst();

      if (!amenity) {
        res.status(404).json({ error: 'Zona no encontrada' });
        return;
      }

      // Check for overlapping approved/pending bookings
      const overlapping = await db
        .selectFrom('amenityBookings')
        .select('id')
        .where('amenityId', '=', body.amenityId)
        .where('tenantId', '=', tenantId)
        .where('date', '=', body.date as unknown as Date)
        .where('status', 'in', ['pendiente', 'aprobada'])
        .where((eb) => eb.or([
          // new booking starts during existing
          eb.and([
            eb('startTime', '<=', body.startTime),
            eb('endTime', '>', body.startTime),
          ]),
          // new booking ends during existing
          eb.and([
            eb('startTime', '<', body.endTime),
            eb('endTime', '>=', body.endTime),
          ]),
          // new booking completely covers existing
          eb.and([
            eb('startTime', '>=', body.startTime),
            eb('endTime', '<=', body.endTime),
          ]),
        ]))
        .execute();

      if (overlapping.length >= amenity.capacity) {
        res.status(409).json({
          error: 'Horario no disponible. La zona ya alcanzó su capacidad máxima en ese horario.',
        });
        return;
      }

      const row = await db
        .insertInto('amenityBookings')
        .values({
          tenantId,
          amenityId:     body.amenityId,
          unitId:        body.unitId,
          unitLabel:     body.unitLabel,
          residentName:  body.residentName,
          residentPhone: body.residentPhone,
          date:          body.date,
          startTime:     body.startTime,
          endTime:       body.endTime,
          attendees:     body.attendees,
          notes:         body.notes,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json(row);
    } catch (err) { next(err); }
  });

  // ── PATCH /amenities/bookings/:id/approve ───────────────────────────────────
  router.patch('/bookings/:id/approve', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;
      const row = await db
        .updateTable('amenityBookings')
        .set({ status: 'aprobada', approvedBy: req.user!.uid, approvedAt: new Date() })
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .returningAll()
        .executeTakeFirst();
      if (!row) { res.status(404).json({ error: 'Reserva no encontrada' }); return; }
      res.json(row);
    } catch (err) { next(err); }
  });

  // ── PATCH /amenities/bookings/:id/reject ────────────────────────────────────
  router.patch('/bookings/:id/reject', requireAdmin, async (req, res, next) => {
    try {
      const id         = z.string().uuid().parse(req.params['id']);
      const tenantId   = req.user!.tenantId!;
      const { adminNotes } = z.object({
        adminNotes: z.string().max(500).nullable().default(null),
      }).parse(req.body);
      const row = await db
        .updateTable('amenityBookings')
        .set({ status: 'rechazada', adminNotes })
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .returningAll()
        .executeTakeFirst();
      if (!row) { res.status(404).json({ error: 'Reserva no encontrada' }); return; }
      res.json(row);
    } catch (err) { next(err); }
  });

  // ── PATCH /amenities/bookings/:id/cancel ────────────────────────────────────
  router.patch('/bookings/:id/cancel', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;
      const row = await db
        .updateTable('amenityBookings')
        .set({ status: 'cancelada' })
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .where('status', 'in', ['pendiente', 'aprobada'])
        .returningAll()
        .executeTakeFirst();
      if (!row) { res.status(404).json({ error: 'Reserva no encontrada o ya cerrada' }); return; }
      res.json(row);
    } catch (err) { next(err); }
  });

  return router;
}
