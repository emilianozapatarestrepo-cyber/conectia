/**
 * Kysely type definitions for the Conectia financial database.
 * These types mirror the PostgreSQL schema defined in migrations 001 + 002.
 * All column names use camelCase (CamelCasePlugin handles the conversion).
 */
import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

// ─── Enums as string literals ────────────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type EntryType = 'debit' | 'credit';
export type TransactionType =
  | 'charge'
  | 'payment'
  | 'adjustment'
  | 'reversal'
  | 'migration'
  | 'transfer'
  | 'fee'
  | 'settlement';
export type ChargeStatus =
  | 'draft'
  | 'active'
  | 'paid'
  | 'partial'
  | 'overdue'
  | 'cancelled'
  | 'written_off';
export type PaymentIntentStatus =
  | 'pending'
  | 'processing'
  | 'confirmed'
  | 'failed'
  | 'reversed'
  | 'settled';
export type WebhookProcessingStatus = 'pending' | 'processed' | 'failed' | 'ignored';
export type PeriodStatus = 'open' | 'closing' | 'closed';

// ─── Table Interfaces ────────────────────────────────────────────────────────

export interface TenantsTable {
  id: Generated<string>;
  externalId: string | null;
  name: string;
  type: string;
  address: string | null;
  taxId: string | null;
  currency: string;
  timezone: string;
  isActive: boolean;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ChartOfAccountsTable {
  id: Generated<string>;
  tenantId: string;
  code: string;
  name: string;
  accountType: AccountType;
  parentId: string | null;
  isActive: boolean;
  metadata: ColumnType<Record<string, unknown>, string | undefined, string | undefined>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface FiscalPeriodsTable {
  id: Generated<string>;
  tenantId: string;
  yearMonth: string;
  status: PeriodStatus;
  closedAt: Date | null;
  closedBy: string | null;
  createdAt: Generated<Date>;
}

export interface TransactionsTable {
  id: Generated<string>;
  tenantId: string;
  transactionType: TransactionType;
  description: string;
  periodId: string | null;
  effectiveDate: ColumnType<Date, Date | string, Date | string>;
  postedAt: Generated<Date>;
  idempotencyKey: string;
  sourceType: string | null;
  sourceId: string | null;
  metadata: ColumnType<Record<string, unknown>, string | undefined, string | undefined>;
  createdBy: string;
  createdAt: Generated<Date>;
  prevTxHash: string | null;
  txHash: string;
}

export interface LedgerEntriesTable {
  id: Generated<string>;
  transactionId: string;
  tenantId: string;
  accountId: string;
  entryType: EntryType;
  amount: ColumnType<bigint | string, bigint | number | string, never>; // BIGINT, never updateable
  currency: string;
  description: string | null;
  metadata: ColumnType<Record<string, unknown>, string | undefined, never>;
  createdAt: Generated<Date>;
  entryHash: string;
}

export interface ChargesTable {
  id: Generated<string>;
  tenantId: string;
  unitId: string;
  userId: string;
  concept: string;
  amount: ColumnType<bigint | string, bigint | number | string, bigint | number | string>;
  currency: string;
  dueDate: ColumnType<Date, Date | string, Date | string>;
  periodId: string | null;
  status: ChargeStatus;
  paidAmount: ColumnType<bigint | string, bigint | number | string, bigint | number | string>;
  ledgerTxId: string | null;
  idempotencyKey: string;
  metadata: ColumnType<Record<string, unknown>, string | undefined, string | undefined>;
  createdBy: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
  unitLabel: string | null;
  ownerName: string | null;
  paidAt: Date | null;
  transactionId: string | null;
}

export interface PaymentIntentsTable {
  id: Generated<string>;
  tenantId: string;
  unitId: string;
  userId: string;
  chargeIds: string[];
  amount: ColumnType<bigint | string, bigint | number | string, bigint | number | string>;
  currency: string;
  provider: string;
  providerRef: string | null;
  status: PaymentIntentStatus;
  idempotencyKey: string;
  ledgerTxId: string | null;
  metadata: ColumnType<Record<string, unknown>, string | undefined, string | undefined>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
  chargeId: string | null;
  externalRef: string | null;
  receiptUrl: string | null;
  comprobanteUrl: string | null;
  webhookPayload: ColumnType<Record<string, unknown> | null, Record<string, unknown> | string | null, Record<string, unknown> | string | null>;
  webhookReceivedAt: Date | null;
}

export interface WebhookEventsTable {
  id: Generated<string>;
  provider: string;
  eventType: string;
  providerEventId: string;
  rawPayload: ColumnType<Record<string, unknown>, Record<string, unknown> | string, never>;
  signature: string | null;
  signatureValid: boolean | null;
  processingStatus: WebhookProcessingStatus;
  processedAt: Date | null;
  errorMessage: string | null;
  relatedIntentId: string | null;
  idempotencyKey: string;
  receivedAt: Generated<Date>;
}

export interface SuspenseEntriesTable {
  id: Generated<string>;
  tenantId: string | null;
  webhookEventId: string;
  amount: ColumnType<bigint | string, bigint | number | string, bigint | number | string>;
  currency: string;
  reason: string;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionType: string | null;
  resolutionTxId: string | null;
  createdAt: Generated<Date>;
}

export interface AuditLogTable {
  id: Generated<string>;
  tenantId: string | null;
  actorId: string;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  beforeData: ColumnType<Record<string, unknown> | null, Record<string, unknown> | string | null, never>;
  afterData: ColumnType<Record<string, unknown> | null, Record<string, unknown> | string | null, never>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Generated<Date>;
}

export interface TenantLedgerStateTable {
  tenantId: string;
  currentHash: string;
  txCount: ColumnType<bigint | string, bigint | number | string, bigint | number | string>;
  lastTxId: string | null;
  updatedAt: Generated<Date>;
}

export type MembershipRole = 'resident' | 'owner' | 'staff' | 'manager' | 'admin';
export type MembershipStatus = 'active' | 'suspended' | 'removed';

export interface TenantMembershipsTable {
  id: Generated<string>;
  firebaseUid: string;
  tenantId: string;
  role: MembershipRole;
  unitId: string | null;
  status: MembershipStatus;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface PeriodsTable {
  id: Generated<string>;
  tenantId: string;
  label: string;
  year: number;
  month: number;
  startsAt: ColumnType<Date, Date | string, Date | string>;
  endsAt: ColumnType<Date, Date | string, Date | string>;
  dueDate: ColumnType<Date, Date | string, Date | string>;
  createdAt: Generated<Date>;
}

export type AlertType = 'mora_critica' | 'mora_nueva' | 'conciliacion_pendiente' | 'vencimiento_proximo' | 'pago_confirmado';
export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface AlertsTable {
  id: Generated<string>;
  tenantId: string;
  type: AlertType;
  severity: AlertSeverity;
  unitId: string | null;
  unitLabel: string | null;
  amount: ColumnType<bigint | string, bigint | number | string, bigint | number | string> | null;
  message: string;
  actionType: string | null;
  actionLabel: string | null;
  resolved: Generated<boolean>;
  resolvedAt: Date | null;
  createdAt: Generated<Date>;
  expiresAt: Date | null;
}

// ─── Database Interface (Kysely root) ────────────────────────────────────────

export interface DB {
  tenants: TenantsTable;
  chartOfAccounts: ChartOfAccountsTable;
  fiscalPeriods: FiscalPeriodsTable;
  transactions: TransactionsTable;
  ledgerEntries: LedgerEntriesTable;
  charges: ChargesTable;
  paymentIntents: PaymentIntentsTable;
  webhookEvents: WebhookEventsTable;
  suspenseEntries: SuspenseEntriesTable;
  auditLog: AuditLogTable;
  tenantLedgerState: TenantLedgerStateTable;
  tenantMemberships: TenantMembershipsTable;
  periods: PeriodsTable;
  alerts: AlertsTable;
}

// ─── Convenience Types ───────────────────────────────────────────────────────

export type Tenant = Selectable<TenantsTable>;
export type NewTenant = Insertable<TenantsTable>;
export type TenantUpdate = Updateable<TenantsTable>;

export type Account = Selectable<ChartOfAccountsTable>;
export type NewAccount = Insertable<ChartOfAccountsTable>;

export type FiscalPeriod = Selectable<FiscalPeriodsTable>;
export type NewFiscalPeriod = Insertable<FiscalPeriodsTable>;

export type Transaction = Selectable<TransactionsTable>;
export type NewTransaction = Insertable<TransactionsTable>;

export type LedgerEntry = Selectable<LedgerEntriesTable>;
export type NewLedgerEntry = Insertable<LedgerEntriesTable>;

export type Charge = Selectable<ChargesTable>;
export type NewCharge = Insertable<ChargesTable>;
export type ChargeUpdate = Updateable<ChargesTable>;

export type PaymentIntent = Selectable<PaymentIntentsTable>;
export type NewPaymentIntent = Insertable<PaymentIntentsTable>;
export type PaymentIntentUpdate = Updateable<PaymentIntentsTable>;

export type WebhookEvent = Selectable<WebhookEventsTable>;
export type NewWebhookEvent = Insertable<WebhookEventsTable>;

export type SuspenseEntry = Selectable<SuspenseEntriesTable>;
export type NewSuspenseEntry = Insertable<SuspenseEntriesTable>;

export type AuditLogEntry = Selectable<AuditLogTable>;
export type NewAuditLogEntry = Insertable<AuditLogTable>;

export type TenantLedgerState = Selectable<TenantLedgerStateTable>;

export type TenantMembership = Selectable<TenantMembershipsTable>;
export type NewTenantMembership = Insertable<TenantMembershipsTable>;
export type TenantMembershipUpdate = Updateable<TenantMembershipsTable>;
