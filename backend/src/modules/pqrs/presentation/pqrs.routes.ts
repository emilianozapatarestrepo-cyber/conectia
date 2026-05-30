import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import { db } from '../../../shared/database/db.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';
import { requireSubscription } from '../../billing/application/require-subscription.js';

const categoryEnum = z.enum(['peticion', 'queja', 'reclamo', 'sugerencia']);
const statusEnum   = z.enum(['abierta', 'en_proceso', 'respondida', 'cerrada']);
const priorityEnum = z.enum(['baja', 'media', 'alta']);

const createPqrsSchema = z.object({
  unitId:           z.string().min(1).nullable().default(null),
  unitLabel:        z.string().min(1).nullable().default(null),
  category:         categoryEnum,
  subject:          z.string().min(5).max(200),
  description:      z.string().min(20),
  priority:         priorityEnum.default('media'),
  submittedBy:      z.string().min(1),
  submittedByPhone: z.string().nullable().default(null),
  submitterType:    z.enum(['residente', 'administrador', 'visitante']).default('residente'),
});

export function createPqrsRouter(): Router {
  const router = Router();

  router.use(requireAuth, requireTenant, requireSubscription);

  // GET /pqrs/stats — counts by status for KPI cards
  router.get('/stats', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;

      const byCounts = await db
        .selectFrom('pqrs')
        .select((eb) => ['status', eb.fn.count<string>('id').as('count')])
        .where('tenantId', '=', tenantId)
        .groupBy('status')
        .execute();

      let abierta = 0, en_proceso = 0, respondida = 0, cerrada = 0;
      for (const r of byCounts) {
        const n = Number(r.count);
        if (r.status === 'abierta')    abierta    = n;
        if (r.status === 'en_proceso') en_proceso = n;
        if (r.status === 'respondida') respondida = n;
        if (r.status === 'cerrada')    cerrada    = n;
      }

      const overdue = await db
        .selectFrom('pqrs')
        .select((eb) => eb.fn.count<string>('id').as('count'))
        .where('tenantId', '=', tenantId)
        .where('status', 'in', ['abierta', 'en_proceso'])
        .where('dueDate', '<', sql<Date>`CURRENT_DATE`)
        .executeTakeFirst();

      res.json({
        abierta,
        en_proceso,
        respondida,
        cerrada,
        total:   abierta + en_proceso + respondida + cerrada,
        overdue: Number(overdue?.count ?? 0),
      });
    } catch (err) { next(err); }
  });

  // GET /pqrs?status=&category=&priority=&limit=&offset=
  router.get('/', requireAdmin, async (req, res, next) => {
    try {
      const filter = z.object({
        status:   z.enum(['abierta', 'en_proceso', 'respondida', 'cerrada', 'all']).default('all'),
        category: z.enum(['peticion', 'queja', 'reclamo', 'sugerencia', 'all']).default('all'),
        priority: z.enum(['baja', 'media', 'alta', 'all']).default('all'),
        limit:    z.coerce.number().int().min(1).max(100).default(50),
        offset:   z.coerce.number().int().min(0).default(0),
      }).parse(req.query);

      const tenantId = req.user!.tenantId!;

      let query = db
        .selectFrom('pqrs')
        .selectAll()
        .where('tenantId', '=', tenantId);

      if (filter.status   !== 'all') query = query.where('status',   '=', filter.status);
      if (filter.category !== 'all') query = query.where('category', '=', filter.category);
      if (filter.priority !== 'all') query = query.where('priority', '=', filter.priority);

      const rows = await query
        .orderBy('createdAt', 'desc')
        .limit(filter.limit)
        .offset(filter.offset)
        .execute();

      res.json(rows);
    } catch (err) { next(err); }
  });

  // POST /pqrs — create a new PQRS entry (admin registers it on behalf of resident)
  router.post('/', requireAdmin, async (req, res, next) => {
    try {
      const body = createPqrsSchema.parse(req.body);
      const tenantId = req.user!.tenantId!;

      const row = await db
        .insertInto('pqrs')
        .values({
          tenantId,
          unitId:           body.unitId,
          unitLabel:        body.unitLabel,
          category:         body.category,
          subject:          body.subject,
          description:      body.description,
          status:           'abierta',
          priority:         body.priority,
          submittedBy:      body.submittedBy,
          submittedByPhone: body.submittedByPhone,
          submitterType:    body.submitterType,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json(row);
    } catch (err) { next(err); }
  });

  // GET /pqrs/:id
  router.get('/:id', requireAdmin, async (req, res, next) => {
    try {
      const id        = z.string().uuid().parse(req.params['id']);
      const tenantId  = req.user!.tenantId!;

      const row = await db
        .selectFrom('pqrs')
        .selectAll()
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: 'PQRS not found' }); return; }
      res.json(row);
    } catch (err) { next(err); }
  });

  // PATCH /pqrs/:id/respond — admin writes a formal response
  router.patch('/:id/respond', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;
      const body     = z.object({
        adminResponse: z.string().min(10),
        status:        z.enum(['respondida', 'en_proceso']).default('respondida'),
      }).parse(req.body);

      const row = await db
        .updateTable('pqrs')
        .set({
          adminResponse: body.adminResponse,
          status:        body.status,
          respondedAt:   new Date(),
          respondedBy:   req.user!.uid,
        })
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: 'PQRS not found' }); return; }
      res.json(row);
    } catch (err) { next(err); }
  });

  // PATCH /pqrs/:id/status — change status without a full response
  router.patch('/:id/status', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;
      const { status } = z.object({ status: statusEnum }).parse(req.body);

      const row = await db
        .updateTable('pqrs')
        .set({ status })
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: 'PQRS not found' }); return; }
      res.json(row);
    } catch (err) { next(err); }
  });

  return router;
}
