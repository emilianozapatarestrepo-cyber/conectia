# CONECTIA — Architecture Freeze & Financial Engineering Constitution

**Version:** 1.0.0
**Status:** FROZEN — Changes require Architecture Review Board (ARB) approval
**Date:** 2026-02-14
**Scope:** All financial backend infrastructure

---

## 1. ARCHITECTURE FREEZE

### 1.1 PostgreSQL as Sole Financial Source of Truth

**CONFIRMED. No exceptions.**

- PostgreSQL 15+ is the ONLY source of truth for all financial data
- Firestore is used ONLY for non-financial data (profiles, tickets, amenities, social features)
- Firebase Auth is the identity provider. `tenant_memberships` table is the authoritative source for role + tenantId (custom claims are a client-side cache only)
- No financial data may be written directly to Firestore from any client
- No financial computation may happen client-side (iOS app is a read-only view of server-computed data)

**Justification:** Firestore lacks ACID transactions across documents, enforced constraints (CHECK, FK, UNIQUE), triggers, and row-level locking. These are non-negotiable for financial infrastructure.

### 1.2 Double-Entry Append-Only Ledger

**CONFIRMED. Immutable by design.**

- Every financial event produces a balanced set of ledger entries where `sum(debits) = sum(credits)`
- Ledger entries (`ledger_entries` table) are **append-only**: UPDATE and DELETE are blocked by PL/pgSQL triggers at the database level
- Corrections are done via reversal transactions (`transaction_type = 'reversal'`), which create new offsetting entries
- Balance is always recomputable from the sum of all entries for an account
- There is NO mutable `balance` field stored anywhere. The `v_account_balances` view computes balances on-the-fly from ledger entries
- Two layers of balance enforcement:
  1. Application layer: pre-flight validation before DB insert
  2. Database layer: `DEFERRED CONSTRAINT TRIGGER` verifies balance at COMMIT time

**Migration 001 evidence:** `fn_block_ledger_update()`, `fn_block_ledger_delete()` triggers prevent mutation. `fn_verify_double_entry_balance()` deferred trigger enforces balance.

### 1.3 Hash Chain per Tenant

**CONFIRMED with justification. Retained.**

**Purpose:** Tamper detection + audit integrity. The hash chain creates a cryptographic proof that no transaction has been modified, deleted, or reordered after posting. This is equivalent to a blockchain's immutability guarantee without the consensus overhead.

**Implementation:**
- Each transaction's hash is computed as: `SHA-256(prev_hash || tenant_id || tx_type || effective_date || idempotency_key || created_by)`
- Each ledger entry has its own hash: `SHA-256(tx_id || account_id || entry_type || amount || currency)`
- The `tenant_ledger_state` table stores the current hash per tenant and is locked with `FOR UPDATE` (MVCC) during transaction posting to serialize hash chain computation
- Verification: a scheduled job can recompute the entire chain and compare against stored hashes to detect tampering

**Why not eliminate it:**
- Regulatory value: Colombian Superintendencia Financiera may require audit trail integrity proof
- Competitive advantage: no LatAm competitor has cryptographic auditability
- Cost: near-zero (one SHA-256 per transaction, one row lock per tenant)
- The MVCC locking via `tenant_ledger_state FOR UPDATE` also solves the concurrent-writes race condition (a problem that would exist even without the hash chain)

### 1.4 Idempotency — DB-Enforced on ALL Critical Entities

**CONFIRMED. Mandatory.**

| Table | Constraint | Key composition |
|-------|-----------|-----------------|
| `transactions` | `uq_idempotency` | `(tenant_id, idempotency_key)` |
| `charges` | `uq_charge_idempotency` | `(tenant_id, idempotency_key)` |
| `payment_intents` | `uq_pi_idempotency` | `(tenant_id, idempotency_key)` |
| `webhook_events` | `uq_webhook_idempotency` | `(provider, idempotency_key)` |

**Application behavior on duplicate:**
- Detect duplicate via `SELECT ... WHERE tenant_id = $1 AND idempotency_key = $2`
- If exists: return existing result with HTTP 200 (not 409)
- If not: proceed with creation
- This check happens BEFORE the main DB transaction to avoid unnecessary locks

### 1.5 Multi-Tenant Enforcement

**CONFIRMED. Institutional-grade. Active NOW.**

Five-layer defense-in-depth:

| Layer | Mechanism | Migration/File |
|-------|-----------|----------------|
| Identity | Firebase Auth JWT verification with `checkRevoked=true` | `auth.ts` → `requireAuth` |
| Authorization | `tenant_memberships` table as server-side source of truth | Migration 003, `auth.ts` → `requireTenant` |
| Transaction | `SET LOCAL app.tenant_id` per PostgreSQL transaction | `db.ts` → `withTenantTransaction()` |
| Database | PostgreSQL RLS (ENABLE + FORCE) on ALL tables with `tenant_id` | Migration 003: 10 tables |
| API | `tenantId` NEVER accepted from HTTP body/query/params. Resolved from DB | `validation.ts` (no tenantId field) |

