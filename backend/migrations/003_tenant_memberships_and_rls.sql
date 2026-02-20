-- ============================================================================
-- CONECTIA — Institutional Multi-Tenancy: Memberships + Row-Level Security
-- Migration 003: tenant_memberships table + RLS on ALL multi-tenant tables
-- ============================================================================
-- This migration establishes permanent multi-tenant isolation:
--   1. tenant_memberships: server-side source of truth for user→tenant→role
--   2. RLS policies on every table with tenant_id
--   3. Application sets `app.tenant_id` per transaction via SET LOCAL
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. MEMBERSHIP ROLE ENUM
-- ============================================================================

CREATE TYPE membership_role AS ENUM (
  'resident',
  'owner',
  'staff',
  'manager',
  'admin'
);

CREATE TYPE membership_status AS ENUM (
  'active',
  'suspended',
  'removed'
);

-- ============================================================================
-- 2. TENANT MEMBERSHIPS TABLE
-- ============================================================================
-- This is the authoritative source for "which user belongs to which tenant
-- with which role". Firebase custom claims are a CACHE of this table,
-- not the source of truth.

CREATE TABLE tenant_memberships (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firebase_uid  TEXT NOT NULL,
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  role          membership_role NOT NULL DEFAULT 'resident',
  unit_id       TEXT,                     -- Firebase unit ID (nullable for admins)
  status        membership_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_membership UNIQUE (firebase_uid, tenant_id)
);

CREATE INDEX idx_membership_uid ON tenant_memberships(firebase_uid);
CREATE INDEX idx_membership_tenant ON tenant_memberships(tenant_id);
CREATE INDEX idx_membership_active ON tenant_memberships(firebase_uid, tenant_id)
  WHERE status = 'active';

-- Auto-update updated_at
CREATE TRIGGER trg_membership_updated
  BEFORE UPDATE ON tenant_memberships
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================================
-- 3. HELPER FUNCTION: Resolve current tenant from session variable
-- ============================================================================
-- Every DB transaction sets: SET LOCAL app.tenant_id = '<uuid>';
-- RLS policies use this function to enforce isolation.

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN current_setting('app.tenant_id', true)::UUID;
EXCEPTION
  WHEN OTHERS THEN
    -- If not set or invalid, return a NULL UUID that matches nothing
    RETURN '00000000-0000-0000-0000-000000000000'::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 4. ENABLE RLS ON ALL MULTI-TENANT TABLES
-- ============================================================================

-- 4a. chart_of_accounts
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_coa ON chart_of_accounts
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- 4b. fiscal_periods
ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_fp ON fiscal_periods
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- 4c. transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_tx ON transactions
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- 4d. ledger_entries
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_le ON ledger_entries
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- 4e. charges
ALTER TABLE charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE charges FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_charges ON charges
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- 4f. payment_intents
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_intents FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_pi ON payment_intents
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- 4g. webhook_events (no tenant_id column — isolation via related_intent_id FK)
-- webhook_events are provider-scoped, not tenant-scoped at ingestion time.
-- Tenant isolation is enforced at the application layer during processing.
-- RLS is NOT applied to webhook_events because:
--   1. Webhooks arrive without tenant context (provider doesn't know our tenants)
--   2. The matching engine determines tenant from the payment_intent
--   3. Once matched, ledger entries are created under the correct tenant with RLS

-- 4h. suspense_entries (tenant_id is nullable — unmatched payments may lack tenant)
-- RLS applied only to rows WHERE tenant_id IS NOT NULL
ALTER TABLE suspense_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE suspense_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_suspense ON suspense_entries
  USING (tenant_id IS NULL OR tenant_id = current_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = current_tenant_id());

-- 4i. audit_log (tenant_id is nullable — system-level actions may lack tenant)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_audit ON audit_log
  USING (tenant_id IS NULL OR tenant_id = current_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = current_tenant_id());

-- 4j. tenant_ledger_state
ALTER TABLE tenant_ledger_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_ledger_state FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_tls ON tenant_ledger_state
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- 4k. tenant_memberships (users can only see their own tenant's memberships)
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_memberships ON tenant_memberships
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================================
-- 5. BYPASS RLS FOR SUPERUSER / MIGRATION ROLE
-- ============================================================================
-- The application connects as a non-superuser role (e.g., 'conectia_app').
-- Migrations and admin scripts connect as the superuser which bypasses RLS.
-- FORCE ROW LEVEL SECURITY above ensures that even table owners are subject
-- to RLS policies, UNLESS they are a superuser.
--
-- For connection pool users, RLS applies automatically.
-- The app MUST call SET LOCAL app.tenant_id before any tenant-scoped query.

-- ============================================================================
-- 6. TENANTS TABLE — No RLS (tenant lookup happens before tenant_id is set)
-- ============================================================================
-- The tenants table itself does NOT have RLS because:
--   1. requireTenant middleware needs to verify tenant existence before setting app.tenant_id
--   2. Tenant lookup is by ID (from membership), not a scan
--   3. Tenant data (name, address) is not sensitive cross-tenant

COMMIT;
