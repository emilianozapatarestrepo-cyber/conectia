-- migrations/003_dashboard_charges_alerts.sql
-- Conectia Dashboard Schema — additive migration
-- Run: psql $DATABASE_URL -f migrations/003_dashboard_charges_alerts.sql

BEGIN;

-- ── Billing periods (NEW TABLE) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  label       TEXT NOT NULL,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  starts_at   DATE NOT NULL,
  ends_at     DATE NOT NULL,
  due_date    DATE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, year, month)
);

ALTER TABLE periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE periods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS periods_tenant_isolation ON periods;
CREATE POLICY periods_tenant_isolation ON periods
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS idx_periods_tenant ON periods(tenant_id, year, month);

-- ── Alerts (NEW TABLE) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  type          TEXT NOT NULL
                  CHECK (type IN ('mora_critica','mora_nueva','conciliacion_pendiente','vencimiento_proximo','pago_confirmado')),
  severity      TEXT NOT NULL CHECK (severity IN ('critical','warning','info')),
  unit_id       TEXT,
  unit_label    TEXT,
  amount        BIGINT,
  message       TEXT NOT NULL,
  action_type   TEXT,
  action_label  TEXT,
  resolved      BOOLEAN DEFAULT FALSE,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alerts_tenant_isolation ON alerts;
CREATE POLICY alerts_tenant_isolation ON alerts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(tenant_id, resolved, severity);

-- ── Extend charges table (ADD COLUMNS only) ───────────────────────────────────
ALTER TABLE charges ADD COLUMN IF NOT EXISTS unit_label TEXT;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS transaction_id UUID;

CREATE INDEX IF NOT EXISTS idx_charges_tenant_period ON charges(tenant_id, period_id);
CREATE INDEX IF NOT EXISTS idx_charges_tenant_unit   ON charges(tenant_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_charges_status_due    ON charges(tenant_id, status, due_date);

-- ── Extend payment_intents table (ADD COLUMNS only) ───────────────────────────
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS charge_id UUID REFERENCES charges(id);
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS external_ref TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS comprobante_url TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS webhook_payload JSONB;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS webhook_received_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pi_charge ON payment_intents(tenant_id, charge_id);
CREATE INDEX IF NOT EXISTS idx_pi_status ON payment_intents(tenant_id, status);

COMMIT;
