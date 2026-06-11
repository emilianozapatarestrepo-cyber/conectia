-- Sprint 16: Presupuesto Anual
BEGIN;

CREATE TABLE budget_items (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_year  SMALLINT  NOT NULL,
  category     TEXT      NOT NULL,
  concept      TEXT      NOT NULL,
  budgeted     BIGINT    NOT NULL CHECK (budgeted >= 0),
  executed     BIGINT    NOT NULL DEFAULT 0 CHECK (executed >= 0),
  notes        TEXT,
  created_by   TEXT      NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budget_items_tenant_year ON budget_items(tenant_id, period_year);

ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_items FORCE ROW LEVEL SECURITY;

CREATE POLICY budget_items_tenant ON budget_items
  AS PERMISSIVE FOR ALL
  USING (tenant_id = current_tenant_id());

COMMIT;
