/**
 * Kysely type definitions for the Conectia financial database.
 * These types mirror the PostgreSQL schema defined in migrations 001–004.
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

export interface UnitsTable {
  id:          Generated<string>;
  tenantId:    string;
  unitId:      string;          // building-scoped identifier: "A-101"
  label:       string;
  ownerName:   string | null;
  phone:       string | null;   // Colombian mobile without +57
  email:       string | null;
  feeAmount:   ColumnType<bigint | string, bigint | number | string, bigint | number | string>;
  coefficient: ColumnType<string, number | string, number | string>;  // coeficiente de copropiedad (Ley 675)
  active:      Generated<boolean>;
  createdAt:   Generated<Date>;
  updatedAt:   Generated<Date>;
}

// ── SaaS Billing ──────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';

export interface PlansTable {
  id:                Generated<string>;
  code:              string;
  name:              string;
  maxUnits:          number | null;
  monthlyPriceCents: ColumnType<bigint | string, bigint | number | string, bigint | number | string>;
  features:          ColumnType<Record<string, unknown>, string | undefined, string | undefined>;
  isActive:          Generated<boolean>;
  createdAt:         Generated<Date>;
}

export interface SubscriptionsTable {
  id:                 Generated<string>;
  tenantId:           string;
  planId:             string;
  status:             SubscriptionStatus;
  trialEndsAt:        Date | null;
  currentPeriodStart: ColumnType<Date, Date | string, Date | string>;
  currentPeriodEnd:   ColumnType<Date, Date | string, Date | string>;
  cancelledAt:        Date | null;
  paymentMethod:      string | null;
  externalRef:        string | null;
  activatedBy:        string | null;
  createdAt:          Generated<Date>;
  updatedAt:          Generated<Date>;
}

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

// ── PQRS ──────────────────────────────────────────────────────────────────────

export type PqrsCategory = 'peticion' | 'queja' | 'reclamo' | 'sugerencia';
export type PqrsStatus = 'abierta' | 'en_proceso' | 'respondida' | 'cerrada';
export type PqrsPriority = 'baja' | 'media' | 'alta';
export type PqrsSubmitterType = 'residente' | 'administrador' | 'visitante';

export interface PqrsTable {
  id: Generated<string>;
  tenantId: string;
  unitId: string | null;
  unitLabel: string | null;
  category: PqrsCategory;
  subject: string;
  description: string;
  status: PqrsStatus;
  priority: PqrsPriority;
  submittedBy: string;
  submittedByPhone: string | null;
  submitterType: PqrsSubmitterType;
  adminResponse: string | null;
  respondedAt: Date | null;
  respondedBy: string | null;
  dueDate: ColumnType<Date, Date | string | undefined, Date | string>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

// ── Amenities & Bookings ──────────────────────────────────────────────────────

export interface AmenitiesTable {
  id:          Generated<string>;
  tenantId:    string;
  name:        string;
  description: string | null;
  icon:        string | null;    // emoji for UI
  capacity:    number;           // max simultaneous groups
  openTime:    string;           // "HH:MM:SS" from pg TIME
  closeTime:   string;
  slotMinutes: number;
  advanceDays: number;
  active:      Generated<boolean>;
  createdAt:   Generated<Date>;
  updatedAt:   Generated<Date>;
}

export type BookingStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'cancelada';

export interface AmenityBookingsTable {
  id:            Generated<string>;
  tenantId:      string;
  amenityId:     string;
  unitId:        string | null;
  unitLabel:     string | null;
  residentName:  string;
  residentPhone: string | null;
  date:          ColumnType<Date, Date | string, Date | string>;
  startTime:     string;         // "HH:MM"
  endTime:       string;
  attendees:     number;
  status:        Generated<BookingStatus>;
  notes:         string | null;
  adminNotes:    string | null;
  approvedBy:    string | null;
  approvedAt:    Date | null;
  createdAt:     Generated<Date>;
  updatedAt:     Generated<Date>;
}

// ── Announcements (Comunicados) ───────────────────────────────────────────────

export type AnnouncementAudience = 'todos' | 'morosos' | 'seleccion';
export type AnnouncementStatus = 'borrador' | 'publicado';

export interface AnnouncementsTable {
  id:          Generated<string>;
  tenantId:    string;
  title:       string;
  body:        string;
  audience:    AnnouncementAudience;
  unitIds:     string[] | null;
  status:      Generated<AnnouncementStatus>;
  createdBy:   string;
  publishedAt: Date | null;
  createdAt:   Generated<Date>;
  updatedAt:   Generated<Date>;
}

export interface AnnouncementRecipientsTable {
  id:             Generated<string>;
  tenantId:       string;
  announcementId: string;
  unitId:         string;
  unitLabel:      string | null;
  ownerName:      string | null;
  phone:          string | null;
  sent:           Generated<boolean>;
  sentAt:         Date | null;
  createdAt:      Generated<Date>;
}

// ── Unit Portal Tokens (Portal Residente) ─────────────────────────────────────

export interface UnitPortalTokensTable {
  id:             Generated<string>;
  tenantId:       string;
  unitId:         string;          // building-scoped id (units.unitId)
  tokenHash:      string;          // sha256 hex — raw token never stored
  active:         Generated<boolean>;
  createdAt:      Generated<Date>;
  revokedAt:      Date | null;
  lastAccessedAt: Date | null;
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
  units: UnitsTable;
  plans: PlansTable;
  subscriptions: SubscriptionsTable;
  pqrs: PqrsTable;
  amenities: AmenitiesTable;
  amenityBookings: AmenityBookingsTable;
  announcements: AnnouncementsTable;
  announcementRecipients: AnnouncementRecipientsTable;
  unitPortalTokens: UnitPortalTokensTable;
  assemblies: AssembliesTable;
  assemblyAgendaItems: AssemblyAgendaItemsTable;
  assemblyAttendances: AssemblyAttendancesTable;
  assemblyVotes: AssemblyVotesTable;
  chargeReminders: ChargeRemindersTable;
  budgetItems: BudgetItemsTable;
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

export type Period = Selectable<PeriodsTable>;
export type NewPeriod = Insertable<PeriodsTable>;
export type PeriodUpdate = Updateable<PeriodsTable>;

export type Alert = Selectable<AlertsTable>;
export type NewAlert = Insertable<AlertsTable>;
export type AlertUpdate = Updateable<AlertsTable>;

export type Plan = Selectable<PlansTable>;
export type Subscription = Selectable<SubscriptionsTable>;
export type NewSubscription = Insertable<SubscriptionsTable>;
export type SubscriptionUpdate = Updateable<SubscriptionsTable>;

export type Pqrs = Selectable<PqrsTable>;
export type NewPqrs = Insertable<PqrsTable>;
export type PqrsUpdate = Updateable<PqrsTable>;

export type Amenity = Selectable<AmenitiesTable>;
export type NewAmenity = Insertable<AmenitiesTable>;
export type AmenityUpdate = Updateable<AmenitiesTable>;

export type AmenityBooking = Selectable<AmenityBookingsTable>;
export type NewAmenityBooking = Insertable<AmenityBookingsTable>;
export type AmenityBookingUpdate = Updateable<AmenityBookingsTable>;

export type Announcement = Selectable<AnnouncementsTable>;
export type NewAnnouncement = Insertable<AnnouncementsTable>;
export type AnnouncementUpdate = Updateable<AnnouncementsTable>;

export type AnnouncementRecipient = Selectable<AnnouncementRecipientsTable>;
export type NewAnnouncementRecipient = Insertable<AnnouncementRecipientsTable>;

// ── Assemblies (Sprint 12 — Ley 675) ─────────────────────────────────────────

export type AssemblyStatus   = 'borrador' | 'convocada' | 'en_curso' | 'cerrada';
export type AssemblyType     = 'ordinaria' | 'extraordinaria';
export type AgendaItemType   = 'informativo' | 'votacion';
export type VoteValue        = 'a_favor' | 'en_contra' | 'abstencion';
export type AttendanceMode   = 'presencial' | 'virtual' | 'poder';

export interface AssembliesTable {
  id:                 Generated<string>;
  tenantId:           string;
  type:               AssemblyType;
  title:              string;
  status:             Generated<AssemblyStatus>;
  scheduledDate:      ColumnType<Date | null, Date | string | null, Date | string | null>;
  scheduledTime:      string | null;
  location:           string | null;
  quorumPct:          ColumnType<string, number | string, number | string>;
  totalCoefficient:   ColumnType<string | null, number | string | null, number | string | null>;
  notes:              string | null;
  minutesText:        string | null;
  minutesApprovedAt:  Date | null;
  createdBy:          string;
  createdAt:          Generated<Date>;
  updatedAt:          Generated<Date>;
}

export interface AssemblyAgendaItemsTable {
  id:               Generated<string>;
  assemblyId:       string;
  tenantId:         string;
  order:            number;
  title:            string;
  description:      string | null;
  type:             AgendaItemType;
  requiredMajority: ColumnType<string, number | string, number | string>;
  resolvedStatus:   'aprobado' | 'rechazado' | 'abstencion' | null;
  createdAt:        Generated<Date>;
}

export interface AssemblyAttendancesTable {
  id:             Generated<string>;
  assemblyId:     string;
  tenantId:       string;
  unitId:         string;
  unitLabel:      string;
  ownerName:      string | null;
  coefficient:    ColumnType<string, number | string, number | string>;
  attendanceMode: AttendanceMode;
  delegateName:   string | null;
  registeredAt:   Generated<Date>;
}

export interface AssemblyVotesTable {
  id:           Generated<string>;
  assemblyId:   string;
  agendaItemId: string;
  tenantId:     string;
  unitId:       string;
  vote:         VoteValue;
  coefficient:  ColumnType<string, number | string, number | string>;
  castAt:       Generated<Date>;
}

export type Assembly         = Selectable<AssembliesTable>;
export type NewAssembly      = Insertable<AssembliesTable>;
export type AssemblyUpdate   = Updateable<AssembliesTable>;

export type AssemblyAgendaItem       = Selectable<AssemblyAgendaItemsTable>;
export type NewAssemblyAgendaItem    = Insertable<AssemblyAgendaItemsTable>;

export type AssemblyAttendance       = Selectable<AssemblyAttendancesTable>;
export type NewAssemblyAttendance    = Insertable<AssemblyAttendancesTable>;

export type AssemblyVote             = Selectable<AssemblyVotesTable>;
export type NewAssemblyVote          = Insertable<AssemblyVotesTable>;

// ── Charge Reminders (Sprint 13) ──────────────────────────────────────────────

export type ReminderType   = 'D1' | 'D7' | 'D30';
export type ReminderStatus = 'pending' | 'sent' | 'skipped' | 'failed';

export interface ChargeRemindersTable {
  id:           Generated<string>;
  tenantId:     string;
  chargeId:     string;
  unitId:       string;
  unitLabel:    string | null;
  ownerName:    string | null;
  phone:        string | null;
  amountCents:  ColumnType<string, bigint | number | string, bigint | number | string>;
  concept:      string;
  dueDate:      ColumnType<Date, Date | string, Date | string>;
  reminderType: ReminderType;
  status:       Generated<ReminderStatus>;
  scheduledFor: ColumnType<Date, Date | string, Date | string>;
  sentAt:       Date | null;
  sentVia:      'manual' | 'api' | 'whatsapp_link' | null;
  errorMsg:     string | null;
  createdAt:    Generated<Date>;
}

export type ChargeReminder    = Selectable<ChargeRemindersTable>;
export type NewChargeReminder = Insertable<ChargeRemindersTable>;

// ── Budget Items (Sprint 16) ──────────────────────────────────────────────────

export interface BudgetItemsTable {
  id:          Generated<string>;
  tenantId:    string;
  periodYear:  number;
  category:    string;
  concept:     string;
  budgeted:    ColumnType<string, bigint | number | string, bigint | number | string>;
  executed:    ColumnType<string, bigint | number | string, bigint | number | string>;
  notes:       string | null;
  createdBy:   string;
  createdAt:   Generated<Date>;
  updatedAt:   Generated<Date>;
}

export type BudgetItem    = Selectable<BudgetItemsTable>;
export type NewBudgetItem = Insertable<BudgetItemsTable>;
export type BudgetItemUpdate = Updateable<BudgetItemsTable>;
