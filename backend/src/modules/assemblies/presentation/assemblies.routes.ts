import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../shared/database/db.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';
import { requireSubscription } from '../../billing/application/require-subscription.js';
import { toDateOnly } from '../../../shared/validation/datetime.js';

const assemblyTypeEnum    = z.enum(['ordinaria', 'extraordinaria']);
const assemblyStatusEnum  = z.enum(['borrador', 'convocada', 'en_curso', 'cerrada']);
const agendaItemTypeEnum  = z.enum(['informativo', 'votacion']);
const voteValueEnum       = z.enum(['a_favor', 'en_contra', 'abstencion']);
const attendanceModeEnum  = z.enum(['presencial', 'virtual', 'poder']);

const createAssemblySchema = z.object({
  type:          assemblyTypeEnum.default('ordinaria'),
  title:         z.string().min(5).max(200),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  location:      z.string().max(300).nullable().default(null),
  quorumPct:     z.number().min(0).max(100).default(50),
  notes:         z.string().max(2000).nullable().default(null),
});

const createAgendaItemSchema = z.object({
  title:            z.string().min(3).max(200),
  description:      z.string().max(2000).nullable().default(null),
  type:             agendaItemTypeEnum.default('votacion'),
  requiredMajority: z.number().min(0).max(100).default(50),
  order:            z.number().int().min(0).default(0),
});

const registerAttendanceSchema = z.object({
  unitId:         z.string().min(1).max(50),
  attendanceMode: attendanceModeEnum.default('presencial'),
  delegateName:   z.string().max(200).nullable().default(null),
});

const castVoteSchema = z.object({
  agendaItemId: z.string().uuid(),
  unitId:       z.string().min(1).max(50),
  vote:         voteValueEnum,
});

// ── Helper: build quorum summary for a given assembly ────────────────────────

async function buildQuorumSummary(
  tenantId: string,
  assemblyId: string,
  snapshotTotal: string | null,
) {
  // Live sum of active units' coefficients (or the snapshot if assembly has started)
  let totalCoefficient: number;
  if (snapshotTotal !== null) {
    totalCoefficient = parseFloat(snapshotTotal);
  } else {
    const totRow = await db
      .selectFrom('units')
      .select((eb) => eb.fn.sum<string>('coefficient').as('total'))
      .where('tenantId', '=', tenantId)
      .where('active', '=', true)
      .executeTakeFirst();
    totalCoefficient = parseFloat(totRow?.total ?? '0');
  }

  const attendances = await db
    .selectFrom('assemblyAttendances')
    .select((eb) => eb.fn.sum<string>('coefficient').as('present'))
    .where('assemblyId', '=', assemblyId)
    .executeTakeFirst();

  const presentCoefficient = parseFloat(attendances?.present ?? '0');

  const assembly = await db
    .selectFrom('assemblies')
    .select('quorumPct')
    .where('id', '=', assemblyId)
    .executeTakeFirst();

  const quorumPct = parseFloat(assembly?.quorumPct ?? '50');
  const quorumReached = totalCoefficient > 0
    && (presentCoefficient / totalCoefficient) * 100 >= quorumPct;

  const countRow = await db
    .selectFrom('assemblyAttendances')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('assemblyId', '=', assemblyId)
    .executeTakeFirst();

  return {
    totalCoefficient,
    presentCoefficient,
    quorumPct,
    quorumReached,
    attendanceCount: Number(countRow?.count ?? 0),
    presentPct: totalCoefficient > 0
      ? Math.round((presentCoefficient / totalCoefficient) * 10000) / 100
      : 0,
  };
}

// ── Helper: tally votes for an agenda item ───────────────────────────────────

