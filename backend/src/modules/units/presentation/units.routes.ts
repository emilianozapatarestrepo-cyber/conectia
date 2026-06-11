import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { withTenantTransaction } from '../../../shared/database/db.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';
import { requireSubscription } from '../../billing/application/require-subscription.js';
import { revokeUnitPortalTokens } from '../../portal/application/portal-token.service.js';

const unitSchema = z.object({
  unitId:      z.string().min(1).max(50),
  label:       z.string().min(1).max(200),
  ownerName:   z.string().max(200).nullable().default(null),
  phone:       z.string().max(20).nullable().default(null),
  email:       z.string().email().nullable().default(null),
  feeAmount:   z.number().int().min(0),
  coefficient: z.number().min(0).max(9999.9999).default(0),
});

const updateUnitSchema = unitSchema.partial().extend({
  active: z.boolean().optional(),
});

export function createUnitsRouter(): Router {
  const router = Router();

  router.use(requireAuth, requireTenant, requireSubscription);

  // GET /units
  router.get('/', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const rows = await withTenantTransaction(tenantId, async (trx) =>
        trx
          .selectFrom('units')
          .select(['id', 'unitId', 'label', 'ownerName', 'phone', 'email', 'feeAmount', 'coefficient', 'active'])
          .where('tenantId', '=', tenantId)
          .where('active', '=', true)
          .orderBy('unitId', 'asc')
          .execute(),
      );
      res.json(rows.map((r) => ({
        ...r,
        feeAmount:   r.feeAmount?.toString() ?? '0',
        coefficient: r.coefficient?.toString() ?? '0',
      })));
    } catch (err) { next(err); }
  });

  // POST /units — create single unit
  router.post('/', requireAdmin, async (req, res, next) => {
    try {
      const body = unitSchema.parse(req.body);
      const tenantId = req.user!.tenantId!;

      // Enforce plan unit limit
      const maxUnits = req.subscription?.maxUnits;
      if (maxUnits != null) {
        const { count } = await withTenantTransaction(tenantId, async (trx) =>
          trx.selectFrom('units').select((eb) => eb.fn.countAll<string>().as('count'))
            .where('tenantId', '=', tenantId).where('active', '=', true).executeTakeFirstOrThrow()
        );
        if (Number(count) >= maxUnits) {
          res.status(402).json({ error: 'UNIT_LIMIT_REACHED', limit: maxUnits });
          return;
        }
      }

      const id = uuidv4();

      await withTenantTransaction(tenantId, async (trx) =>
        trx.insertInto('units').values({
          id,
          tenantId,
          unitId:      body.unitId,
          label:       body.label,
          ownerName:   body.ownerName,
          phone:       body.phone,
          email:       body.email,
          feeAmount:   body.feeAmount,
          coefficient: body.coefficient,
        }).execute(),
      );

      res.status(201).json({ id, ...body });
    } catch (err) { next(err); }
  });

  // POST /units/import — bulk upsert (idempotent by unit_id)
  router.post('/import', requireAdmin, async (req, res, next) => {
    try {
      const body = z.object({
        units: z.array(unitSchema).min(1).max(500),
      }).parse(req.body);

      const tenantId = req.user!.tenantId!;
      let created = 0;
      let updated = 0;
      const ownerChangedUnitIds: string[] = [];

      await withTenantTransaction(tenantId, async (trx) => {
        for (const u of body.units) {
          const existing = await trx
            .selectFrom('units')
            .select(['id', 'ownerName'])
            .where('tenantId', '=', tenantId)
            .where('unitId',   '=', u.unitId)
            .executeTakeFirst();

          if (existing) {
            await trx
              .updateTable('units')
              .set({ ...u, feeAmount: u.feeAmount, updatedAt: new Date() })
              .where('id', '=', existing.id)
              .execute();
            // Owner changed (unit sold/re-rented) → the previous resident's
            // portal link must stop working
            if (existing.ownerName !== u.ownerName) {
              ownerChangedUnitIds.push(u.unitId);
            }
            updated++;
          } else {
            await trx.insertInto('units').values({
              id:          uuidv4(),
              tenantId,
              unitId:      u.unitId,
              label:       u.label,
              ownerName:   u.ownerName,
              phone:       u.phone,
              email:       u.email,
              feeAmount:   u.feeAmount,
              coefficient: u.coefficient,
            }).execute();
            created++;
          }
        }
      });

      for (const unitId of ownerChangedUnitIds) {
        await revokeUnitPortalTokens(tenantId, unitId);
      }

      res.status(201).json({ created, updated, total: body.units.length });
    } catch (err) { next(err); }
  });

  // GET /units/:unitId/estado-cuenta — admin per-unit account statement
  router.get('/:unitId/estado-cuenta', requireAdmin, async (req, res, next) => {
    try {
      const unitId = z.string().min(1).max(50).parse(req.params['unitId']);
      const tenantId = req.user!.tenantId!;

      const toCents = (v: bigint | string): bigint =>
        typeof v === 'bigint' ? v : BigInt(String(v ?? '0'));

      const { unit, openCharges, paidCharges } = await withTenantTransaction(tenantId, async (trx) => {
        const unit = await trx
          .selectFrom('units')
          .select(['unitId', 'label', 'ownerName', 'phone', 'email', 'feeAmount', 'coefficient'])
          .where('tenantId', '=', tenantId)
          .where('unitId', '=', unitId)
          .where('active', '=', true)
          .executeTakeFirst();

        if (!unit) return { unit: null, openCharges: [], paidCharges: [] };

        const [openCharges, paidCharges] = await Promise.all([
          trx
            .selectFrom('charges')
            .select(['id', 'concept', 'amount', 'paidAmount', 'dueDate', 'status'])
            .where('tenantId', '=', tenantId)
            .where('unitId', '=', unitId)
            .where('status', 'in', ['active', 'overdue', 'partial'])
            .orderBy('dueDate', 'asc')
            .execute(),
          trx
            .selectFrom('charges')
            .select(['id', 'concept', 'amount', 'paidAt'])
            .where('tenantId', '=', tenantId)
            .where('unitId', '=', unitId)
            .where('status', '=', 'paid')
            .orderBy('paidAt', 'desc')
            .limit(24)
            .execute(),
        ]);

        return { unit, openCharges, paidCharges };
      });

      if (!unit) {
        res.status(404).json({ error: 'Unit not found' });
        return;
      }

      let balance = 0n;
      const charges = openCharges.map((c) => {
        const due = toCents(c.amount) - toCents(c.paidAmount);
        balance += due > 0n ? due : 0n;
        return {
          id: c.id,
          concept: c.concept,
          amount: toCents(c.amount).toString(),
          paidAmount: toCents(c.paidAmount).toString(),
          amountDue: (due > 0n ? due : 0n).toString(),
          dueDate: c.dueDate instanceof Date ? c.dueDate.toISOString().slice(0, 10) : String(c.dueDate).slice(0, 10),
          status: c.status,
        };
      });

      const totalPaidHistory = paidCharges.reduce((s, c) => s + toCents(c.amount), 0n);
      const totalPaidPartials = openCharges.reduce((s, c) => s + toCents(c.paidAmount), 0n);
      const totalCharged = openCharges.reduce((s, c) => s + toCents(c.amount), 0n)
        + paidCharges.reduce((s, c) => s + toCents(c.amount), 0n);
      const totalPaid = totalPaidHistory + totalPaidPartials;

      res.json({
        unit: {
          unitId: unit.unitId,
          label: unit.label,
          ownerName: unit.ownerName,
          phone: unit.phone,
          email: unit.email,
          feeAmount: toCents(unit.feeAmount).toString(),
          coefficient: unit.coefficient?.toString() ?? '0',
        },
        totalCharged: totalCharged.toString(),
        totalPaid: totalPaid.toString(),
        balance: balance.toString(),
        charges,
        payments: paidCharges.map((c) => ({
          id: c.id,
          concept: c.concept,
          amount: toCents(c.amount).toString(),
          paidAt: c.paidAt instanceof Date ? c.paidAt.toISOString() : c.paidAt,
        })),
      });
    } catch (err) { next(err); }
  });

  // PUT /units/:id
  router.put('/:id', requireAdmin, async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params['id']);
      const body = updateUnitSchema.parse(req.body);
      const tenantId = req.user!.tenantId!;

      // Snapshot before update — owner change must revoke the portal link
      const before = await withTenantTransaction(tenantId, async (trx) =>
        trx
          .selectFrom('units')
          .select(['unitId', 'ownerName'])
          .where('id', '=', id)
          .where('tenantId', '=', tenantId)
          .executeTakeFirst(),
      );

      if (!before) {
        res.status(404).json({ error: 'Unit not found' });
        return;
      }

      await withTenantTransaction(tenantId, async (trx) =>
        trx
          .updateTable('units')
          .set({ ...body, updatedAt: new Date() })
          .where('id', '=', id)
          .where('tenantId', '=', tenantId)
          .execute(),
      );

      const ownerChanged = body.ownerName !== undefined && body.ownerName !== before.ownerName;
      const deactivated  = body.active === false;
      if (ownerChanged || deactivated) {
        await revokeUnitPortalTokens(tenantId, before.unitId);
      }

      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // DELETE /units/:id — soft delete
  router.delete('/:id', requireAdmin, async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params['id']);
      const tenantId = req.user!.tenantId!;

      const unit = await withTenantTransaction(tenantId, async (trx) =>
        trx
          .selectFrom('units')
          .select('unitId')
          .where('id', '=', id)
          .where('tenantId', '=', tenantId)
          .executeTakeFirst(),
      );

      await withTenantTransaction(tenantId, async (trx) =>
        trx
          .updateTable('units')
          .set({ active: false, updatedAt: new Date() })
          .where('id', '=', id)
          .where('tenantId', '=', tenantId)
          .execute(),
      );

      // A deactivated unit's portal link must stop working immediately
      if (unit) {
        await revokeUnitPortalTokens(tenantId, unit.unitId);
      }

      res.json({ success: true });
    } catch (err) { next(err); }
  });

  return router;
}
