import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../shared/database/db.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';
import { requireSubscription } from '../../billing/application/require-subscription.js';
import { toDateOnly } from '../../../shared/validation/datetime.js';
import { generateMinutesPDF } from '../../export/infrastructure/pdf.generator.js';

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
  quorumPct: number,           // caller already has this — no extra query needed
) {
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

  // One query for both present-sum and count — avoids a second round-trip
  const statsRow = await db
    .selectFrom('assemblyAttendances')
    .select([
      (eb) => eb.fn.sum<string>('coefficient').as('present'),
      (eb) => eb.fn.countAll<string>().as('count'),
    ])
    .where('assemblyId', '=', assemblyId)
    .executeTakeFirst();

  const presentCoefficient = parseFloat(statsRow?.present ?? '0');
  const attendanceCount    = Number(statsRow?.count ?? 0);
  const quorumReached      = totalCoefficient > 0
    && (presentCoefficient / totalCoefficient) * 100 >= quorumPct;

  return {
    totalCoefficient,
    presentCoefficient,
    quorumPct,
    quorumReached,
    attendanceCount,
    presentPct: totalCoefficient > 0
      ? Math.round((presentCoefficient / totalCoefficient) * 10000) / 100
      : 0,
  };
}

// ── Helper: batch-tally votes for multiple agenda items in ONE query ─────────
// Returns a map keyed by agendaItemId — avoids N+1 on GET /:id

function emptyTally() {
  return {
    a_favor:    { count: 0, coefficient: 0 },
    en_contra:  { count: 0, coefficient: 0 },
    abstencion: { count: 0, coefficient: 0 },
  };
}

async function tallyVotesBatch(
  itemIds: string[],
  requiredMajorityByItem: Record<string, number>,
): Promise<Record<string, ReturnType<typeof buildTallyResult>>> {
  if (itemIds.length === 0) return {};

  const rows = await db
    .selectFrom('assemblyVotes')
    .select([
      'agendaItemId',
      'vote',
      (eb) => eb.fn.sum<string>('coefficient').as('coeff'),
      (eb) => eb.fn.countAll<string>().as('count'),
    ])
    .where('agendaItemId', 'in', itemIds)
    .groupBy(['agendaItemId', 'vote'])
    .execute();

  const tallies: Record<string, ReturnType<typeof emptyTally>> = {};
  for (const r of rows) {
    if (!tallies[r.agendaItemId]) tallies[r.agendaItemId] = emptyTally();
    const t = tallies[r.agendaItemId]!;
    t[r.vote as keyof ReturnType<typeof emptyTally>] = {
      count: Number(r.count),
      coefficient: parseFloat(r.coeff ?? '0'),
    };
  }

  const result: Record<string, ReturnType<typeof buildTallyResult>> = {};
  for (const id of itemIds) {
    const t = tallies[id] ?? emptyTally();
    result[id] = buildTallyResult(t, requiredMajorityByItem[id] ?? 50);
  }
  return result;
}

function buildTallyResult(
  tally: ReturnType<typeof emptyTally>,
  requiredMajority: number,
) {
  const totalVoted = tally.a_favor.coefficient + tally.en_contra.coefficient + tally.abstencion.coefficient;
  const approved   = totalVoted > 0
    ? (tally.a_favor.coefficient / totalVoted) * 100 >= requiredMajority
    : null;
  return { ...tally, totalVoted, approved };
}

