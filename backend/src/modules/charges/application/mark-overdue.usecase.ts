import { v4 as uuidv4 } from 'uuid';
import { withTenantTransaction } from '../../../shared/database/db.js';

export interface MarkOverdueResult {
  markedCount: number;
  totalAmount:  bigint;
}

export class MarkOverdueUseCase {
  async execute(tenantId: string): Promise<MarkOverdueResult> {
    return withTenantTransaction(tenantId, async (trx) => {
      const now = new Date();

      // Find all active/partial charges whose due date has passed — not yet overdue
      const candidates = await trx
        .selectFrom('charges')
        .select(['id', 'unitId', 'unitLabel', 'ownerName', 'amount'])
        .where('tenantId', '=', tenantId)
        .where('status', 'in', ['active', 'partial', 'draft'])
        .where('dueDate', '<', now)
        .execute();

      if (candidates.length === 0) {
        return { markedCount: 0, totalAmount: 0n };
      }

      const ids        = candidates.map((c) => c.id);
      const totalAmount = candidates.reduce((s, c) => s + BigInt(c.amount), 0n);

      // Bulk-update to overdue
      await trx
        .updateTable('charges')
        .set({ status: 'overdue', updatedAt: now })
        .where('tenantId', '=', tenantId)
        .where('id', 'in', ids)
        .execute();

      // One alert per unit (group by unitId to avoid duplicate alerts)
      const byUnit = new Map<string, typeof candidates[0]>();
      for (const c of candidates) {
        if (!byUnit.has(c.unitId)) byUnit.set(c.unitId, c);
      }

      const alerts = Array.from(byUnit.values()).map((c) => ({
        id:         uuidv4(),
        tenantId,
        type:       'mora_nueva' as const,
        severity:   'warning'   as const,
        unitId:     c.unitId,
        unitLabel:  c.unitLabel ?? c.unitId,
        amount:     BigInt(c.amount),
        message:    `Unidad ${c.unitLabel ?? c.unitId} entró en mora`,
        actionType: 'view_cartera',
        actionLabel:'Ver cartera',
        resolved:   false,
        expiresAt:  null,
      }));

      if (alerts.length > 0) {
        await trx
          .insertInto('alerts')
          .values(alerts.map((a) => ({
            ...a,
            amount: a.amount.toString(),
          })))
          .onConflict((oc) => oc.doNothing())
          .execute();
      }

      return { markedCount: ids.length, totalAmount };
    });
  }
}
