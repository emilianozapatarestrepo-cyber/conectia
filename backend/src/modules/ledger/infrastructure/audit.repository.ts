import { withTenantTransaction, db } from '../../../shared/database/db.js';
import type { IAuditRepository } from '../domain/interfaces.js';
import type { UUID, ActorId } from '../domain/types.js';

/**
 * Audit Repository — append-only audit log.
 *
 * RLS policy on audit_log allows NULL tenant_id (system-level actions).
 * For tenant-scoped audit entries, we use withTenantTransaction.
 * For system-level entries (tenantId === null), we insert directly.
 */
export class AuditRepository implements IAuditRepository {
  async log(entry: {
    tenantId: UUID | null;
    actorId: ActorId;
    action: string;
    targetTable?: string;
    targetId?: string;
    beforeData?: Record<string, unknown>;
    afterData?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const values = {
      tenantId: entry.tenantId,
      actorId: entry.actorId,
      action: entry.action,
      targetTable: entry.targetTable ?? null,
      targetId: entry.targetId ?? null,
      beforeData: entry.beforeData ? JSON.stringify(entry.beforeData) : null,
      afterData: entry.afterData ? JSON.stringify(entry.afterData) : null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    };

    if (entry.tenantId) {
      // Tenant-scoped audit: SET LOCAL for RLS
      await withTenantTransaction(entry.tenantId, async (trx) => {
        await trx.insertInto('auditLog').values(values).execute();
      });
    } else {
      // System-level audit (no tenant context): RLS allows NULL tenant_id
      await db.insertInto('auditLog').values(values).execute();
    }
  }
}