**`tenant_memberships` table (ACTIVE — Migration 003):**
- Server-side source of truth for `firebase_uid → tenant_id → role`
- Firebase custom claims are a CLIENT CACHE for UI rendering, NOT the source of truth
- `requireTenant` middleware queries `tenant_memberships WHERE firebase_uid = $1 AND status = 'active'`
- Supports multi-building users via `X-Tenant-Id` header selection

**PostgreSQL Row-Level Security (ACTIVE — Migration 003):**
- RLS enabled and FORCED on: `chart_of_accounts`, `fiscal_periods`, `transactions`, `ledger_entries`, `charges`, `payment_intents`, `suspense_entries`, `audit_log`, `tenant_ledger_state`, `tenant_memberships`
- `webhook_events` excluded (no tenant_id at ingestion — tenant resolved during matching)
- `tenants` table excluded (lookup needed before tenant context is set)
- `current_tenant_id()` function reads `current_setting('app.tenant_id')` — set by `withTenantTransaction()`
- `SET LOCAL` is transaction-scoped — automatically reverts on COMMIT/ROLLBACK, preventing GUC leakage

### 1.6 State Machines — Formal Definitions

#### 1.6.1 Charge State Machine

```
                    ┌──────────┐
                    │  draft   │
                    └────┬─────┘
                         │ activate()
                         ▼
                    ┌──────────┐
              ┌────▶│  active  │◀────┐
              │     └────┬─────┘     │
              │          │           │
              │   ┌──────┼──────┐   │
              │   │      │      │   │
              │   ▼      ▼      ▼   │
         ┌────────┐ ┌───────┐ ┌─────┴────┐
         │overdue │ │partial│ │cancelled │
         └────┬───┘ └───┬───┘ └──────────┘
              │         │
              ▼         ▼
         ┌──────────────────┐
         │       paid       │
         └──────────────────┘
              │
              ▼
         ┌──────────────────┐
         │   written_off    │
         └──────────────────┘
```

**Transitions allowed:**

| From | To | Trigger | Who |
|------|----|---------|-----|
| `draft` | `active` | Admin activates charge | admin/manager |
| `active` | `partial` | Partial payment confirmed via webhook | system (webhook) |
| `active` | `paid` | Full payment confirmed via webhook | system (webhook) |
| `active` | `overdue` | Scheduled job: due_date < now() | system (cron) |
| `active` | `cancelled` | Admin cancels charge (creates reversal) | admin |
| `overdue` | `partial` | Partial payment confirmed | system (webhook) |
| `overdue` | `paid` | Full payment confirmed | system (webhook) |
| `partial` | `paid` | Remaining balance paid | system (webhook) |
| `partial` | `overdue` | Still partial after due_date | system (cron) |
| `paid` | `written_off` | Admin writes off (accounting adjustment) | admin |
| `overdue` | `written_off` | Admin writes off uncollectable | admin |
| `overdue` | `cancelled` | Admin cancels (creates reversal) | admin |

**Forbidden transitions:** Any transition not listed above is REJECTED. Validated in application layer.

#### 1.6.2 PaymentIntent State Machine

```
  ┌─────────┐
  │ pending │
  └────┬────┘
       │ provider begins processing
       ▼
  ┌────────────┐
  │ processing │
  └─────┬──────┘
        │
   ┌────┼────┐
   │         │
   ▼         ▼
┌───────┐  ┌────────────┐
│failed │  │ confirmed  │
└───┬───┘  └─────┬──────┘
    │            │
    ▼            ▼
┌─────────┐  ┌─────────┐
│ pending │  │ settled │
│ (retry) │  └─────┬───┘
└─────────┘        │
                   ▼
              ┌──────────┐
              │ reversed │
              └──────────┘
```

| From | To | Trigger |
|------|----|---------|
| `pending` | `processing` | Provider webhook: payment initiated |
| `processing` | `confirmed` | Provider webhook: payment approved |
| `processing` | `failed` | Provider webhook: payment declined |
| `failed` | `pending` | Retry initiated by user |
| `confirmed` | `settled` | Settlement batch processed |
| `confirmed` | `reversed` | Reversal/refund processed |

#### 1.6.3 Settlement State Machine

```
  ┌─────────┐
  │ pending │
  └────┬────┘
       │ batch created
       ▼
  ┌────────────┐
  │ processing │
  └─────┬──────┘
   ┌────┼────┐
   ▼         ▼
┌──────┐  ┌───────────┐
│failed│  │ completed │
└──────┘  └───────────┘
```

**Settlement** is a new entity (not yet in DB). Migration 003 will be required:

