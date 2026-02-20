import type { IAccountRepository } from '../domain/interfaces.js';
import type { AccountBalance, UUID } from '../domain/types.js';
import { TenantNotFoundError, AccountNotFoundError } from '../domain/errors.js';
import { db } from '../../../shared/database/db.js';

/**
 * GetBalances Use Case
 *
 * Retrieves account balances for a tenant, computed from the immutable ledger.
 */
export class GetBalancesUseCase {
  constructor(private readonly accountRepo: IAccountRepository) {}

  /** Get all account balances for a tenant */
  async allBalances(tenantId: UUID): Promise<AccountBalance[]> {
    const tenant = await db
      .selectFrom('tenants')
      .select('id')
      .where('id', '=', tenantId)
      .where('isActive', '=', true)
      .executeTakeFirst();

    if (!tenant) {
      throw new TenantNotFoundError(tenantId);
    }

    return this.accountRepo.getAllBalances(tenantId);
  }

  /** Get single account balance */
  async singleBalance(tenantId: UUID, accountId: UUID): Promise<AccountBalance> {
    const balance = await this.accountRepo.getAccountBalance(tenantId, accountId);

    if (!balance) {
      throw new AccountNotFoundError(accountId);
    }

    return balance;
  }
}
