import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { withTenantTransaction } from '../../../shared/database/db.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';

const unitSchema = z.object({
  unitId:    z.string().min(1).max(50),
  label:     z.string().min(1).max(200),
  ownerName: z.string().max(200).nullable().default(null),
  phone:     z.string().max(20).nullable().default(null),
  email:     z.string().email().nullable().default(null),
  feeAmount: z.number().int().min(0),   // centavos COP
});

const updateUnitSchema = unitSchema.partial().extend({
  active: z.boolean().optional(),
});

export function createUnitsRouter(): Router {
  const router = Router();

  // GET /units
  router.get('/', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const rows = await withTenantTransaction(tenantId, async (trx) =>
        trx
          .selectFrom('units')
          .select(['id', 'unitId', 'label', 'ownerName', 'phone', 'email', 'feeAmount', 'active'])
          .where('tenantId', '=', tenantId)
          .where('active', '=', true)
          .orderBy('unitId', 'asc')
          .execute(),
      );
      res.json(rows.map((r) => ({
        ...r,
        feeAmount: r.feeAmount?.toString() ?? '0',
      })));
    } catch (err) { next(err); }
  });

  // POST /units — create single unit
  router.post('/', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const body = unitSchema.parse(req.body);
      const tenantId = req.user!.tenantId!;
      const id = uuidv4();

      await withTenantTransaction(tenantId, async (trx) =>
        trx.insertInto('units').values({
          id,
          tenantId,
          unitId:    body.unitId,
          label:     body.label,
          ownerName: body.ownerName,
          phone:     body.phone,
          email:     body.email,
          feeAmount: body.feeAmount,
        }).execute(),
      );

      res.status(201).json({ id, ...body });
    } catch (err) { next(err); }
  });

  // POST /units/import — bulk upsert (idempotent by unit_id)
  router.post('/import', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const body = z.object({
        units: z.array(unitSchema).min(1).max(500),
      }).parse(req.body);

      const tenantId = req.user!.tenantId!;
      let created = 0;
      let updated = 0;

      await withTenantTransaction(tenantId, async (trx) => {
        for (const u of body.units) {
          const existing = await trx
            .selectFrom('units')
            .select('id')
            .where('tenantId', '=', tenantId)
            .where('unitId',   '=', u.unitId)
            .executeTakeFirst();

          if (existing) {
            await trx
              .updateTable('units')
              .set({ ...u, feeAmount: u.feeAmount, updatedAt: new Date() })
              .where('id', '=', existing.id)
              .execute();
            updated++;
          } else {
            await trx.insertInto('units').values({
              id:        uuidv4(),
              tenantId,
              unitId:    u.unitId,
              label:     u.label,
              ownerName: u.ownerName,
              phone:     u.phone,
              email:     u.email,
              feeAmount: u.feeAmount,
            }).execute();
            created++;
          }
        }
      });

      res.status(201).json({ created, updated, total: body.units.length });
    } catch (err) { next(err); }
  });

  // PUT /units/:id
  router.put('/:id', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params['id']);
      const body = updateUnitSchema.parse(req.body);
      const tenantId = req.user!.tenantId!;

      const result = await withTenantTransaction(tenantId, async (trx) =>
        trx
          .updateTable('units')
          .set({ ...body, updatedAt: new Date() })
          .where('id', '=', id)
          .where('tenantId', '=', tenantId)
          .executeTakeFirst(),
      );

      if (!result || Number(result.numUpdatedRows) === 0) {
        res.status(404).json({ error: 'Unit not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // DELETE /units/:id — soft delete
  router.delete('/:id', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;

      await withTenantTransaction(tenantId, async (trx) =>
        trx
          .updateTable('units')
          .set({ active: false, updatedAt: new Date() })
          .where('id', '=', id)
          .where('tenantId', '=', tenantId)
          .execute(),
      );
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  return router;
}