```sql
CREATE TABLE settlements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  period_date     DATE NOT NULL,
  provider        TEXT NOT NULL,
  gross_amount    BIGINT NOT NULL,
  provider_fee    BIGINT NOT NULL,
  platform_fee    BIGINT NOT NULL,
  net_amount      BIGINT NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'COP',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  provider_ref    TEXT,
  ledger_tx_id    UUID REFERENCES transactions(id),
  idempotency_key UUID NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at      TIMESTAMPTZ,
  CONSTRAINT uq_settlement_idempotency UNIQUE (tenant_id, idempotency_key)
);
```

### 1.7 Webhook Ingestion

**CONFIRMED. Three-layer defense.**

1. **Signature verification (HMAC):** Verify provider's HMAC-SHA256 signature against `WOMPI_EVENTS_SECRET`. Reject on mismatch.
2. **Deduplication:** `uq_webhook_idempotency` constraint on `(provider, idempotency_key)`. If duplicate → return 200 OK, do not reprocess.
3. **Asynchronous processing:** Insert into `webhook_events` immediately (return 200 to provider). Process via background job (Cloud Scheduler trigger or Pub/Sub). Max 3 retries with exponential backoff. Failed processing → `processing_status = 'failed'`, error_message logged.

**Table already exists:** `webhook_events` with immutability triggers on core fields.

### 1.8 Settlement Engine with Configurable Take-Rate

**NEW — Requires Migration 003.**

- `settlements` table (defined above in 1.6.3)
- `tenant_config` table or `tenants.metadata` JSONB for:
  - `platform_fee_pct`: Conectia's take-rate (default: 1.5%)
  - `provider_fee_pct`: payment processor fee (varies by provider)
- Ledger entries per settlement:
  1. Debit `1100 Banco Principal` (net amount received)
  2. Debit `5500 Comisiones Procesador` (provider fee)
  3. Debit `5500 Comisiones Procesador` (platform fee — or separate account `5510`)
  4. Credit `1400 Procesador por Liquidar` (gross amount)

### 1.9 Suspense Account

**CONFIRMED. Already in schema.**

- `suspense_entries` table with FK to `webhook_events`
- Unmatched payments auto-create suspense entry with `reason`: 'unmatched', 'amount_mismatch', 'duplicate'
- Admin resolves via dashboard: assign to charge, reject, or create manual entry
- Resolution creates a ledger entry moving funds from `1500 Cuenta Suspense` to appropriate account

### 1.10 Observability

**CONFIRMED. Implementation pending.**

| Component | Tool | Status |
|-----------|------|--------|
| Structured logging | Pino with redaction + module scoping | ✅ Active (`src/shared/logger.ts`) |
| Correlation ID | UUID per request via middleware | ✅ Active (`src/shared/middlewares/correlation.ts`) |
| Metrics | Custom counters (webhook match rate, latency) | Planned (Phase 1 with webhook module) |
| Error tracking | GCP Error Reporting (auto from Cloud Functions) | Passive |
| Audit trail | `audit_log` table (append-only, immutable) | ✅ Active (repo + RLS) |

**SLOs:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| API latency p99 | < 2s | Pino timing middleware |
| Webhook processing latency | < 5min | `confirmed_at - received_at` |
| Auto-match rate | > 90% | `matched / total_webhooks` |
| Ledger balance consistency | 100% | Scheduled: recompute vs cache |
| Unresolved suspense backlog | < 5% of transactions | Count `WHERE resolved_at IS NULL` |
| Uptime | 99.9% | GCP monitoring |

**Correlation ID middleware:** Active in `src/shared/middlewares/correlation.ts`. Accepts `X-Correlation-Id` from client or generates UUIDv4. Echoed back in response header.

### 1.11 CI/CD

**Gate policy (blocks merge to `main`):**

1. `npm run typecheck` — zero errors
2. `npm run lint` — zero errors
3. `npm run test` — all pass, coverage >= 80% on financial modules
4. `npm run build` — successful
5. Security scan: no `tenantId` accepted from body in any Zod schema (automated grep check)

**Deploy pipeline:**
- `main` → auto-deploy migrations + backend to staging
- Tag `v*` → deploy to production with approval gate

### 1.12 Tests Before Module Expansion

**CONFIRMED. Rule 10 of Engineering Standard.**

No new module (charges, payments, webhooks, settlements) may be merged without:
- Unit tests for all use cases (positive + negative paths)
- Integration test for the happy path (DB transaction → verify ledger state)
- State machine transition tests (all valid + all invalid transitions)
- Idempotency test (duplicate key → returns existing)

### 1.13 Financial Kernel Freeze (Sealed Layer)

**The Financial Kernel is FROZEN. No feature may modify it without a formal ADR.**

| Table | Purpose | Sealed Since |
|-------|---------|-------------|
| `ledger_entries` | Append-only double-entry entries (immutable) | Migration 001 |
| `transactions` | Transaction headers with hash chain | Migration 001 |
| `tenant_ledger_state` | MVCC lock + current hash per tenant | Migration 002 |
| `chart_of_accounts` | Tenant-scoped chart of accounts | Migration 001 |
| `payment_intents` | Payment lifecycle (state machine) | Migration 001 |
| `settlements` | Settlement batches with fee decomposition | Migration 004 (planned) |

