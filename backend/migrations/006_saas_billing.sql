-- ============================================================
-- Migration 006 — SaaS Billing: plans + subscriptions
-- ============================================================
-- Conectia charges buildings a monthly SaaS fee.
-- This migration introduces the plan catalogue and per-tenant
-- subscription lifecycle (trialing → active → past_due → expired).
-- ============================================================

BEGIN;

-- ── Plans catalogue (static, managed by Conectia) ───────────────────────────

CREATE TABLE IF NOT EXISTS plans (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT        UNIQUE NOT NULL,   -- 'trial', 'starter', 'pro', 'enterprise'
  name              TEXT        NOT NULL,
  max_units         INTEGER,                       -- NULL = unlimited
  monthly_price_cents BIGINT    NOT NULL DEFAULT 0, -- COP centavos
  features          JSONB       NOT NULL DEFAULT '{}',
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed canonical plans
INSERT INTO plans (code, name, max_units, monthly_price_cents, features) VALUES
  ('trial',      'Trial 30 días', 20,   0,        '{"whatsapp":true,"export":false,"assembly":true}'),
  ('starter',    'Starter',       50,   9900000,  '{"whatsapp":true,"export":true,"assembly":true}'),
  ('pro',        'Pro',           150,  19900000, '{"whatsapp":true,"export":true,"assembly":true,"api":true}'),
  ('enterprise', 'Enterprise',    NULL, 39900000, '{"whatsapp":true,"export":true,"assembly":true,"api":true,"sla":true}')
ON CONFLICT (code) DO NOTHING;

-- ── Subscriptions (one per tenant) ──────────────────────────────────────────

CREATE TYPE subscription_status AS ENUM (
  'trialing',   -- within trial window
  'active',     -- paid and current
  'past_due',   -- payment failed, in grace period (7 days)
  'cancelled',  -- explicitly cancelled, access until period end
  'expired'     -- no longer active, read-only access
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                    UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID                NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id               UUID                NOT NULL REFERENCES plans(id),
  status                subscription_status NOT NULL DEFAULT 'trialing',
  trial_ends_at         TIMESTAMPTZ,
  current_period_start  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  current_period_end    TIMESTAMPTZ         NOT NULL,
  cancelled_at          TIMESTAMPTZ,
  payment_method        TEXT,               -- 'manual', 'wompi', 'bank_transfer'
  external_ref          TEXT,               -- Wompi subscription ID or invoice ref
  activated_by          TEXT,               -- Firebase UID or 'system'
  created_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  CONSTRAINT subscriptions_tenant_unique UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant    ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status    ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions(current_period_end);

-- updated_at trigger
CREATE TRIGGER trg_subscriptions_updated
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMIT;