async function tallyVotes(agendaItemId: string, requiredMajority: number) {
  const votes = await db
    .selectFrom('assemblyVotes')
    .select(['vote', (eb) => eb.fn.sum<string>('coefficient').as('coeff'), (eb) => eb.fn.countAll<string>().as('count')])
    .where('agendaItemId', '=', agendaItemId)
    .groupBy('vote')
    .execute();

  const tally = { a_favor: { count: 0, coefficient: 0 }, en_contra: { count: 0, coefficient: 0 }, abstencion: { count: 0, coefficient: 0 } };
  for (const v of votes) {
    tally[v.vote as keyof typeof tally] = { count: Number(v.count), coefficient: parseFloat(v.coeff ?? '0') };
  }

  const totalVoted = tally.a_favor.coefficient + tally.en_contra.coefficient + tally.abstencion.coefficient;
  const approved = totalVoted > 0
    ? (tally.a_favor.coefficient / totalVoted) * 100 >= requiredMajority
    : null;

  return { ...tally, totalVoted, approved };
}

// ─────────────────────────────────────────────────────────────────────────────

export function createAssembliesRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireTenant, requireSubscription);

  // ── GET /assemblies — list ────────────────────────────────────────────────
  router.get('/', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const filter = z.object({
        status: assemblyStatusEnum.optional(),
        limit:  z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }).parse(req.query);

      let query = db
        .selectFrom('assemblies')
        .select([
          'id', 'type', 'title', 'status', 'scheduledDate', 'scheduledTime',
          'location', 'quorumPct', 'totalCoefficient', 'createdAt',
        ])
        .where('tenantId', '=', tenantId);

      if (filter.status) query = query.where('status', '=', filter.status);

      const rows = await query
        .orderBy('scheduledDate', 'desc')
        .orderBy('createdAt', 'desc')
        .limit(filter.limit)
        .offset(filter.offset)
        .execute();

      res.json(rows.map((r) => ({
        ...r,
        scheduledDate: r.scheduledDate ? toDateOnly(r.scheduledDate) : null,
      })));
    } catch (err) { next(err); }
  });

  // ── POST /assemblies — create ─────────────────────────────────────────────
  router.post('/', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const body = createAssemblySchema.parse(req.body);

      const row = await db
        .insertInto('assemblies')
        .values({
          tenantId,
          type:          body.type,
          title:         body.title,
          scheduledDate: body.scheduledDate,
          scheduledTime: body.scheduledTime,
          location:      body.location,
          quorumPct:     body.quorumPct,
          notes:         body.notes,
          createdBy:     req.user!.uid,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ ...row, scheduledDate: row.scheduledDate ? toDateOnly(row.scheduledDate) : null });
    } catch (err) { next(err); }
  });

  // ── GET /assemblies/:id — full detail ─────────────────────────────────────
  router.get('/:id', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;

      const assembly = await db
        .selectFrom('assemblies')
        .selectAll()
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();

      if (!assembly) { res.status(404).json({ error: 'Asamblea no encontrada' }); return; }

      const quorum = await buildQuorumSummary(tenantId, id, assembly.totalCoefficient);

      const agendaRaw = await db
        .selectFrom('assemblyAgendaItems')
        .selectAll()
        .where('assemblyId', '=', id)
        .where('tenantId', '=', tenantId)
        .orderBy('order', 'asc')
        .orderBy('createdAt', 'asc')
        .execute();

      const agenda = await Promise.all(agendaRaw.map(async (item) => {
        const votes = item.type === 'votacion'
          ? await tallyVotes(item.id, parseFloat(item.requiredMajority))
          : null;
        return { ...item, votes };
      }));

      const attendances = await db
        .selectFrom('assemblyAttendances')
        .selectAll()
        .where('assemblyId', '=', id)
        .where('tenantId', '=', tenantId)
        .orderBy('registeredAt', 'asc')
        .execute();

      res.json({
        assembly: { ...assembly, scheduledDate: assembly.scheduledDate ? toDateOnly(assembly.scheduledDate) : null },
        quorum,
        agenda,
        attendances,
      });
    } catch (err) { next(err); }
  });

  // ── PUT /assemblies/:id — update (only borrador/convocada) ────────────────
  router.put('/:id', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;
      const body     = createAssemblySchema.partial().parse(req.body);

      const current = await db
        .selectFrom('assemblies')
        .select('status')
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();

      if (!current) { res.status(404).json({ error: 'Asamblea no encontrada' }); return; }
      if (current.status === 'cerrada') {
        res.status(409).json({ error: 'No se puede editar una asamblea cerrada' });
        return;
      }

      const row = await db
        .updateTable('assemblies')
        .set(body)
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.json({ ...row, scheduledDate: row.scheduledDate ? toDateOnly(row.scheduledDate) : null });
    } catch (err) { next(err); }
  });

  // ── PATCH /assemblies/:id/start — snapshot coefficient + begin ─────────────
  router.patch('/:id/start', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;

      const current = await db
        .selectFrom('assemblies')
        .select('status')
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();

      if (!current) { res.status(404).json({ error: 'Asamblea no encontrada' }); return; }
      if (current.status === 'en_curso') { res.status(409).json({ error: 'La asamblea ya está en curso' }); return; }
      if (current.status === 'cerrada')  { res.status(409).json({ error: 'La asamblea ya está cerrada' }); return; }

      // Snapshot the total coefficient of all active units at this moment
      const totRow = await db
        .selectFrom('units')
        .select((eb) => eb.fn.sum<string>('coefficient').as('total'))
        .where('tenantId', '=', tenantId)
        .where('active', '=', true)
        .executeTakeFirst();

      const totalCoefficient = parseFloat(totRow?.total ?? '0');

      const row = await db
        .updateTable('assemblies')
        .set({ status: 'en_curso', totalCoefficient })
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.json({ ...row, scheduledDate: row.scheduledDate ? toDateOnly(row.scheduledDate) : null });
    } catch (err) { next(err); }
  });

  // ── PATCH /assemblies/:id/close ───────────────────────────────────────────
  router.patch('/:id/close', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;

      const row = await db
        .updateTable('assemblies')
        .set({ status: 'cerrada' })
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .where('status', 'in', ['en_curso', 'convocada', 'borrador'])
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: 'Asamblea no encontrada o ya cerrada' }); return; }
      res.json({ ...row, scheduledDate: row.scheduledDate ? toDateOnly(row.scheduledDate) : null });
    } catch (err) { next(err); }
  });

  // ── PATCH /assemblies/:id/minutes — save acta ─────────────────────────────
  router.patch('/:id/minutes', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;
      const { minutesText, approve } = z.object({
        minutesText: z.string().max(50_000),
        approve:     z.boolean().default(false),
      }).parse(req.body);

      const row = await db
        .updateTable('assemblies')
        .set({
          minutesText,
          minutesApprovedAt: approve ? new Date() : undefined,
        })
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: 'Asamblea no encontrada' }); return; }
      res.json({ id: row.id, minutesText: row.minutesText, minutesApprovedAt: row.minutesApprovedAt });
    } catch (err) { next(err); }
  });

  // ── POST /assemblies/:id/agenda — add item ────────────────────────────────
  router.post('/:id/agenda', requireAdmin, async (req, res, next) => {
    try {
      const assemblyId = z.string().uuid().parse(req.params['id']);
      const tenantId   = req.user!.tenantId!;

      const assembly = await db
        .selectFrom('assemblies')
        .select('status')
        .where('id', '=', assemblyId)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();

      if (!assembly) { res.status(404).json({ error: 'Asamblea no encontrada' }); return; }
      if (assembly.status === 'cerrada') {
        res.status(409).json({ error: 'No se puede modificar el orden del día de una asamblea cerrada' });
        return;
      }

      const body = createAgendaItemSchema.parse(req.body);

      const row = await db
        .insertInto('assemblyAgendaItems')
        .values({ assemblyId, tenantId, ...body })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json(row);
    } catch (err) { next(err); }
  });

  // ── PUT /assemblies/:id/agenda/:itemId ────────────────────────────────────
  router.put('/:id/agenda/:itemId', requireAdmin, async (req, res, next) => {
    try {
      const assemblyId = z.string().uuid().parse(req.params['id']);
      const itemId     = z.string().uuid().parse(req.params['itemId']);
      const tenantId   = req.user!.tenantId!;
      const body       = createAgendaItemSchema.partial().parse(req.body);

      const row = await db
        .updateTable('assemblyAgendaItems')
        .set(body)
        .where('id', '=', itemId)
        .where('assemblyId', '=', assemblyId)
        .where('tenantId', '=', tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: 'Punto del orden del día no encontrado' }); return; }
      res.json(row);
    } catch (err) { next(err); }
  });

  // ── DELETE /assemblies/:id/agenda/:itemId ─────────────────────────────────
  router.delete('/:id/agenda/:itemId', requireAdmin, async (req, res, next) => {
    try {
      const assemblyId = z.string().uuid().parse(req.params['id']);
      const itemId     = z.string().uuid().parse(req.params['itemId']);
      const tenantId   = req.user!.tenantId!;

      const deleted = await db
        .deleteFrom('assemblyAgendaItems')
        .where('id', '=', itemId)
        .where('assemblyId', '=', assemblyId)
        .where('tenantId', '=', tenantId)
        .returning('id')
        .executeTakeFirst();

      if (!deleted) { res.status(404).json({ error: 'Punto no encontrado' }); return; }
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ── PATCH /assemblies/:id/agenda/:itemId/resolve — admin sets result ──────
  router.patch('/:id/agenda/:itemId/resolve', requireAdmin, async (req, res, next) => {
    try {
      const assemblyId = z.string().uuid().parse(req.params['id']);
      const itemId     = z.string().uuid().parse(req.params['itemId']);
      const tenantId   = req.user!.tenantId!;
      const { resolvedStatus } = z.object({
        resolvedStatus: z.enum(['aprobado', 'rechazado', 'abstencion']).nullable(),
      }).parse(req.body);

      const row = await db
        .updateTable('assemblyAgendaItems')
        .set({ resolvedStatus })
        .where('id', '=', itemId)
        .where('assemblyId', '=', assemblyId)
        .where('tenantId', '=', tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: 'Punto no encontrado' }); return; }
      res.json(row);
    } catch (err) { next(err); }
  });

  // ── POST /assemblies/:id/attendances — register unit ─────────────────────
  router.post('/:id/attendances', requireAdmin, async (req, res, next) => {
    try {
      const assemblyId = z.string().uuid().parse(req.params['id']);
      const tenantId   = req.user!.tenantId!;
      const body       = registerAttendanceSchema.parse(req.body);

      const assembly = await db
        .selectFrom('assemblies')
        .select(['status', 'tenantId'])
        .where('id', '=', assemblyId)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();

      if (!assembly) { res.status(404).json({ error: 'Asamblea no encontrada' }); return; }
      if (assembly.status === 'cerrada') {
        res.status(409).json({ error: 'La asamblea ya está cerrada' });
        return;
      }

      // Fetch unit for coefficient + label
      const unit = await db
        .selectFrom('units')
        .select(['unitId', 'label', 'ownerName', 'coefficient'])
        .where('tenantId', '=', tenantId)
        .where('unitId', '=', body.unitId)
        .where('active', '=', true)
        .executeTakeFirst();

      if (!unit) { res.status(404).json({ error: 'Unidad no encontrada' }); return; }

      // Upsert: update attendance mode if already registered
      const existing = await db
        .selectFrom('assemblyAttendances')
        .select('id')
        .where('assemblyId', '=', assemblyId)
        .where('unitId', '=', body.unitId)
        .executeTakeFirst();

      if (existing) {
        const row = await db
          .updateTable('assemblyAttendances')
          .set({ attendanceMode: body.attendanceMode, delegateName: body.delegateName })
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        res.json(row);
        return;
      }

      const row = await db
        .insertInto('assemblyAttendances')
        .values({
          assemblyId,
          tenantId,
          unitId:         unit.unitId,
          unitLabel:      unit.label,
          ownerName:      unit.ownerName,
          coefficient:    unit.coefficient,
          attendanceMode: body.attendanceMode,
          delegateName:   body.delegateName,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json(row);
    } catch (err) { next(err); }
  });

  // ── DELETE /assemblies/:id/attendances/:unitId — remove ───────────────────
  router.delete('/:id/attendances/:unitId', requireAdmin, async (req, res, next) => {
    try {
      const assemblyId = z.string().uuid().parse(req.params['id']);
      const unitId     = req.params['unitId'] ?? '';
      const tenantId   = req.user!.tenantId!;

      const deleted = await db
        .deleteFrom('assemblyAttendances')
        .where('assemblyId', '=', assemblyId)
        .where('tenantId', '=', tenantId)
        .where('unitId', '=', unitId)
        .returning('id')
        .executeTakeFirst();

      if (!deleted) { res.status(404).json({ error: 'Asistencia no registrada' }); return; }
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ── POST /assemblies/:id/votes — cast vote ────────────────────────────────
  router.post('/:id/votes', requireAdmin, async (req, res, next) => {
    try {
      const assemblyId = z.string().uuid().parse(req.params['id']);
      const tenantId   = req.user!.tenantId!;
      const body       = castVoteSchema.parse(req.body);

      const assembly = await db
        .selectFrom('assemblies')
        .select('status')
        .where('id', '=', assemblyId)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();

      if (!assembly) { res.status(404).json({ error: 'Asamblea no encontrada' }); return; }
      if (assembly.status !== 'en_curso') {
        res.status(409).json({ error: 'Solo se puede votar durante la asamblea en curso' });
        return;
      }

      // Verify unit is registered as attendee
      const attendance = await db
        .selectFrom('assemblyAttendances')
        .select(['coefficient'])
        .where('assemblyId', '=', assemblyId)
        .where('unitId', '=', body.unitId)
        .executeTakeFirst();

      if (!attendance) {
        res.status(409).json({ error: 'La unidad no está registrada como asistente' });
        return;
      }

      // Verify agenda item belongs to this assembly
      const agendaItem = await db
        .selectFrom('assemblyAgendaItems')
        .select(['id', 'type', 'requiredMajority'])
        .where('id', '=', body.agendaItemId)
        .where('assemblyId', '=', assemblyId)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();

      if (!agendaItem) { res.status(404).json({ error: 'Punto del orden del día no encontrado' }); return; }
      if (agendaItem.type !== 'votacion') {
        res.status(422).json({ error: 'Este punto es informativo — no admite votos' });
        return;
      }

      // Upsert vote
      const existing = await db
        .selectFrom('assemblyVotes')
        .select('id')
        .where('agendaItemId', '=', body.agendaItemId)
        .where('unitId', '=', body.unitId)
        .executeTakeFirst();

      if (existing) {
        await db
          .updateTable('assemblyVotes')
          .set({ vote: body.vote })
          .where('id', '=', existing.id)
          .execute();
      } else {
        await db
          .insertInto('assemblyVotes')
          .values({
            assemblyId,
            agendaItemId: body.agendaItemId,
            tenantId,
            unitId:      body.unitId,
            vote:        body.vote,
            coefficient: attendance.coefficient,
          })
          .execute();
      }

      const tally = await tallyVotes(body.agendaItemId, parseFloat(agendaItem.requiredMajority));
      res.json({ agendaItemId: body.agendaItemId, ...tally });
    } catch (err) { next(err); }
  });

  // ── GET /assemblies/:id/quorum — live quorum status ───────────────────────
  router.get('/:id/quorum', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;

      const assembly = await db
        .selectFrom('assemblies')
        .select(['id', 'totalCoefficient'])
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();

      if (!assembly) { res.status(404).json({ error: 'Asamblea no encontrada' }); return; }

      const quorum = await buildQuorumSummary(tenantId, id, assembly.totalCoefficient);
      res.json(quorum);
    } catch (err) { next(err); }
  });

  return router;
}