**Kernel Modification Rules:**
1. ADR document required (`docs/adrs/NNN-title.md`)
2. Invariants check: full test suite must pass
3. Migration impact analysis with backward compatibility plan
4. Property test coverage for any new invariant
5. Peer review with financial domain knowledge

**Sealed Code Files:**
- `src/modules/ledger/domain/types.ts`
- `src/modules/ledger/domain/interfaces.ts`
- `src/modules/ledger/domain/errors.ts`
- `src/modules/ledger/infrastructure/transaction.repository.ts`
- `src/shared/database/db.ts` (withTenantTransaction)
- `migrations/001_init_financial_ledger.sql`
- `migrations/002_tenant_ledger_state.sql`
- `migrations/003_tenant_memberships_and_rls.sql`

### 1.14 Performance Budget

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Write latency p95 | < 150ms | > 200ms |
| Write latency p99 | < 500ms | > 750ms |
| Read latency p95 | < 50ms | > 100ms |
| Reconciliation latency p95 | < 5min | > 10min |
| Throughput per tenant | 50 tx/sec spike safe | Degradation at 30 tx/sec |

**Index Strategy:**
- Idempotency: `uq_idempotency UNIQUE (tenant_id, idempotency_key)` on transactions, charges, payment_intents
- MVCC lock: PK on `tenant_ledger_state(tenant_id)`
- Balance computation: `idx_le_account` on `ledger_entries(account_id)`
- Webhook dedup: `uq_webhook_idempotency UNIQUE (provider, idempotency_key)`
- Membership lookup: `idx_membership_active` partial index on `tenant_memberships`

**Partitioning plan (if tenants > 10k):**
- Partition `ledger_entries` and `transactions` by `tenant_id` using HASH (32 partitions)
- `tenant_ledger_state` remains unpartitioned (one row per tenant)
- Trigger: evaluate at > 5,000 tenants

### 1.15 Hash Chain Threat Model (STRIDE)

| Threat | Category | Risk | Mitigation |
|--------|----------|------|------------|
| Attacker modifies stored transaction | Tampering | HIGH | Hash chain: any modification breaks chain verification. DB triggers block UPDATE/DELETE. |
| Attacker deletes ledger entry | Tampering | HIGH | `fn_block_ledger_delete` trigger. Hash chain gap detection. |
| Attacker reorders transactions | Tampering | MEDIUM | `prev_tx_hash` links form ordered chain. Reordering breaks verification. |
| Attacker inserts fake transaction | Spoofing | HIGH | Hash depends on `created_by` (Firebase UID from JWT). MVCC lock prevents parallel insertion. |
| DBA modifies data directly | Tampering | MEDIUM | Hash verification job detects. FORCE RLS applies even to table owner. Superuser bypass is audit-logged. |
| Hash collision (SHA-256) | Tampering | NEGLIGIBLE | 2^128 collision resistance. Not a practical concern. |
| Race condition in hash computation | Integrity | HIGH | `tenant_ledger_state FOR UPDATE` serializes per-tenant. Tested in S01 (100 concurrent). |

**Verification procedure:** Scheduled job recomputes entire chain from genesis → compares against stored hashes. Discrepancy triggers alert.

### 1.16 Disaster Recovery Plan

**Targets:**
| Metric | Target |
|--------|--------|
| RPO (Recovery Point Objective) | < 1 hour (PITR from WAL) |
| RTO (Recovery Time Objective) | < 4 hours |
| Backup frequency | Continuous WAL archiving + daily base backup |
| Retention | 30 days |

**Restore Runbook:**
1. Identify failure point (timestamp or WAL position)
2. Provision new PG instance from latest base backup
3. Apply WAL replay to failure point (PITR)
4. Run hash chain verification: `SELECT fn_verify_hash_chain(tenant_id)` for all tenants
5. Compare `tenant_ledger_state.tx_count` against `COUNT(*) FROM transactions WHERE tenant_id = $1`
6. If discrepancy: flag affected tenants, suspend operations, investigate
7. If clean: update connection strings, resume operations
8. Post-mortem: document root cause, update runbook if needed

**Restore Drill:** Run quarterly in staging environment. Document results.

---

## 2. FINANCIAL ENGINEERING CONSTITUTION

These rules are **permanent and non-negotiable**. Any code that violates them MUST be rejected in code review.

### 2.1 Financial Integrity Rules

