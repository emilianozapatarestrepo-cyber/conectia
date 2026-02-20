import type { ITransactionRepository, IAccountRepository, IAuditRepository } from '../domain/interfaces.js';
import type { PostTransactionInput, TransactionResult } from '../domain/types.js';
import {
  EmptyTransactionError,
  LedgerImbalanceError,
  InvalidAmountError,
  AccountNotFoundError,
  TenantNotFoundError,
} from '../domain/errors.js';
import { db } from '../../../shared/database/db.js';

/**
 * PostTransaction Use Case
 *
 * Validates a double-entry transaction and posts it atomically.
 * Performs application-level checks before delegating to the repository.
 * The DB-level DEFERRED constraint trigger provides the final safety net.
 */
export class PostTransactionUseCase {
  constructor(
    private readonly txRepo: ITransactionRepository,
    private readonly accountRepo: IAccountRepository,
    private readonly auditRepo: IAuditRepository,
  ) {}

  async execute(input: PostTransactionInput): Promise<TransactionResult> {
    // ── 1. Validate lines ──
    if (input.lines.length < 2) {
      throw new EmptyTransactionError();
    }

    let debitSum = 0n;
    let creditSum = 0n;

    for (const line of input.lines) {
      if (line.amount <= 0n) {
        throw new InvalidAmountError();
      }
      if (line.entryType === 'debit') {
        debitSum += line.amount;
      } else {
        creditSum += line.amount;
      }
    }

    if (debitSum !== creditSum) {
      throw new LedgerImbalanceError(debitSum, creditSum);
    }

    // ── 2. Verify tenant exists ──
    const tenant = await db
      .selectFrom('tenants')
      .select('id')
      .where('id', '=', input.tenantId)
      .where('isActive', '=', true)
      .executeTakeFirst();

    if (!tenant) {
      throw new TenantNotFoundError(input.tenantId);
    }

    // ── 3. Verify all accounts exist and belong to the tenant ──
    const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
    for (const accountId of accountIds) {
      const exists = await this.accountRepo.accountExists(input.tenantId, accountId);
      if (!exists) {
        throw new AccountNotFoundError(accountId);
      }
    }

    // ── 4. Post transaction (atomic DB transaction) ──
    const result = await this.txRepo.postTransaction(input);

    // ── 5. Audit log (fire-and-forget, don't block the response) ──
    this.auditRepo
      .log({
        tenantId: input.tenantId,
        actorId: input.createdBy,
        action: `transaction.posted.${input.transactionType}`,
        targetTable: 'transactions',
        targetId: result.transactionId,
        afterData: {
          transactionId: result.transactionId,
          txHash: result.txHash,
          type: input.transactionType,
          description: input.description,
          lineCount: input.lines.length,
          idempotencyKey: input.idempotencyKey,
        },
      })
      .catch((err: Error) => {
        console.error('[Audit] Failed to log transaction:', err.message);
      });

    return result;
  }
}
