# ADR-001: Scalability Audit — Architecture Readiness for 1,000+ Buildings

**Status:** Accepted
**Date:** 2026-03-26
**Deciders:** Emiliano Zapata (Founder), Technical Co-Founder
**Context:** Pre-implementation review before executing Plans A, B, C. The question: does the current architecture hold at K=1,000 buildings with exponential growth, or do we need to change the foundation?

---

## 1. Context — What We're Evaluating

Conectia is a B2B SaaS for HOA management in Colombia. One admin per building complex. Scale model:

| Milestone | Buildings | Apartment units | Monthly financial events | Concurrent users (peak) |
|-----------|-----------|-----------------|--------------------------|-------------------------|
| Pilot (Jul 2026) | 1 | 152 | ~760 | 1-5 |
| Phase 1 (Q4 2026) | 50 | ~7,500 | ~37,500 | 10-25 |
| Scale (2027) | 300 | ~45,000 | ~225,000 | 50-100 |
| Unicorn target | 1,000 | ~150,000 | ~750,000/month | 100-300 |

> **Key insight for B2B SaaS:** This is NOT a consumer app with millions of simultaneous requests. Peak concurrency is ~100–300 admin users during business hours in Colombia. The load profile is batch-heavy (monthly billing generation, exports) not continuous-high (real-time feeds). This fundamentally changes the scalability math.

---

## 2. Honest Verdict: Foundation vs. Operations

### 2.1 The Foundation — UNICORN-GRADE ✅

After reviewing `ARCHITECTURE.md`, `db.ts`, `env.ts`, `package.json`, and the 3 migrations, the core data model is overbuilt for a startup — in the best possible way.

| Component | Assessment | Justification |
|-----------|------------|---------------|
| Double-entry ledger with PL/pgSQL triggers | ✅ Enterprise-grade | `fn_verify_double_entry_balance()` enforces correctness at DB commit — can't be bypassed by app bugs |
| SHA-256 hash chain per tenant | ✅ Unique in LatAm | Tamper detection with cryptographic proof — no competitor has this |
| 5-layer multi-tenant isolation | ✅ Institutional grade | RLS `FORCE` + `SET LOCAL` GUC ensures isolation even if app layer has a bug |
| DB-enforced idempotency on all critical entities | ✅ Correct | `(tenant_id, idempotency_key)` unique constraints prevent double-charges at DB level |
| Formal state machines for Charge, PaymentIntent, Settlement | ✅ Correct | No invalid transitions can reach the DB |
| Kysely + TypeScript strict | ✅ Type-safe queries | Compile-time SQL errors, not runtime |
| Append-only ledger (UPDATE/DELETE blocked by triggers) | ✅ Correct | Even a compromised Express process cannot corrupt financial history |
| `withTenantTransaction()` scoping | ✅ Correct | `SET LOCAL` reverts on COMMIT/ROLLBACK — no GUC leakage across pooled connections |

**This foundation does NOT need to change at 1,000 buildings.** No rewrite, no migration of the data model. The ACID guarantees, hash chain, and RLS will hold at 150,000 apartment units and 12M+ ledger entries without structural changes.

> **PostgreSQL handles this comfortably:** At 1,000 buildings × 12 months × 5 charge types × 150 units = ~9M charges/year. With proper indexes and `BIGINT` PKs, PostgreSQL handles 100M+ rows in `ledger_entries` without architectural changes. The `tenant_ledger_state FOR UPDATE` lock is per-tenant — 1,000 tenants each have their own lock row, so they don't serialize globally.

---

### 2.2 The Operations Layer — 5 Specific Gaps

The foundation is solid. The operations layer has exactly 5 gaps. These are **additive changes** — they don't require touching the data model or rewriting existing modules.

---

#### GAP 1: No Async Job Queue — CRITICAL (needed before 50 buildings)

**Problem:** The plans call for PDF/Excel export, scheduled alert generation, and bulk charge creation. These operations run today on the Express request thread (synchronous, blocking). In Node.js's single-threaded event loop, one 500ms PDF generation blocks ALL other requests to that process.

**Failure mode at scale:** On the 1st of each month, 50 admins simultaneously click "Generate Monthly Charges." Each generates ~150 charge INSERT statements. That's 50 concurrent heavy DB writes + 50 event loop blocks. Express becomes unresponsive.

**Fix:** Add **BullMQ** (Redis-backed job queue).

