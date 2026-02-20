import { sql } from 'kysely';
import { withTenantTransaction } from '../../../shared/database/db.js';
import type { IAccountRepository } from '../domain/interfaces.js';
import type { AccountBalance, UUID } from '../domain/types.js';

/**
 * Account Repository — All queries run inside withTenantTransaction
 * to ensure RLS policies are enforced. Cross-tenant data leakage
 * is prevented at the PostgreSQL level.
 */
export class AccountRepository implements IAccountRepository {
  async getAccountBalance(
    tenantId: UUID,
    accountId: UUID,
  ): Promise<AccountBalance | null> {
    return withTenantTransaction(tenantId, async (trx) => {
      // Compute balance directly from ledger entries (source of truth)
      const result = await sql<{
        tenant_id: string;
        account_id: string;
        account_code: string;
        account_name: string;
        account_type: string;
        total_debits: string;
        total_credits: string;
        balance: string;
      }>`
        SELECT
          le.tenant_id,
          le.account_id,
          coa.code AS account_code,
          coa.name AS account_name,
          coa.account_type,
          COALESCE(SUM(CASE WHEN le.entry_type = 'debit' THEN le.amount ELSE 0 END), 0)::TEXT AS total_debits,
          COALESCE(SUM(CASE WHEN le.entry_type = 'credit' THEN le.amount ELSE 0 END), 0)::TEXT AS total_credits,
          CASE
            WHEN coa.account_type IN ('asset', 'expense')
              THEN COALESCE(SUM(CASE WHEN le.entry_type = 'debit' THEN le.amount ELSE -le.amount END), 0)::TEXT
            ELSE
              COALESCE(SUM(CASE WHEN le.entry_type = 'credit' THEN le.amount ELSE -le.amount END), 0)::TEXT
          END AS balance
        FROM ledger_entries le
        JOIN chart_of_accounts coa ON le.account_id = coa.id
        WHERE le.account_id = ${accountId}::uuid
        GROUP BY le.tenant_id, le.account_id, coa.code, coa.name, coa.account_type
      `.execute(trx);

      const row = result.rows[0];
      if (!row) return null;

      return {
        tenantId: row.tenant_id,
        accountId: row.account_id,
        accountCode: row.account_code,
        accountName: row.account_name,
        accountType: row.account_type as AccountBalance['accountType'],
        totalDebits: row.total_debits,
        totalCredits: row.total_credits,
        balance: row.balance,
      };
    });
  }

  async getAllBalances(tenantId: UUID): Promise<AccountBalance[]> {
    return withTenantTransaction(tenantId, async (trx) => {
      // RLS filters to current tenant automatically — no WHERE tenant_id needed
      // but v_account_balances includes it for the result set.
      const result = await sql<{
        tenant_id: string;
        account_id: string;
        account_code: string;
        account_name: string;
        account_type: string;
        total_debits: string;
        total_credits: string;
        balance: string;
      }>`
        SELECT * FROM v_account_balances
        ORDER BY account_code
      `.execute(trx);

      return result.rows.map((row) => ({
        tenantId: row.tenant_id,
        accountId: row.account_id,
        accountCode: row.account_code,
        accountName: row.account_name,
        accountType: row.account_type as AccountBalance['accountType'],
        totalDebits: row.total_debits,
        totalCredits: row.total_credits,
        balance: row.balance,
      }));
    });
  }

  async accountExists(tenantId: UUID, accountId: UUID): Promise<boolean> {
    return withTenantTransaction(tenantId, async (trx) => {
      const row = await trx
        .selectFrom('chartOfAccounts')
        .select('id')
        .where('id', '=', accountId)
        .where('isActive', '=', true)
        .executeTakeFirst();

      return row !== undefined;
    });
  }
}