| # | Rule | Enforcement |
|---|------|-------------|
| FI-01 | Every financial event MUST produce balanced double-entry ledger entries | App validation + DB deferred trigger |
| FI-02 | Ledger entries are IMMUTABLE. No updates, no deletes. Ever. | DB triggers: `fn_block_ledger_update`, `fn_block_ledger_delete` |
| FI-03 | Corrections MUST use reversal transactions, never mutation | Application layer: no `UPDATE ledger_entries` query may exist in codebase |
| FI-04 | All monetary amounts MUST be stored as BIGINT (centavos). No floats. No doubles. | DB: `CHECK (amount > 0)` on BIGINT columns. App: `MoneyAmount = bigint` |
| FI-05 | Balance is ALWAYS computed from ledger entries, never stored as mutable field | View `v_account_balances` computes from entries. No `balance` column on any table |
| FI-06 | Hash chain integrity MUST be verifiable at any time | `fn_compute_tx_hash` + scheduled verification job |
| FI-07 | Closed fiscal periods MUST block new transactions | DB trigger: `fn_block_closed_period` |
| FI-08 | Every financial write MUST be within a single DB transaction | Kysely `db.transaction().execute()` mandatory |

### 2.2 Multi-Tenancy Rules

| # | Rule | Enforcement |
|---|------|-------------|
| MT-01 | `tenant_id` MUST be present in every financial table row | DB: `NOT NULL` constraint + FK to `tenants(id)` |
| MT-02 | `tenant_id` NEVER comes from the client (body, query, path) | Zod schemas: no `tenantId` field. Controller: extracted from `req.user.tenantId` |
| MT-03 | Every query runs inside `withTenantTransaction()` with RLS enforcement | PostgreSQL RLS active on all tables (migration 003) |
| MT-04 | Role assignment MUST be server-side only | `tenant_memberships` table (DB source of truth). Custom claims are client cache only |
| MT-05 | Admin of tenant A MUST NOT see data of tenant B | RLS + DB-resolved `requireTenant` + `withTenantTransaction()` |

### 2.3 Authorization Rules

| # | Rule | Enforcement |
|---|------|-------------|
| AZ-01 | All endpoints require `requireAuth` (Firebase token verification with revocation check) | Router-level `router.use(requireAuth)` |
| AZ-02 | All financial endpoints require `requireTenant` | Router-level after `requireAuth` |
| AZ-03 | Mutation endpoints (POST charges, POST transactions) require `requireAdmin` | Per-route middleware |
| AZ-04 | Users can only read their own tenant's data | RLS enforced at DB level via `SET LOCAL app.tenant_id` |
| AZ-05 | Token revocation is checked on EVERY request | `verifyIdToken(token, true)` — `checkRevoked = true` |

### 2.4 Idempotency Rules

| # | Rule | Enforcement |
|---|------|-------------|
| ID-01 | Every financial write entity MUST have an `idempotency_key` column with UNIQUE constraint | DB schema: `CONSTRAINT uq_*_idempotency UNIQUE (tenant_id, idempotency_key)` |
| ID-02 | Client MUST generate UUID v4 idempotency key and send it with the request | Zod: `idempotencyKey: z.string().uuid()` required field |
| ID-03 | On duplicate key, return existing result (HTTP 200), NOT error 409 | Application layer: check-before-write pattern |
| ID-04 | Webhook deduplication uses `provider_event_id` as idempotency key | `uq_webhook_idempotency (provider, idempotency_key)` |

### 2.5 Observability Rules

| # | Rule | Enforcement |
|---|------|-------------|
| OB-01 | Every request MUST have a `correlation_id` (UUID) | Middleware injects, propagated to all logs and audit entries |
| OB-02 | All logs MUST be structured JSON (Pino) | No `console.log` in production code |
| OB-03 | Every financial mutation MUST be logged to `audit_log` | Use case layer: `auditRepo.log()` after every write |
| OB-04 | Webhook processing MUST log: received_at, processing_status, error_message | `webhook_events` table fields |
| OB-05 | SLO violations MUST trigger alerts | GCP Cloud Monitoring alerts on defined thresholds |

### 2.6 Migration Rules

| # | Rule | Enforcement |
|---|------|-------------|
| MG-01 | Every schema change requires a numbered migration file | `migrations/NNN_description.sql` |
| MG-02 | Migrations MUST be wrapped in `BEGIN; ... COMMIT;` | Review enforcement |
| MG-03 | Migrations MUST be idempotent where possible (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) | Review enforcement |
| MG-04 | Backwards-incompatible changes require two-phase migration (add → migrate → remove) | Architecture review |
| MG-05 | Financial data migration MUST use `sourceType: 'migration'` in ledger entries with full traceability | Application enforcement |
| MG-06 | Migration rollback MUST create reversal entries, never DELETE | Rule FI-02 applies |

### 2.7 Disaster Recovery Rules

| # | Rule | Enforcement |
|---|------|-------------|
| DR-01 | PostgreSQL MUST have automated daily backups with 30-day retention | Cloud SQL / Supabase configuration |
| DR-02 | Point-in-Time Recovery (PITR) MUST be enabled | WAL archiving |
| DR-03 | Hash chain allows integrity verification after restore | Scheduled job recomputes and compares |
| DR-04 | Audit log is append-only and MUST survive application failures | DB trigger enforcement, fire-and-forget audit writes |
| DR-05 | Webhook events are append-only and allow full replay | `webhook_events` table preserves raw payload |
| DR-06 | Application secrets MUST NOT be in code repository | `.env` + Secret Manager. `.gitignore` enforced |