```bash
# Add to backend
npm install bullmq ioredis
```

**Architecture impact:**
- All heavy operations (bulk charge generation, PDF export, alert scheduling) become async jobs
- Express endpoint responds immediately with `202 Accepted + jobId`
- Client polls `GET /jobs/:id/status` or uses WebSocket for push notification
- Jobs survive server restarts (Redis persistence)
- Built-in retry with exponential backoff for Wompi webhook failures

**Priority:** HIGH — required before Phase 1 launch (50 buildings).

---

#### GAP 2: No Redis Caching for Dashboard — IMPORTANT (needed before 100 buildings)

**Problem:** The dashboard summary query (`GET /api/v1/dashboard/summary`) aggregates across `charges`, `ledger_entries`, `payment_intents`, and `alerts` for a given tenant and period. This is a 4-way JOIN with GROUP BY on potentially millions of rows. At React Query's 60s refetch interval × 100 concurrent admins = 6,000 DB queries/hour of the same expensive computation.

**Failure mode:** At 100 buildings, dashboard load spikes PostgreSQL CPU. At 300 buildings, it saturates I/O.

**Fix:** Redis cache layer with 30-second TTL (matches React Query staleTime).

```typescript
// Pattern: cache-aside
const cacheKey = `dashboard:summary:${tenantId}:${periodId}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const result = await computeDashboardSummary(tenantId, periodId);
await redis.setex(cacheKey, 30, JSON.stringify(result));
return result;
```

**Cache invalidation triggers:** POST to `charges`, POST to `payments`, POST to `reconciliation/:id` → `DEL dashboard:*:${tenantId}:*`

Since BullMQ also requires Redis (Gap 1), this is a **two-for-one**: add Redis once, use it for both.

**Priority:** HIGH — required before Scale phase (100 buildings). Redis install shared with BullMQ.

---

#### GAP 3: Connection Pool Misconfigured for Horizontal Scale — MEDIUM (needed before 10+ containers)

**Current state:** `db.ts` uses `pg.Pool` with `DB_POOL_MAX = 10` (correct for one process). PostgreSQL default `max_connections = 100`.

**Failure mode:** At 10 Express containers × 10 pool connections = 100 connections → PostgreSQL exhausted. PostgreSQL starts refusing connections. 500 errors in production.

**Fix — Option A (Recommended):** Deploy **PgBouncer** in transaction pooling mode between Express and PostgreSQL. PgBouncer multiplexes N app connections down to M PostgreSQL connections.

```
[Express ×10 pods, 10 connections each = 100] → [PgBouncer, pool_size=25] → [PostgreSQL max_connections=50]
```

PgBouncer runs as a sidecar container or separate service. Zero code changes required — just update `DATABASE_URL` in each Express pod to point at PgBouncer instead of PostgreSQL directly.

> **Important caveat:** `SET LOCAL app.tenant_id` (used for RLS in `withTenantTransaction()`) is TRANSACTION-SCOPED, not session-scoped. This means it works correctly with PgBouncer in **transaction pooling mode**. If using session pooling mode, this would fail. Must use transaction pooling mode. This is the correct mode for this architecture.

**Fix — Option B (Simpler for now):** Increase `DB_POOL_MAX` and `PostgreSQL max_connections` proportionally, and limit Express to 2-3 containers for now. This works up to ~300 buildings without PgBouncer.

**Priority:** MEDIUM — not needed for pilot or Phase 1. Plan for Scale phase.

---

#### GAP 4: No Rate Limiting — SECURITY (needed before public launch)

**Problem:** `CORS_ORIGIN` defaults to `'*'` in `env.ts`. No `express-rate-limit` in `package.json`. Any unauthenticated IP can hammer the API. Firebase Auth protects endpoints, but unauthenticated routes (health check, webhook) and auth endpoints are exposed.

**Specific risks:**
- `POST /webhooks/wompi` — open to IP spoofing without rate limiting + IP allowlist
- `GET /health` — not sensitive but abusable
- Auth token validation under brute-force amplification

**Fix:**
```bash
npm install express-rate-limit
```

```typescript
// main.ts
import rateLimit from 'express-rate-limit';

// General API rate limit
app.use('/api/', rateLimit({
  windowMs: 60_000,        // 1 minute
  max: 300,                // 300 requests/minute per IP
  standardHeaders: true,
  legacyHeaders: false,
}));