// Single-item tally (used in POST /votes response)
async function tallyVotesSingle(agendaItemId: string, requiredMajority: number) {
  const map = await tallyVotesBatch([agendaItemId], { [agendaItemId]: requiredMajority });
  return map[agendaItemId] ?? buildTallyResult(emptyTally(), requiredMajority);
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

      const quorumPct = parseFloat(assembly.quorumPct);
      const quorum    = await buildQuorumSummary(tenantId, id, assembly.totalCoefficient, quorumPct);

      const agendaRaw = await db
        .selectFrom('assemblyAgendaItems')
        .selectAll()
        .where('assemblyId', '=', id)
        .where('tenantId', '=', tenantId)
        .orderBy('order', 'asc')
        .orderBy('createdAt', 'asc')
        .execute();

      // Batch-fetch all votes in one query — no N+1
      const votingItems = agendaRaw.filter((i) => i.type === 'votacion');
      const majorityMap = Object.fromEntries(
        votingItems.map((i) => [i.id, parseFloat(i.requiredMajority)])
      );
      const votesByItem = await tallyVotesBatch(votingItems.map((i) => i.id), majorityMap);

      const agenda = agendaRaw.map((item) => ({
        ...item,
        votes: item.type === 'votacion' ? (votesByItem[item.id] ?? null) : null,
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

      // Snapshot the total coefficient of all active units at this moment.
      // Do this BEFORE the UPDATE so the snapshot is fresh even if two concurrent
      // requests race — both would snapshot the same live value.
      const totRow = await db
        .selectFrom('units')
        .select((eb) => eb.fn.sum<string>('coefficient').as('total'))
        .where('tenantId', '=', tenantId)
        .where('active', '=', true)
        .executeTakeFirst();

      const totalCoefficient = parseFloat(totRow?.total ?? '0');

      // Atomic transition: the WHERE clause on status prevents double-starting.
      // If the assembly is already en_curso or cerrada, the UPDATE returns no row.
      const row = await db
        .updateTable('assemblies')
        .set({ status: 'en_curso', totalCoefficient })
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .where('status', 'in', ['borrador', 'convocada'])
        .returningAll()
        .executeTakeFirst();

      if (!row) {
        // Could be 404 or already started/closed — check which
        const exists = await db
          .selectFrom('assemblies')
          .select('status')
          .where('id', '=', id)
          .where('tenantId', '=', tenantId)
          .executeTakeFirst();
        if (!exists) { res.status(404).json({ error: 'Asamblea no encontrada' }); return; }
        res.status(409).json({ error: `La asamblea ya está ${exists.status}` });
        return;
      }

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
        .where('status', 'in', ['en_curso', 'convocada'])
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: 'Asamblea no encontrada, ya cerrada, o en borrador' }); return; }
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

      // Atomic upsert via ON CONFLICT — avoids check-then-insert race
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
        .onConflict((oc) => oc
          .columns(['assemblyId', 'unitId'])
          .doUpdateSet({ attendanceMode: body.attendanceMode, delegateName: body.delegateName })
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json(row);
    } catch (err) { next(err); }
  });

  // ── DELETE /assemblies/:id/attendances/:unitId — remove ───────────────────
  router.delete('/:id/attendances/:unitId', requireAdmin, async (req, res, next) => {
    try {
      const assemblyId = z.string().uuid().parse(req.params['id']);
      const unitId     = z.string().min(1).max(50).parse(req.params['unitId']);
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

      // Atomic upsert — UNIQUE (agenda_item_id, unit_id) prevents duplicate votes
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
        .onConflict((oc) =>
          oc.columns(['agendaItemId', 'unitId']).doUpdateSet({ vote: body.vote })
        )
        .execute();

      const tally = await tallyVotesSingle(body.agendaItemId, parseFloat(agendaItem.requiredMajority));
      res.json({ agendaItemId: body.agendaItemId, ...tally });
    } catch (err) { next(err); }
  });

  // ── GET /assemblies/:id/minutes/pdf — generate acta PDF ──────────────────
  router.get('/:id/minutes/pdf', requireAdmin, async (req, res, next) => {
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
      if (assembly.status !== 'cerrada') {
        res.status(409).json({ error: 'Solo se puede generar el acta de una asamblea cerrada' });
        return;
      }

      const quorumPct = parseFloat(assembly.quorumPct);
      const [quorum, agendaRaw, attendances, tenant] = await Promise.all([
        buildQuorumSummary(tenantId, id, assembly.totalCoefficient, quorumPct),
        db.selectFrom('assemblyAgendaItems').selectAll()
          .where('assemblyId', '=', id).where('tenantId', '=', tenantId)
          .orderBy('order', 'asc').orderBy('createdAt', 'asc').execute(),
        db.selectFrom('assemblyAttendances').selectAll()
          .where('assemblyId', '=', id).where('tenantId', '=', tenantId)
          .orderBy('registeredAt', 'asc').execute(),
        db.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst(),
      ]);

      const votingItems = agendaRaw.filter((i) => i.type === 'votacion');
      const majorityMap = Object.fromEntries(votingItems.map((i) => [i.id, parseFloat(i.requiredMajority)]));
      const votesByItem = await tallyVotesBatch(votingItems.map((i) => i.id), majorityMap);

      const pdfBuffer = await generateMinutesPDF({
        buildingName:      tenant?.name ?? 'Conjunto Residencial',
        assemblyType:      assembly.type,
        assemblyTitle:     assembly.title,
        scheduledDate:     assembly.scheduledDate ? toDateOnly(assembly.scheduledDate) : null,
        location:          assembly.location,
        quorum,
        attendances: attendances.map((a) => ({
          unitId:         a.unitId,
          unitLabel:      a.unitLabel,
          ownerName:      a.ownerName,
          attendanceMode: a.attendanceMode,
          coefficient:    a.coefficient,
        })),
        agenda: agendaRaw.map((item, i) => ({
          order:          i + 1,
          title:          item.title,
          type:           item.type as 'votacion' | 'informativo',
          description:    item.description,
          resolvedStatus: item.resolvedStatus,
          votes:          item.type === 'votacion' ? (votesByItem[item.id] ?? null) : null,
        })),
        minutesText:       assembly.minutesText,
        minutesApprovedAt: assembly.minutesApprovedAt
          ? new Date(assembly.minutesApprovedAt).toLocaleDateString('es-CO')
          : null,
        generatedAt: new Date().toLocaleDateString('es-CO'),
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="acta-asamblea-${id.slice(0, 8)}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      });
      res.send(pdfBuffer);
    } catch (err) { next(err); }
  });

  // ── GET /assemblies/:id/quorum — live quorum status ───────────────────────
  router.get('/:id/quorum', requireAdmin, async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;

      const assembly = await db
        .selectFrom('assemblies')
        .select(['id', 'totalCoefficient', 'quorumPct'])
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();

      if (!assembly) { res.status(404).json({ error: 'Asamblea no encontrada' }); return; }

      const quorum = await buildQuorumSummary(tenantId, id, assembly.totalCoefficient, parseFloat(assembly.quorumPct));
      res.json(quorum);
    } catch (err) { next(err); }
  });

  return router;
}