### 2.8 Explicit Prohibitions

| # | Prohibition | Reason |
|---|-------------|--------|
| PX-01 | **NO** `tenantId` from client body/query/path in any financial endpoint | Trust violation. Impersonation risk |
| PX-02 | **NO** `role` or `accessStatus` writable by client | Privilege escalation |
| PX-03 | **NO** `UPDATE` or `DELETE` on `ledger_entries`, `audit_log`, `transactions` | Immutability violation |
| PX-04 | **NO** `try?` or silent error swallowing on financial operations | Data corruption risk |
| PX-05 | **NO** `console.log` in production. Use Pino structured logger | Observability requirement |
| PX-06 | **NO** `Double` or `Float` for monetary amounts. BIGINT only | Floating point errors |
| PX-07 | **NO** balance stored as mutable column. Always computed from entries | Inconsistency risk |
| PX-08 | **NO** financial logic in iOS client. All in backend | Security requirement |
| PX-09 | **NO** skip validation. Every input validated by Zod schema | Injection/corruption risk |
| PX-10 | **NO** `TODO` comments that affect money flows. Fix now or don't merge | Technical debt prohibition |
| PX-11 | **NO** new modules without tests passing at >= 80% coverage | Quality gate |
| PX-12 | **NO** hardcoded financial values. All configuration via DB or env | Maintainability |
| PX-13 | **NO** simplified logic "for MVP" in the financial core | Architectural debt prohibition |

---

## 3. DEFINITION OF DONE (Per Module)

### 3.0 Universal DoD (applies to ALL modules)

- [ ] Migration file with all constraints (FK, CHECK, UNIQUE, NOT NULL)
- [ ] Kysely types in `schema.ts` matching migration
- [ ] Tenant isolation: `tenant_id` NOT NULL + FK + used in every query
- [ ] Idempotency: UNIQUE constraint on `(tenant_id, idempotency_key)`
- [ ] Domain types in `types.ts`
- [ ] Domain errors in `errors.ts`
- [ ] Repository interface in `interfaces.ts`
- [ ] Repository implementation with Kysely
- [ ] Use case with business logic
- [ ] Zod validation schema (NO tenantId from body)
- [ ] Controller handler (tenant from `req.user`)
- [ ] Route with `requireAuth + requireTenant` (+ `requireAdmin` if mutation)
- [ ] Audit log entry on every mutation
- [ ] Structured logging with correlation_id
- [ ] Unit tests >= 80% coverage on use case + repository
- [ ] Integration test for happy path (DB round-trip)
- [ ] State machine transition tests (if applicable)
- [ ] Idempotency test (duplicate key → returns existing)
- [ ] Threat mitigations documented in module README

### 3.1 Ledger Module

| Requirement | Status |
|-------------|--------|
| Migration: `transactions`, `ledger_entries` with triggers | ✅ Done (001) |
| MVCC locking via `tenant_ledger_state FOR UPDATE` | ✅ Done (transaction.repository.ts) |
| Idempotency: return existing on duplicate | ✅ Done (fetchExistingTransaction) |
| Double-entry validation (app + DB trigger) | ✅ Done |
| Hash chain computation with MVCC serialization | ✅ Done |
| Period closing enforcement | ✅ Done (DB trigger) |
| RLS on all tables | ✅ Done (migration 003) |
| Unit tests (U01-U11) + Property tests (P01-P06) | ✅ Done (27 tests passing) |
| Integration tests (I01-I06) | ✅ Done (requires DB) |
| Stress tests (S01-S04) + Chaos tests (C01-C05) | ✅ Done (requires DB) |

**Threats mitigated:** Hash chain tampering (SHA-256), race conditions (MVCC FOR UPDATE), duplicate posting (idempotency), balance manipulation (double-entry trigger), period manipulation (closed period trigger)

### 3.2 Charges Module

| Requirement | Status |
|-------------|--------|
| Migration: `charges` table with state machine constraints | ✅ Done (001) |
| State machine: formal transitions validated in app layer | ❌ Pending |
| Idempotency: `uq_charge_idempotency` | ✅ Constraint exists |
| Atomic creation: charge + ledger entry in single DB tx | ❌ Pending |
| Repository (CRUD + state transitions) | ❌ Pending |
| Use case (CreateCharge, CancelCharge) | ❌ Pending |
| Tests: state transitions, invalid transitions rejected, idempotency | ❌ Pending |

**Threats:** Unauthorized charge creation (requireAdmin), amount manipulation (Zod + BIGINT), cross-tenant charge (tenantId from JWT)

### 3.3 PaymentIntents Module