// Tighter limit on webhook endpoint
app.use('/webhooks/', rateLimit({
  windowMs: 60_000,
  max: 60,
}));
```

Also fix `CORS_ORIGIN`:
```typescript
// env.ts — add validation
CORS_ORIGIN: z.string().default(
  process.env.NODE_ENV === 'production'
    ? 'https://app.conectia.co'  // must be set explicitly in prod
    : 'http://localhost:5173'
),
```

**Priority:** HIGH — must fix before public launch, independent of scale.

---

#### GAP 5: No Production Observability — NEEDED before Scale Phase

**Problem:** `pino` is installed (structured logging ✅). But there's no:
- Metrics collection (latency histograms, error rates, DB pool utilization)
- Distributed tracing (can't debug "why is this request slow?")
- Alerting (no PagerDuty/alertmanager when `p99 latency > 2s`)

**Failure mode:** At 50 buildings, something breaks at 2am on billing day. You have no visibility into whether the issue is: slow DB query, connection pool exhaustion, job queue backlog, or third-party Wompi API timeout.

**Fix:** Add OpenTelemetry. It's vendor-neutral and adds ~200 LOC to the project.

```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

Exports to: Grafana Cloud (free tier for startups), Datadog, or self-hosted Jaeger. Decision deferred — just instrument now, choose vendor at Scale phase.

**Priority:** MEDIUM — required before Scale phase, not for pilot.

---

## 3. Scalability Roadmap

| Gap | Fix | When | Effort |
|-----|-----|------|--------|
| Async job queue | BullMQ + Redis | Before Phase 1 (50 buildings) | 3 days |
| Dashboard caching | Redis (same instance as above) | Before Phase 1 | 1 day |
| Rate limiting | express-rate-limit | Before public launch | 4 hours |
| CORS_ORIGIN fix | env.ts validation | Before public launch | 1 hour |
| PgBouncer | Infra change (no code) | Before Scale (100 buildings) | 1 day |
| Observability | OpenTelemetry | Before Scale | 2 days |
| Read replica | PostgreSQL replication | Before Unicorn (500+ buildings) | 1 day infra |
| Table partitioning | `ledger_entries` by `created_at` | Before Unicorn | 1 migration |

---

## 4. What Does NOT Need Changing

The following are permanently correct and do not require modification at any scale milestone:

- Double-entry ledger schema and triggers
- Hash chain per tenant
- RLS policies and `withTenantTransaction()`
- Idempotency key design
- State machines
- Clean Architecture module structure
- Kysely type-safe queries
- Firebase Auth + `tenant_memberships` multi-tenancy
- Zod runtime validation on all API inputs

---

## 5. Decision

**The foundation is unicorn-grade. The operations layer needs 4 additions. No rewrite.**

Execution order before July 2026 pilot:
1. ✅ Plans A, B, C as written — implement the financial dashboard
2. 🔜 Add `express-rate-limit` + fix `CORS_ORIGIN` (4 hours, do this during Plan A)
3. 🔜 Add BullMQ + Redis — refactor export endpoints to async jobs (before Phase 1 launch)
4. 🔜 Add OpenTelemetry (before presenting to investors)

The pilot with Galicia Verde (1 building, 152 apartments) can proceed with the current architecture. The only mandatory pre-pilot fix is rate limiting + CORS — the rest scales with the business.

---

## 6. Consequences

**What becomes easier with this architecture:**
- Adding new tenants is zero-effort (RLS handles isolation automatically)
- Financial audits are instant (hash chain + append-only ledger = complete audit trail)
- Regulatory compliance (Superintendencia Financiera) is built-in, not retrofitted
- Horizontal scaling is straightforward — Express is fully stateless, just add containers

**What becomes harder:**
- Reverting ledger entries requires reversal transactions (by design — this is correct for accounting)
- Schema migrations require `LOCK TABLE` on PostgreSQL in production (mitigated by Kysely's typed migrations)
- The `tenant_ledger_state FOR UPDATE` lock serializes transactions per tenant (not a bottleneck — each tenant has own lock row)

**What we'll revisit at 500+ buildings:**
- `ledger_entries` table partitioning by `created_at YEAR-MONTH`
- PostgreSQL read replica for analytics/dashboard queries
- Dedicated `MATERIALIZED VIEW` for dashboard aggregations (refreshed every 60s)
