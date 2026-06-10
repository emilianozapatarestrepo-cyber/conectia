import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../shared/database/db.js';
import { env } from '../../../config/env.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';
import { requireSubscription } from '../../billing/application/require-subscription.js';
import { rotatePortalToken } from '../application/portal-token.service.js';

function buildPortalUrl(rawToken: string): string {
  const appUrl = env.APP_URL ?? '';
  return `${appUrl}/mi-unidad/${rawToken}`;
}

function buildShareWhatsAppUrl(opts: {
  phone:        string;
  ownerName:    string | null;
  unitLabel:    string;
  buildingName: string;
  portalUrl:    string;
}): string {
  const name = opts.ownerName ? `Hola ${opts.ownerName.split(' ')[0]},` : 'Hola,';
  const text = [
    `${name} este es tu acceso personal al *Portal de Residentes* de ${opts.buildingName} (unidad *${opts.unitLabel}*):`,
    '',
    `🏠 ${opts.portalUrl}`,
    '',
    'Desde allí puedes consultar tu estado de cuenta, pagar en línea, reservar zonas comunes y radicar PQRS.',
    '',
    '_Este enlace es personal — no lo compartas._',
  ].join('\n');

  const normalized = opts.phone.replace(/\D/g, '');
  const full = normalized.startsWith('57') ? normalized : `57${normalized}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export function createPortalAdminRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireTenant, requireSubscription, requireAdmin);

  // ── GET /portal-admin/links — estado del portal por unidad ─────────────────
  router.get('/links', async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;

      const rows = await db
        .selectFrom('units as u')
        .leftJoin('unitPortalTokens as t', (join) =>
          join
            .onRef('t.unitId', '=', 'u.unitId')
            .on('t.tenantId', '=', tenantId)
            .on('t.active', '=', true),
        )
        .select([
          'u.id', 'u.unitId', 'u.label', 'u.ownerName', 'u.phone',
          't.createdAt as tokenCreatedAt',
          't.lastAccessedAt',
        ])
        .where('u.tenantId', '=', tenantId)
        .where('u.active', '=', true)
        .orderBy('u.label', 'asc')
        .execute();

      res.json(rows.map((r) => ({
        id:             r.id,
        unitId:         r.unitId,
        label:          r.label,
        ownerName:      r.ownerName,
        phone:          r.phone,
        hasToken:       r.tokenCreatedAt !== null,
        tokenCreatedAt: r.tokenCreatedAt,
        lastAccessedAt: r.lastAccessedAt,
      })));
    } catch (err) { next(err); }
  });

  // ── POST /portal-admin/links/:unitRowId — generar/rotar link ───────────────
  router.post('/links/:unitRowId', async (req, res, next) => {
    try {
      const unitRowId = z.string().uuid().parse(req.params['unitRowId']);
      const tenantId  = req.user!.tenantId!;

      const unit = await db
        .selectFrom('units')
        .select(['unitId', 'label', 'ownerName', 'phone'])
        .where('id', '=', unitRowId)
        .where('tenantId', '=', tenantId)
        .where('active', '=', true)
        .executeTakeFirst();

      if (!unit) { res.status(404).json({ error: 'Unidad no encontrada' }); return; }

      const tenant = await db
        .selectFrom('tenants')
        .select('name')
        .where('id', '=', tenantId)
        .executeTakeFirstOrThrow();

      const rawToken  = await rotatePortalToken(tenantId, unit.unitId);
      const portalUrl = buildPortalUrl(rawToken);

      res.status(201).json({
        unitId:    unit.unitId,
        label:     unit.label,
        portalUrl,
        whatsappUrl: unit.phone
          ? buildShareWhatsAppUrl({
              phone:        unit.phone,
              ownerName:    unit.ownerName,
              unitLabel:    unit.label,
              buildingName: tenant.name,
              portalUrl,
            })
          : null,
      });
    } catch (err) { next(err); }
  });

  return router;
}
