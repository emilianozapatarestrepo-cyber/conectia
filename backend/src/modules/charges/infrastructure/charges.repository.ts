import { withTenantTransaction } from '../../../shared/database/db.js';
import type { IChargesRepository } from '../domain/interfaces.js';
import type { Charge, PaymentIntent, ChargeFilter } from '../domain/types.js';

export class ChargesRepository implements IChargesRepository {

  async list(tenantId: string, filter: ChargeFilter): Promise<Charge[]> {
    return withTenantTransaction(tenantId, async (trx) => {
      let query = trx
        .selectFrom('charges')
        .where('tenantId', '=', tenantId);

      if (filter.period) {
        const [year, month] = filter.period.split('-').map(Number);
        query = query.where('periodId', 'in',
          trx.selectFrom('periods').select('id')
             .where('tenantId', '=', tenantId)
             .where('year', '=', year ?? 0)
             .where('month', '=', month ?? 0),
        );
      }
      if (filter.unitId) {
        query = query.where('unitId', '=', filter.unitId);
      }
      if (filter.status && filter.status !== 'all') {
        // Map domain status to DB ChargeStatus values
        if (filter.status === 'pending') {
          query = query.where('status', 'in', ['draft', 'active', 'partial'] as const);
        } else if (filter.status === 'overdue') {
          query = query.where('status', '=', 'overdue');
        } else if (filter.status === 'paid') {
          query = query.where('status', '=', 'paid');
        }
      }

      const rows = await query
        .limit(filter.limit ?? 200)
        .offset(filter.offset ?? 0)
        .orderBy('dueDate', 'asc')
        .selectAll()
        .execute();

      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        periodId: r.periodId ?? null,
        unitId: r.unitId,
        unitLabel: r.unitLabel ?? r.unitId,
        ownerName: r.ownerName ?? null,
        amount: typeof r.amount === 'bigint' ? r.amount : BigInt(String(r.amount)),
        currency: r.currency,
        concept: r.concept,
        dueDate: new Date(r.dueDate as unknown as string),
        status: mapDbStatusToDomain(r.status),
        paidAt: r.paidAt ? new Date(r.paidAt as unknown as string) : null,
      }));
    });
  }

  async getDelinquent(tenantId: string): Promise<Charge[]> {
    return this.list(tenantId, { status: 'overdue', limit: 100 });
  }

  async getPendingReconciliation(tenantId: string): Promise<PaymentIntent[]> {
    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx
        .selectFrom('paymentIntents')
        .where('tenantId', '=', tenantId)
        .where('status', '=', 'pending')
        .orderBy('createdAt', 'asc')
        .selectAll()
        .execute();

      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        chargeId: r.chargeId ?? null,
        unitId: r.unitId,
        amount: typeof r.amount === 'bigint' ? r.amount : BigInt(String(r.amount)),
        status: 'pending' as PaymentIntent['status'],
        comprobanteUrl: r.comprobanteUrl ?? null,
        createdAt: new Date(r.createdAt as unknown as string),
      }));
    });
  }

  async getPaymentIntent(tenantId: string, id: string): Promise<PaymentIntent | null> {
    return withTenantTransaction(tenantId, async (trx) => {
      const row = await trx
        .selectFrom('paymentIntents')
        .where('tenantId', '=', tenantId)
        .where('id', '=', id)
        .selectAll()
        .executeTakeFirst();

      if (!row) return null;
      return {
        id: row.id,
        tenantId: row.tenantId,
        chargeId: row.chargeId ?? null,
        unitId: row.unitId,
        amount: typeof row.amount === 'bigint' ? row.amount : BigInt(String(row.amount)),
        status: mapDbPaymentStatusToDomain(row.status),
        comprobanteUrl: row.comprobanteUrl ?? null,
        createdAt: new Date(row.createdAt as unknown as string),
      };
    });
  }

  async approve(tenantId: string, paymentIntentId: string, actorId: string): Promise<void> {
    await withTenantTransaction(tenantId, async (trx) => {
      const result = await trx
        .updateTable('paymentIntents')
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where('tenantId', '=', tenantId)
        .where('id', '=', paymentIntentId)
        .where('status', '=', 'pending')   // C2 guard
        .executeTakeFirst();

      if (Number(result.numUpdatedRows) !== 1) {
        throw new Error('CONCURRENT_UPDATE: payment intent was already processed');
      }

      await trx.insertInto('auditLog').values({
        tenantId,
        actorId,
        action: 'payment_intent.approve',
        targetTable: 'payment_intents',
        targetId: paymentIntentId,
        beforeData: JSON.stringify({ status: 'pending' }),
        afterData: JSON.stringify({ status: 'confirmed' }),
        createdAt: new Date(),
      }).execute();
    });
  }

  async reject(tenantId: string, paymentIntentId: string, actorId: string, reason: string): Promise<void> {
    await withTenantTransaction(tenantId, async (trx) => {
      const result = await trx
        .updateTable('paymentIntents')
        .set({ status: 'failed', updatedAt: new Date() })
        .where('tenantId', '=', tenantId)
        .where('id', '=', paymentIntentId)
        .where('status', '=', 'pending')   // C2 guard
        .executeTakeFirst();

      if (Number(result.numUpdatedRows) !== 1) {
        throw new Error('CONCURRENT_UPDATE: payment intent was already processed');
      }

      await trx.insertInto('auditLog').values({
        tenantId,
        actorId,
        action: 'payment_intent.reject',
        targetTable: 'payment_intents',
        targetId: paymentIntentId,
        beforeData: JSON.stringify({ status: 'pending' }),
        afterData: JSON.stringify({ status: 'failed', reason }),
        createdAt: new Date(),
      }).execute();
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapDbStatusToDomain(dbStatus: string): Charge['status'] {
  switch (dbStatus) {
    case 'paid': return 'paid';
    case 'overdue': return 'overdue';
    case 'cancelled':
    case 'written_off': return 'waived';
    default: return 'pending'; // draft, active, partial
  }
}

function mapDbPaymentStatusToDomain(dbStatus: string): PaymentIntent['status'] {
  switch (dbStatus) {
    case 'pending':
    case 'processing': return 'pending';
    case 'confirmed':
    case 'settled': return 'approved';
    case 'failed':
    case 'reversed': return 'declined';
    default: return 'manual';
  }
}
