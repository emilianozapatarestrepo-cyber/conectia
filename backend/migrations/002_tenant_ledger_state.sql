-- ============================================================================
-- CONECTIA — MVCC Hash Chain Locking Table
-- Migration 002: tenant_ledger_state for serialized hash computation
-- ============================================================================

BEGIN;

-- This table holds exactly ONE row per tenant.
-- The Transaction Runner acquires a FOR UPDATE lock on this row
-- to serialize hash chain computation, preventing race conditions
-- when multiple concurrent transactions are posted for the same tenant.

CREATE TABLE tenant_ledger_state (
  tenant_id       UUID PRIMARY KEY REFERENCES tenants(id),
  current_hash    TEXT NOT NULL DEFAULT 'GENESIS',
  tx_count        BIGINT NOT NULL DEFAULT 0,
  last_tx_id      UUID REFERENCES transactions(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create a ledger_state row when a new tenant is inserted
CREATE OR REPLACE FUNCTION fn_create_ledger_state()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO tenant_ledger_state (tenant_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_ledger_state
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION fn_create_ledger_state();

-- Backfill for any existing tenants
INSERT INTO tenant_ledger_state (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

COMMIT;
