import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../shared/database/db.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';
import { requireSubscription } from '../../billing/application/require-subscription.js';

const audienceEnum = z.enum(['todos', 'morosos', 'seleccion']);

const createAnnouncementSchema = z.object({
  title:    z.string().min(5).max(150),
  body:     z.string().min(10).max(2000),
  audience: audienceEnum.default('todos'),
  unitIds:  z.array(z.string().min(1)).max(1000).nullable().default(null),
}).refine(
  (v) => v.audience !== 'seleccion' || (v.unitIds && v.unitIds.length > 0),
  { message: 'unitIds es requerido cuando audience = seleccion' },
);

// Colombian numbers — ensure +57 prefix (same convention as payment links)
function buildWhatsAppUrl(phone: string, text: string): string {
  const normalized = phone.replace(/\D/g, '');
  const full = normalized.startsWith('57') ? normalized : `57${normalized}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

function buildMessage(opts: {
  title: string; body: string; buildingName: string; ownerName: string | null;
}): string {
  const greeting = opts.ownerName ? `Hola ${opts.ownerName},` : 'Hola,';
  return [
    `📢 *${opts.title}*`,
    '',
    greeting,
    '',
    opts.body,
    '',
    `— Administración ${opts.buildingName}`,
  ].join('\n');
}

/** Resolve the audience to a concrete unit list (active units only). */
async function resolveAudience(
  tenantId: string,
  audience: z.infer<typeof audienceEnum>,
  unitIds: string[] | null,
): Promise<{ unitId: string; label: string; ownerName: string | null; phone: string | null }[]> {
  let query = db
    .selectFrom('units')
    .select(['unitId', 'label', 'ownerName', 'phone'])
    .where('tenantId', '=', tenantId)
    .where('active', '=', true);

  if (audience === 'seleccion') {
    query = query.where('unitId', 'in', unitIds ?? []);
  } else if (audience === 'morosos') {
    const overdueUnits = await db
      .selectFrom('charges')
      .select('unitId')
      .distinct()
      .where('tenantId', '=', tenantId)
      .where('status', '=', 'overdue')
      .execute();
    const ids = overdueUnits.map((r) => r.unitId);
    if (ids.length === 0) return [];
    query = query.where('unitId', 'in', ids);
  }

  return query.orderBy('label', 'asc').execute();
}

export function createAnnouncementsRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireTenant, requireSubscription, requireAdmin);

  // ── GET /announcements — history with send progress ────────────────────────
  router.get('/', async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const rows = await db
        .selectFrom('announcements as a')
        .leftJoin('announcementRecipients as r', 'r.announcementId', 'a.id')
        .select((eb) => [
          'a.id', 'a.title', 'a.body', 'a.audience', 'a.unitIds', 'a.status',
          'a.createdBy', 'a.publishedAt', 'a.createdAt', 'a.updatedAt',
          eb.fn.count<string>('r.id').as('recipientCount'),
          eb.fn.count<string>('r.id').filterWhere('r.sent', '=', true).as('sentCount'),
        ])
        .where('a.tenantId', '=', tenantId)
        .groupBy([
          'a.id', 'a.title', 'a.body', 'a.audience', 'a.unitIds', 'a.status',
          'a.createdBy', 'a.publishedAt', 'a.createdAt', 'a.updatedAt',
        ])
        .orderBy('a.createdAt', 'desc')
        .limit(100)
        .execute();

      res.json(rows.map((r) => ({
        ...r,
        recipientCount: Number(r.recipientCount),
        sentCount:      Number(r.sentCount),
      })));
    } catch (err) { next(err); }
  });

  // ── GET /announcements/preview-audience — recipient count before creating ──
  router.get('/preview-audience', async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const { audience } = z.object({ audience: audienceEnum }).parse(req.query);
      const recipients = audience === 'seleccion'
        ? []  // count comes from client selection
        : await resolveAudience(tenantId, audience, null);
      res.json({
        count:     recipients.length,
        withPhone: recipients.filter((r) => r.phone).length,
      });
    } catch (err) { next(err); }
  });

  // ── POST /announcements — create draft ──────────────────────────────────────
  router.post('/', async (req, res, next) => {
    try {
      const body     = createAnnouncementSchema.parse(req.body);
      const tenantId = req.user!.tenantId!;
      const row = await db
        .insertInto('announcements')
        .values({
          tenantId,
          title:     body.title,
          body:      body.body,
          audience:  body.audience,
          unitIds:   body.audience === 'seleccion' ? body.unitIds : null,
          createdBy: req.user!.uid,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      res.status(201).json(row);
    } catch (err) { next(err); }
  });

  // ── POST /announcements/:id/publish — snapshot recipients ──────────────────
  router.post('/:id/publish', async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;

      const announcement = await db
        .selectFrom('announcements')
        .selectAll()
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();

      if (!announcement) { res.status(404).json({ error: 'Comunicado no encontrado' }); return; }
      if (announcement.status === 'publicado') {
        res.status(409).json({ error: 'El comunicado ya fue publicado' });
        return;
      }

      const recipients = await resolveAudience(
        tenantId, announcement.audience, announcement.unitIds,
      );
      if (recipients.length === 0) {
        res.status(422).json({ error: 'La audiencia seleccionada no tiene destinatarios' });
        return;
      }

      const updated = await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('announcementRecipients')
          .values(recipients.map((r) => ({
            tenantId,
            announcementId: id,
            unitId:    r.unitId,
            unitLabel: r.label,
            ownerName: r.ownerName,
            phone:     r.phone,
          })))
          .execute();

        return trx
          .updateTable('announcements')
          .set({ status: 'publicado', publishedAt: new Date() })
          .where('id', '=', id)
          .where('tenantId', '=', tenantId)
          .returningAll()
          .executeTakeFirstOrThrow();
      });

      res.json({ ...updated, recipientCount: recipients.length });
    } catch (err) { next(err); }
  });

  // ── GET /announcements/:id/recipients — list with WhatsApp links ───────────
  router.get('/:id/recipients', async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;

      const announcement = await db
        .selectFrom('announcements')
        .select(['title', 'body'])
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();
      if (!announcement) { res.status(404).json({ error: 'Comunicado no encontrado' }); return; }

      const tenant = await db
        .selectFrom('tenants')
        .select('name')
        .where('id', '=', tenantId)
        .executeTakeFirstOrThrow();

      const recipients = await db
        .selectFrom('announcementRecipients')
        .selectAll()
        .where('announcementId', '=', id)
        .where('tenantId', '=', tenantId)
        .orderBy('unitLabel', 'asc')
        .execute();

      res.json(recipients.map((r) => ({
        id:        r.id,
        unitId:    r.unitId,
        unitLabel: r.unitLabel,
        ownerName: r.ownerName,
        phone:     r.phone,
        sent:      r.sent,
        sentAt:    r.sentAt,
        whatsappUrl: r.phone
          ? buildWhatsAppUrl(r.phone, buildMessage({
              title:        announcement.title,
              body:         announcement.body,
              buildingName: tenant.name,
              ownerName:    r.ownerName,
            }))
          : null,
      })));
    } catch (err) { next(err); }
  });

  // ── PATCH /announcements/recipients/:rid/sent — mark delivered ─────────────
  router.patch('/recipients/:rid/sent', async (req, res, next) => {
    try {
      const rid      = z.string().uuid().parse(req.params['rid']);
      const tenantId = req.user!.tenantId!;
      const row = await db
        .updateTable('announcementRecipients')
        .set({ sent: true, sentAt: new Date() })
        .where('id', '=', rid)
        .where('tenantId', '=', tenantId)
        .returningAll()
        .executeTakeFirst();
      if (!row) { res.status(404).json({ error: 'Destinatario no encontrado' }); return; }
      res.json(row);
    } catch (err) { next(err); }
  });

  // ── DELETE /announcements/:id — drafts only ─────────────────────────────────
  router.delete('/:id', async (req, res, next) => {
    try {
      const id       = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;
      const row = await db
        .deleteFrom('announcements')
        .where('id', '=', id)
        .where('tenantId', '=', tenantId)
        .where('status', '=', 'borrador')
        .returningAll()
        .executeTakeFirst();
      if (!row) {
        res.status(404).json({ error: 'Comunicado no encontrado o ya publicado' });
        return;
      }
      res.json(row);
    } catch (err) { next(err); }
  });

  return router;
}
