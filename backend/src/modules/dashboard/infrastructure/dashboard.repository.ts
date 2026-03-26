import { sql } from 'kysely';
import { withTenantTransaction } from '../../../shared/database/db.js';
import type { IDashboardRepository } from '../domain/interfaces.js';
import type { DashboardSummary, TrendPoint, DelinquentUnit, Alert } from '../domain/types.js';
import type { ChargeStatus } from '../../../shared/database/schema.js';

export class DashboardRepository implements IDashboardRepository {

  async getSummary(tenantId: string, period: string): Promise<DashboardSummary> {
    return withTenantTransaction(tenantId, async (trx) => {
      const parts = period.split('-').map(Number);
      const year = parts[0] ?? 0;
      const month = parts[1] ?? 0;
      const now = new Date();

      // Sub-query: period IDs matching year/month for this tenant
      const periodSubQuery = trx
        .selectFrom('periods')
        .select('id')
        .where('tenantId', '=', tenantId)
        .where('year', '=', year)
        .where('month', '=', month);

      const pendingStatuses: ChargeStatus[] = ['pending' as ChargeStatus, 'overdue'];

      // Aggregate charges for the period
      const row = await trx
        .selectFrom('charges')
        .where('tenantId', '=', tenantId)
        .where('periodId', 'in', periodSubQuery)
        .select((eb) => [
          eb.fn.count<string>('id').as('total'),
          eb.fn.count<string>('id').filterWhere('status', '=', 'paid').as('paid'),
          eb.fn.count<string>('id').filterWhere('status', '=', 'overdue').as('overdue'),
          eb.fn.sum<string>('amount').filterWhere('status', '=', 'paid').as('collected'),
          eb.fn.sum<string>('amount').filterWhere('status', 'in', pendingStatuses).as('pendingAmt'),
          eb.fn.sum<string>('amount').filterWhere('status', '=', 'overdue').as('delinquentAmt'),
        ])
        .executeTakeFirstOrThrow();

      // Count pending reconciliation payment intents
      const piRow = await trx
        .selectFrom('paymentIntents')
        .where('tenantId', '=', tenantId)
        .where('status', '=', 'pending')
        .select((eb) => [eb.fn.count<string>('id').as('count')])
        .executeTakeFirstOrThrow();

      const total = Number(row.total) || 0;
      const paid = Number(row.paid) || 0;
      const overdue = Number(row.overdue) || 0;
      const collected = BigInt(row.collected ?? '0');
      const pendingAmt = BigInt(row.pendingAmt ?? '0');
      const delinquentAmt = BigInt(row.delinquentAmt ?? '0');

      return {
        tenantId,
        period,
        totalUnits: total,
        unitsPaid: paid,
        unitsDelinquent: overdue,
        unitsOverdue: Math.max(0, total - paid - overdue),
        collectedAmount: collected,
        pendingAmount: pendingAmt,
        delinquentAmount: delinquentAmt,
        collectedPct: total > 0 ? Math.round((paid / total) * 100) : 0,
        delinquentPct: total > 0 ? Math.round((overdue / total) * 100) : 0,
        pendingReconciliationCount: Number(piRow.count),
        currentDay: now.getDate(),
        daysInMonth: new Date(year, month, 0).getDate(),
        prevPeriodCollectedPct: null,
        prevPeriodDelinquentPct: null,
      };
    });
  }

  async getTrend(tenantId: string, months: number): Promise<TrendPoint[]> {
    return withTenantTransaction(tenantId, async (trx) => {
      const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

      const rows = await trx
        .selectFrom('charges')
        .innerJoin('periods', 'charges.periodId', 'periods.id')
        .where('charges.tenantId', '=', tenantId)
        .orderBy('periods.year', 'desc')
        .orderBy('periods.month', 'desc')
        .select([
          'periods.year',
          'periods.month',
          'charges.status',
          'charges.amount',
        ])
        .execute();

      // Group by period in JS
      const map = new Map<string, { year: number; month: number; paid: bigint; total: bigint }>();
      for (const r of rows) {
        const key = `${r.year}-${String(r.month).padStart(2, '0')}`;
        if (!map.has(key)) map.set(key, { year: r.year, month: r.month, paid: 0n, total: 0n });
        const entry = map.get(key)!;
        const amt = typeof r.amount === 'bigint' ? r.amount : BigInt(String(r.amount));
        entry.total += amt;
        if (r.status === 'paid') entry.paid += amt;
      }

      return Array.from(map.entries())
        .slice(0, months)
        .reverse()
        .map(([period, data]) => ({
          period,
          label: MONTH_LABELS[data.month - 1] ?? period,
          collectedAmount: data.paid,
          collectedPct: data.total > 0n ? Number((data.paid * 100n) / data.total) : 0,
        }));
    });
  }

  async getDelinquent(tenantId: string): Promise<DelinquentUnit[]> {
    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx
        .selectFrom('charges')
        .where('tenantId', '=', tenantId)
        .where('status', '=', 'overdue')
        .groupBy(['unitId', 'unitLabel', 'ownerName'])
        .orderBy((eb) => eb.fn.sum<string>('amount'), 'desc')
        .select((eb) => [
          'unitId',
          'unitLabel',
          'ownerName',
          eb.fn.sum<string>('amount').as('totalOwed'),
          eb.fn.count<string>('id').as('monthsCount'),
          sql<Date | null>`MAX(paid_at)`.as('lastPayment'),
        ])
        .execute();

      return rows.map((r) => ({
        unitId: r.unitId,
        unitLabel: r.unitLabel ?? r.unitId,
        ownerName: r.ownerName ?? null,
        totalOwed: BigInt(r.totalOwed ?? '0'),
        monthsDelinquent: Number(r.monthsCount),
        lastPaymentDate: r.lastPayment ?? null,
      }));
    });
  }

  async getAlerts(tenantId: string): Promise<Alert[]> {
    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx
        .selectFrom('alerts')
        .where('tenantId', '=', tenantId)
        .where('resolved', '=', false)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .selectAll()
        .execute();

      return rows.map((r) => ({
        id: r.id,
        type: r.type as Alert['type'],
        severity: r.severity as Alert['severity'],
        unitId: r.unitId ?? null,
        unitLabel: r.unitLabel ?? null,
        amount: r.amount ? (typeof r.amount === 'bigint' ? r.amount : BigInt(String(r.amount))) : null,
        message: r.message,
        actionType: r.actionType ?? null,
        actionLabel: r.actionLabel ?? null,
        createdAt: r.createdAt,
      }));
    });
  }
}