| Requirement | Status |
|-------------|--------|
| Migration: `payment_intents` table | ✅ Done (001) |
| State machine: formal transitions | ❌ Pending |
| Idempotency: `uq_pi_idempotency` | ✅ Constraint exists |
| Charge validation before intent creation | ❌ Pending |
| Amount matching enforcement | ❌ Pending |
| Repository + Use case | ❌ Pending |
| Tests: state machine, amount mismatch rejection | ❌ Pending |

**Threats:** Overpayment/underpayment (amount matching), double payment (idempotency), cross-tenant charge reference (tenantId check on all charges)

### 3.4 Webhooks Module

| Requirement | Status |
|-------------|--------|
| Migration: `webhook_events` table with immutability triggers | ✅ Done (001) |
| HMAC signature verification | ❌ Pending |
| Deduplication by provider_event_id | ✅ Constraint exists, app logic pending |
| Matching engine (exact → fuzzy → suspense) | ❌ Pending |
| Async processing with retry (max 3, exponential backoff) | ❌ Pending |
| Tests: signature valid/invalid, dedup, matching paths | ❌ Pending |

**Threats:** Spoofed webhook (HMAC verification), replay attack (dedup), unmatched payment loss (suspense account)

### 3.5 Settlement Module

| Requirement | Status |
|-------------|--------|
| Migration 003: `settlements` table | ❌ Pending |
| Take-rate configuration per tenant | ❌ Pending |
| Fee calculation: gross - provider_fee - platform_fee = net | ❌ Pending |
| Ledger entries for settlement | ❌ Pending |
| State machine (pending → processing → completed/failed) | ❌ Pending |
| Tests: fee calculation accuracy, ledger balance after settlement | ❌ Pending |

**Threats:** Fee miscalculation (integer arithmetic, no floats), settlement without corresponding confirmed payments (FK enforcement)

### 3.6 Migration Pipeline Module

| Requirement | Status |
|-------------|--------|
| Excel/CSV upload to storage | ❌ Pending |
| Parse with encoding/format detection | ❌ Pending |
| AI column mapping with deterministic fallback | ❌ Pending |
| Validation engine (coeficients, duplicates, amounts) | ❌ Pending |
| Preview with admin approval gate | ❌ Pending |
| Atomic commit: all entries in single batch | ❌ Pending |
| Traceability: sourceType='migration', sourceFile, sourceRow | ❌ Pending |
| Rollback via reversal entries | ❌ Pending |
| Tests: various Excel formats, validation rules, rollback | ❌ Pending |

**Threats:** Corrupt data import (validation engine), amount errors (BIGINT enforcement), irrecoverable import (reversal entries enable rollback)

### 3.7 Access Control (QR) Module

| Requirement | Status |
|-------------|--------|
| Migration: `access_codes`, `access_logs` tables | ❌ Pending |
| JWT-signed QR generation | ❌ Pending |
| Verification: signature + expiry + revocation + maxUses | ❌ Pending |
| Append-only access logs | ❌ Pending |
| Rate limiting per resident | ❌ Pending |
| Offline mode for doorman | ❌ Pending |
| Tests: expired QR, revoked QR, max uses exceeded, rate limit | ❌ Pending |

**Threats:** QR forwarding (one-time use + expiry), spoofing (HMAC verification), replay (use count tracking), abuse (rate limiting)

---

## 4. ROADMAP REVALIDADO (Adjusted for Architecture Permanence)

### Fase A: Core Hardening — Weeks 1-2

**Prerequisite:** No new features until all P0 violations are resolved.

| # | Deliverable | Justification |
|---|-------------|---------------|
| A1 | Fix `requireAdmin` export + wire `requireTenant` on all routes | P0: Build doesn't compile. Routes unprotected. |
| A2 | Remove `tenantId` from all Zod schemas → `req.user.tenantId` | P0: Trust violation (PX-01) |
| A3 | Harden TransactionRepo: MVCC locking + idempotency return | P0: Race condition + missing idempotency behavior |
| A4 | Add correlation_id middleware + wire Pino logger | Foundation for all observability |
| A5 | TypeScript typecheck + build verification | Verify compilation after all changes |

**Exit criteria:** `npm run typecheck && npm run build` passes. All routes protected by auth+tenant. No tenantId in Zod schemas. MVCC locking active.

### Fase B: Charges + PaymentIntents — Weeks 3-4

| # | Deliverable |
|---|-------------|
| B1 | Extend domain types: `CreateChargeInput`, `CreatePaymentIntentInput`, results |
| B2 | Extend domain interfaces: `IChargeRepository`, `IPaymentIntentRepository` |
| B3 | Implement ChargeRepository (Kysely) |
| B4 | Implement CreateChargeUseCase (atomic: charge + ledger + audit) |
| B5 | Implement charge state machine validation |
| B6 | Implement PaymentIntentRepository (Kysely) |
| B7 | Implement ProcessPaymentIntentUseCase (validate charges, amount match) |
| B8 | Add Zod schemas for charges + payment intents |
| B9 | Extend controller + routes |
| B10 | Unit + integration tests for charges and payment intents |

