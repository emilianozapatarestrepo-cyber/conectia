-- migrations/005_units_roster.sql
-- Conectia — Unit roster: the master list of building units with contact info.
-- Each unit has a fixed monthly fee, owner name, and phone for WhatsApp notifications.

BEGIN;

CREATE TABLE IF NOT EXISTS units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id     TEXT NOT NULL,              -- e.g. "A-101", "Torre B Apto 302"
  label       TEXT NOT NULL,             -- display name shown in the UI
  owner_name  TEXT,
  phone       TEXT,                      -- Colombian mobile without +57: "3001234567"
  email       TEXT,
  fee_amount  BIGINT NOT NULL DEFAULT 0, -- monthly fee in centavos COP
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_unit_per_tenant UNIQUE (tenant_id, unit_id)
);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE units FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS units_tenant_isolation ON units;
CREATE POLICY units_tenant_isolation ON units
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_units_tenant        ON units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_units_tenant_active ON units(tenant_id, active);

CREATE TRIGGER trg_units_updated
  BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMIT;
