/**
 * Ledger Domain Types — Pure TypeScript, no framework dependencies.
 * These types define the core financial domain model.
 */

// ─── Value Objects ──────────────────────────────────────────────────────────

/** Money amount in the smallest currency unit (centavos for COP) */
export type MoneyAmount = bigint;

/** ISO 4217 currency code */
export type CurrencyCode = 'COP' | 'USD';

/** UUID string */
export type UUID = string;

/** Firebase UID */
export type ActorId = string;

// ─── Enums ──────────────────────────────────────────────────────────────────

export const AccountType = {
  ASSET: 'asset',
  LIABILITY: 'liability',
  EQUITY: 'equity',
  REVENUE: 'revenue',
  EXPENSE: 'expense',
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const EntryType = {
  DEBIT: 'debit',
  CREDIT: 'credit',
} as const;
export type EntryType = (typeof EntryType)[keyof typeof EntryType];

export const TransactionType = {
  CHARGE: 'charge',
  PAYMENT: 'payment',
  ADJUSTMENT: 'adjustment',
  REVERSAL: 'reversal',
  MIGRATION: 'migration',
  TRANSFER: 'transfer',
  FEE: 'fee',
  SETTLEMENT: 'settlement',
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

// ─── Domain Entities ────────────────────────────────────────────────────────

export interface LedgerLine {
  accountId: UUID;
  entryType: EntryType;
  amount: MoneyAmount;
  description?: string;
}

export interface PostTransactionInput {
  tenantId: UUID;
  transactionType: TransactionType;
  description: string;
  effectiveDate: Date;
  periodId?: UUID;
  idempotencyKey: UUID;
  /** ISO 4217 currency code. Defaults to 'COP' if not provided. */
  currency?: CurrencyCode;
  sourceType?: string;
  sourceId?: string;
  createdBy: ActorId;
  lines: LedgerLine[];
  metadata?: Record<string, unknown>;
}

export interface TransactionResult {
  transactionId: UUID;
  txHash: string;
  entries: Array<{
    id: UUID;
    accountId: UUID;
    entryType: EntryType;
    amount: string; // bigint serialized
    entryHash: string;
  }>;
}

export interface AccountBalance {
  tenantId: UUID;
  accountId: UUID;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  totalDebits: string;
  totalCredits: string;
  balance: string;
}