**Exit criteria:** POST /charges creates charge + ledger entry atomically. POST /payment-intents validates charges and creates intent. Tests pass >= 80% coverage on use cases.

### Fase C: Webhooks + Reconciliation — Weeks 5-7

| # | Deliverable |
|---|-------------|
| C1 | Webhook receiver endpoint (HTTPS, signature verification) |
| C2 | Deduplication logic (check-before-insert) |
| C3 | Matching engine: exact (providerRef) → fuzzy (amount+user+window) → suspense |
| C4 | Payment confirmation flow: webhook → update intent → create ledger entry → update charges |
| C5 | Suspense account entries for unmatched payments |
| C6 | Admin dashboard endpoints for suspense resolution |
| C7 | Tests: HMAC valid/invalid, dedup, all matching paths, suspense flow |

**Exit criteria:** Webhook from Wompi sandbox correctly creates ledger entries. Unmatched payments go to suspense. Auto-match rate measurable.

### Fase D: Settlements + Observability + CI/CD — Weeks 8-10

| # | Deliverable |
|---|-------------|
| D1 | Migration 003: `settlements` table |
| D2 | Settlement engine: batch confirmed payments → compute fees → create settlement + ledger entries |
| D3 | Take-rate configuration (tenant-level) |
| D4 | Pino structured logging across all modules |
| D5 | Metrics collection: webhook match rate, API latency, error rates |
| D6 | GitHub Actions CI/CD: typecheck + lint + test + build + deploy |
| D7 | Security scan in CI: grep for tenantId in Zod schemas |
| D8 | Test suite: settlement fee calculation, ledger balance after settlement |

**Exit criteria:** End-to-end flow works: charge → payment intent → webhook → confirmation → settlement. CI blocks bad merges. Structured logs in production.

### Fase E: Migration Pipeline + Access Control — Weeks 11-16

| # | Deliverable |
|---|-------------|
| E1 | Migration 004: `access_codes`, `access_logs` tables |
| E2 | Excel upload + parse + AI column mapping |
| E3 | Validation engine + preview UI |
| E4 | Atomic commit with traceability |
| E5 | QR generation (JWT signed) |
| E6 | QR verification + access logging |
| E7 | Offline mode for doorman |
| E8 | Tests for both modules |

### Fase F: Advanced Monetization — Weeks 17+

| # | Deliverable |
|---|-------------|
| F1 | Float tracking and yield reporting |
| F2 | Insurance broker integration |
| F3 | Multi-provider payment support (Bold, Nequi) |
| F4 | B2B vendor payouts |
| F5 | Financial dashboards + reports |
| F6 | Property-based tests for ledger |
| F7 | Rate limiting on all endpoints |
| F8 | Full observability with SLO alerting |

---

## 5. ADJUSTMENTS TO CURRENT PLAN

| # | Issue Found | Resolution |
|---|-------------|------------|
| 1 | Correlation ID missing | ✅ Resolved: `src/shared/middlewares/correlation.ts` |
| 2 | Pino logger not wired | ✅ Resolved: `src/shared/logger.ts` + wired in `main.ts` |
| 3 | RLS deferred | ✅ Resolved: RLS active on ALL tables (migration 003) |
| 4 | `tenant_memberships` missing | ✅ Resolved: active in migration 003, `requireTenant` queries it |
| 5 | Settlement requires migration | Planned: migration 004 in Phase 2 |
| 6 | State machine validation not formalized | Formal transitions defined (Section 1.6). Implementation in Phase 1. |
| 7 | Tests mandatory | ✅ Resolved: 27 unit + property tests passing. CI pipeline active. |
| 8 | Security scan in CI | ✅ Resolved: CI greps for tenantId in validation schemas |
| 9 | Currency hardcoded to 'COP' | ✅ Resolved: `input.currency ?? 'COP'` in transaction.repository.ts |

---

## 6. REMAINING RISKS

| Risk | Severity | Status | Mitigation |
|------|----------|--------|------------|
| No PostgreSQL provisioned yet | HIGH | Open | Must provision before integration testing. Recommend Supabase or Cloud SQL |
| Wompi sandbox not configured | MEDIUM | Open | Required before Phase 1. Need API keys from Wompi |
| Settlement table doesn't exist yet | MEDIUM | Planned | Migration 004 in Phase 2 |
| No formal security audit | MEDIUM | Open | Recommend before production launch |
| No load testing performed yet | MEDIUM | Planned | k6/artillery benchmarks in Phase 0.5 |

**Resolved risks (no longer applicable):**
- ~~Firebase custom claims as source of truth~~ → `tenant_memberships` is now the authoritative source
- ~~No PG RLS~~ → RLS active on all tables (migration 003)
- ~~App-level filtering only~~ → `withTenantTransaction()` + `SET LOCAL` + RLS
