/**
 * Ledger Domain Interfaces — Port definitions for Clean Architecture.
 * Infrastructure adapters (Kysely repos) implement these.
 */
import type {
  UUID,
  ActorId,
  PostTransactionInput,
  TransactionResult,
  AccountBalance,
} from './types.js';

// ─── Transaction Repository ─────────────────────────────────────────────────

export interface ITransactionRepository {
  /**
   * Posts a balanced double-entry transaction atomically.
   * Computes hash chain, creates transaction + ledger_entries in a single DB transaction.
   * Throws if double-entry balance check fails.
   */
  postTransaction(input: PostTransactionInput): Promise<TransactionResult>;

  /**
   * Gets a transaction by ID (including its entries).
   */
  getTransaction(tenantId: UUID, transactionId: UUID): Promise<TransactionResult | null>;

  /**
   * Gets the latest transaction hash for the hash chain.
   */
  getLatestTxHash(tenantId: UUID): Promise<string | null>;
}

// ─── Account Repository ─────────────────────────────────────────────────────

export interface IAccountRepository {
  /**
   * Gets real-time balance for a single account, computed from ledger entries.
   */
  getAccountBalance(tenantId: UUID, accountId: UUID): Promise<AccountBalance | null>;

  /**
   * Gets all account balances for a tenant.
   */
  getAllBalances(tenantId: UUID): Promise<AccountBalance[]>;

  /**
   * Verifies that an account exists and belongs to the given tenant.
   */
  accountExists(tenantId: UUID, accountId: UUID): Promise<boolean>;
}

// ─── Audit Repository ───────────────────────────────────────────────────────

export interface IAuditRepository {
  /**
   * Appends an entry to the immutable audit log.
   */
  log(entry: {
    tenantId: UUID | null;
    actorId: ActorId;
    action: string;
    targetTable?: string;
    targetId?: string;
    beforeData?: Record<string, unknown>;
    afterData?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void>;
}
