-- ============================================================================
-- CONECTIA — Immutable Double-Entry Financial Ledger
-- Migration 001: Core schema with PL/pgSQL integrity enforcement
-- Dialect: PostgreSQL 15+
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================

CREATE TYPE account_type AS ENUM (
  'asset',        -- Activos (Banco, Caja, CxC)
  'liability',    -- Pasivos (CxP, Anticipos recibidos)
  'equity',       -- Patrimonio (Fondo reserva, Superávit)
  'revenue',      -- Ingresos (Cuota ordinaria, Cuota extraordinaria, Multas)
  'expense'       -- Gastos (Servicios públicos, Mantenimiento, Personal)
);

CREATE TYPE entry_type AS ENUM (
  'debit',
  'credit'
);

CREATE TYPE transaction_type AS ENUM (
  'charge',       -- Cobro de cuota/cargo al residente
  'payment',      -- Pago recibido (webhook o manual)
  'adjustment',   -- Ajuste contable
  'reversal',     -- Reversión de un asiento previo
  'migration',    -- Saldos iniciales de importación Excel
  'transfer',     -- Transferencia entre cuentas internas
  'fee',          -- Comisión del procesador de pagos
  'settlement'    -- Liquidación del procesador
);

CREATE TYPE charge_status AS ENUM (
  'draft',
  'active',
  'paid',
  'partial',
  'overdue',
  'cancelled',
  'written_off'
);

CREATE TYPE payment_intent_status AS ENUM (
  'pending',
  'processing',
  'confirmed',
  'failed',
  'reversed',
  'settled'
);

CREATE TYPE webhook_processing_status AS ENUM (
  'pending',
  'processed',
  'failed',
  'ignored'
);

CREATE TYPE period_status AS ENUM (
  'open',
  'closing',
  'closed'
);

-- ============================================================================
-- 2. TENANTS (Buildings / Condominios)
-- ============================================================================

CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id   TEXT UNIQUE,              -- Firebase buildingId (backward compat)
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'condo' CHECK (type IN ('condo', 'multifamily')),
  address       TEXT,
  tax_id        TEXT,                     -- NIT / RUT del condominio
  currency      TEXT NOT NULL DEFAULT 'COP',
  timezone      TEXT NOT NULL DEFAULT 'America/Bogota',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_external ON tenants(external_id);

-- ============================================================================
-- 3. CHART OF ACCOUNTS (Plan de Cuentas por Tenant)
-- ============================================================================

CREATE TABLE chart_of_accounts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  code          TEXT NOT NULL,            -- "1100", "1200", "4100", etc.
  name          TEXT NOT NULL,            -- "Banco Principal", "CxC Cuota Ordinaria"
  account_type  account_type NOT NULL,
  parent_id     UUID REFERENCES chart_of_accounts(id),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  metadata      JSONB DEFAULT '{}',       -- Flexible: unit_id, user_id, etc.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_tenant_account_code UNIQUE (tenant_id, code)
);

CREATE INDEX idx_coa_tenant ON chart_of_accounts(tenant_id);
CREATE INDEX idx_coa_type ON chart_of_accounts(tenant_id, account_type);
CREATE INDEX idx_coa_parent ON chart_of_accounts(parent_id);

-- ============================================================================
-- 4. FISCAL PERIODS
-- ============================================================================

CREATE TABLE fiscal_periods (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  year_month    TEXT NOT NULL,            -- "2026-01"
  status        period_status NOT NULL DEFAULT 'open',
  closed_at     TIMESTAMPTZ,
  closed_by     TEXT,                     -- Firebase UID
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_tenant_period UNIQUE (tenant_id, year_month)
);

CREATE INDEX idx_periods_tenant ON fiscal_periods(tenant_id);

-- ============================================================================
-- 5. TRANSACTIONS (Agrupador de asientos — header)
-- ============================================================================

CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  transaction_type  transaction_type NOT NULL,
  description       TEXT NOT NULL,
  period_id         UUID REFERENCES fiscal_periods(id),
  effective_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  posted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotency: previene duplicados
  idempotency_key   UUID NOT NULL,

  -- Trazabilidad
  source_type       TEXT,                 -- "webhook", "admin_manual", "migration", "system"
  source_id         TEXT,                 -- ID del charge, payment_intent, etc.

  -- Metadata
  metadata          JSONB DEFAULT '{}',
  created_by        TEXT NOT NULL,        -- Firebase UID del operador
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Hash chain: enlaza con la transacción anterior del tenant
  prev_tx_hash      TEXT,                 -- SHA-256 del registro anterior
  tx_hash           TEXT NOT NULL,        -- SHA-256 de este registro

  CONSTRAINT uq_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX idx_tx_tenant ON transactions(tenant_id);
CREATE INDEX idx_tx_tenant_date ON transactions(tenant_id, effective_date);
CREATE INDEX idx_tx_tenant_type ON transactions(tenant_id, transaction_type);
CREATE INDEX idx_tx_source ON transactions(source_type, source_id);
CREATE INDEX idx_tx_hash ON transactions(tx_hash);

-- ============================================================================
-- 6. LEDGER ENTRIES (Líneas de asiento — INMUTABLE)
-- ============================================================================

CREATE TABLE ledger_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  account_id      UUID NOT NULL REFERENCES chart_of_accounts(id),
  entry_type      entry_type NOT NULL,
  amount          BIGINT NOT NULL CHECK (amount > 0),   -- Centavos, siempre positivo
  currency        TEXT NOT NULL DEFAULT 'COP',
  description     TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Hash chain a nivel de entry
  entry_hash      TEXT NOT NULL            -- SHA-256 para tamper detection
);

CREATE INDEX idx_le_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_le_account ON ledger_entries(account_id);
CREATE INDEX idx_le_tenant ON ledger_entries(tenant_id);
CREATE INDEX idx_le_tenant_account ON ledger_entries(tenant_id, account_id);

-- ============================================================================
-- 7. CHARGES (Cuotas / Cargos)
-- ============================================================================

CREATE TABLE charges (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  unit_id           TEXT NOT NULL,         -- Firebase unit ID
  user_id           TEXT NOT NULL,          -- Firebase user ID
  concept           TEXT NOT NULL,
  amount            BIGINT NOT NULL CHECK (amount > 0),  -- Centavos
  currency          TEXT NOT NULL DEFAULT 'COP',
  due_date          DATE NOT NULL,
  period_id         UUID REFERENCES fiscal_periods(id),
  status            charge_status NOT NULL DEFAULT 'active',
  paid_amount       BIGINT NOT NULL DEFAULT 0,
  ledger_tx_id      UUID REFERENCES transactions(id),   -- Asiento de creación
  idempotency_key   UUID NOT NULL,
  metadata          JSONB DEFAULT '{}',
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_charge_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX idx_charges_tenant ON charges(tenant_id);
CREATE INDEX idx_charges_unit ON charges(tenant_id, unit_id);
CREATE INDEX idx_charges_user ON charges(tenant_id, user_id);
CREATE INDEX idx_charges_status ON charges(tenant_id, status);
CREATE INDEX idx_charges_due ON charges(tenant_id, due_date);

-- ============================================================================
-- 8. PAYMENT INTENTS
-- ============================================================================

CREATE TABLE payment_intents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  unit_id           TEXT NOT NULL,
  user_id           TEXT NOT NULL,
  charge_ids        UUID[] NOT NULL DEFAULT '{}',   -- Array de IDs de charges
  amount            BIGINT NOT NULL CHECK (amount > 0),
  currency          TEXT NOT NULL DEFAULT 'COP',
  provider          TEXT NOT NULL,                  -- 'wompi', 'bold', 'pse', 'nequi', 'manual'
  provider_ref      TEXT,                           -- Referencia del procesador
  status            payment_intent_status NOT NULL DEFAULT 'pending',
  idempotency_key   UUID NOT NULL,
  ledger_tx_id      UUID REFERENCES transactions(id),
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_pi_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX idx_pi_tenant ON payment_intents(tenant_id);
CREATE INDEX idx_pi_provider_ref ON payment_intents(provider, provider_ref);
CREATE INDEX idx_pi_status ON payment_intents(tenant_id, status);
CREATE INDEX idx_pi_user ON payment_intents(tenant_id, user_id);

-- ============================================================================
-- 9. WEBHOOK EVENTS (APPEND-ONLY)
-- ============================================================================

CREATE TABLE webhook_events (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider            TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  provider_event_id   TEXT NOT NULL,
  raw_payload         JSONB NOT NULL,
  signature           TEXT,
  signature_valid     BOOLEAN,
  processing_status   webhook_processing_status NOT NULL DEFAULT 'pending',
  processed_at        TIMESTAMPTZ,
  error_message       TEXT,
  related_intent_id   UUID REFERENCES payment_intents(id),
  idempotency_key     TEXT NOT NULL,       -- Typically provider_event_id
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_webhook_idempotency UNIQUE (provider, idempotency_key)
);

CREATE INDEX idx_wh_provider ON webhook_events(provider, provider_event_id);
CREATE INDEX idx_wh_status ON webhook_events(processing_status);
CREATE INDEX idx_wh_received ON webhook_events(received_at);

-- ============================================================================
-- 10. SUSPENSE ACCOUNT (Pagos no identificados)
-- ============================================================================

CREATE TABLE suspense_entries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID REFERENCES tenants(id),       -- Puede ser NULL si no se identifica tenant
  webhook_event_id  UUID NOT NULL REFERENCES webhook_events(id),
  amount            BIGINT NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'COP',
  reason            TEXT NOT NULL,                      -- 'unmatched', 'amount_mismatch', 'duplicate'
  resolved_at       TIMESTAMPTZ,
  resolved_by       TEXT,                               -- UID del admin
  resolution_type   TEXT,                               -- 'matched', 'rejected', 'manual_entry'
  resolution_tx_id  UUID REFERENCES transactions(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suspense_tenant ON suspense_entries(tenant_id);
CREATE INDEX idx_suspense_unresolved ON suspense_entries(tenant_id) WHERE resolved_at IS NULL;

-- ============================================================================
-- 11. AUDIT LOG (APPEND-ONLY)
-- ============================================================================

CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID REFERENCES tenants(id),
  actor_id        TEXT NOT NULL,           -- Firebase UID
  action          TEXT NOT NULL,           -- 'charge.created', 'payment.confirmed', etc.
  target_table    TEXT,
  target_id       TEXT,
  before_data     JSONB,
  after_data      JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_tenant ON audit_log(tenant_id);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_target ON audit_log(target_table, target_id);
CREATE INDEX idx_audit_time ON audit_log(created_at);

-- ============================================================================
-- 12. PL/pgSQL TRIGGERS — IMMUTABILITY ENFORCEMENT
-- ============================================================================

-- 12a. Block UPDATE on ledger_entries
CREATE OR REPLACE FUNCTION fn_block_ledger_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is IMMUTABLE. UPDATE operations are forbidden. '
    'To correct an entry, create a reversal transaction.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_ledger_update
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION fn_block_ledger_update();

-- 12b. Block DELETE on ledger_entries
CREATE OR REPLACE FUNCTION fn_block_ledger_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is IMMUTABLE. DELETE operations are forbidden. '
    'To void an entry, create a reversal transaction.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_ledger_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION fn_block_ledger_delete();

-- 12c. Block UPDATE on webhook_events
CREATE OR REPLACE FUNCTION fn_block_webhook_update_core()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow updating processing_status, processed_at, error_message, related_intent_id, signature_valid only
  IF OLD.provider IS DISTINCT FROM NEW.provider
     OR OLD.event_type IS DISTINCT FROM NEW.event_type
     OR OLD.provider_event_id IS DISTINCT FROM NEW.provider_event_id
     OR OLD.raw_payload IS DISTINCT FROM NEW.raw_payload
     OR OLD.signature IS DISTINCT FROM NEW.signature
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
     OR OLD.received_at IS DISTINCT FROM NEW.received_at
  THEN
    RAISE EXCEPTION 'webhook_events core fields are IMMUTABLE. '
      'Only processing_status, processed_at, error_message, related_intent_id, signature_valid may be updated.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_webhook_update
  BEFORE UPDATE ON webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_block_webhook_update_core();

-- 12d. Block DELETE on webhook_events
CREATE OR REPLACE FUNCTION fn_block_webhook_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'webhook_events is APPEND-ONLY. DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_webhook_delete
  BEFORE DELETE ON webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_block_webhook_delete();

-- 12e. Block UPDATE/DELETE on audit_log
CREATE OR REPLACE FUNCTION fn_block_audit_modify()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is APPEND-ONLY. % operations are forbidden.', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_audit_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION fn_block_audit_modify();

CREATE TRIGGER trg_block_audit_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION fn_block_audit_modify();

-- ============================================================================
-- 13. DEFERRED CONSTRAINT: DOUBLE-ENTRY BALANCE CHECK
-- ============================================================================
-- This trigger fires at COMMIT time and ensures every transaction
-- in the current batch has balanced debits = credits.

CREATE OR REPLACE FUNCTION fn_verify_double_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_debit_sum   BIGINT;
  v_credit_sum  BIGINT;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)
  INTO v_debit_sum, v_credit_sum
  FROM ledger_entries
  WHERE transaction_id = NEW.transaction_id;

  IF v_debit_sum <> v_credit_sum THEN
    RAISE EXCEPTION 'DOUBLE-ENTRY VIOLATION: Transaction % has debit_sum=% and credit_sum=%. They MUST be equal.',
      NEW.transaction_id, v_debit_sum, v_credit_sum;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create as DEFERRED so it checks at COMMIT, not per-row.
-- This allows inserting multiple entries in a single transaction
-- and only validating the balance at the end.
CREATE CONSTRAINT TRIGGER trg_verify_double_entry
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION fn_verify_double_entry_balance();

-- ============================================================================
-- 14. HASH CHAIN HELPERS
-- ============================================================================

-- Compute hash for a transaction row (used by application layer)
-- Formula: SHA-256( prev_hash || tenant_id || type || amount_str || date || idempotency_key )
-- The application layer sets tx_hash before INSERT using this pattern.

CREATE OR REPLACE FUNCTION fn_compute_tx_hash(
  p_prev_hash TEXT,
  p_tenant_id UUID,
  p_tx_type transaction_type,
  p_effective_date DATE,
  p_idempotency_key UUID,
  p_created_by TEXT
) RETURNS TEXT AS $$
BEGIN
  RETURN encode(
    digest(
      COALESCE(p_prev_hash, 'GENESIS') || '|' ||
      p_tenant_id::TEXT || '|' ||
      p_tx_type::TEXT || '|' ||
      p_effective_date::TEXT || '|' ||
      p_idempotency_key::TEXT || '|' ||
      p_created_by,
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Compute hash for a ledger entry
CREATE OR REPLACE FUNCTION fn_compute_entry_hash(
  p_transaction_id UUID,
  p_account_id UUID,
  p_entry_type entry_type,
  p_amount BIGINT,
  p_currency TEXT
) RETURNS TEXT AS $$
BEGIN
  RETURN encode(
    digest(
      p_transaction_id::TEXT || '|' ||
      p_account_id::TEXT || '|' ||
      p_entry_type::TEXT || '|' ||
      p_amount::TEXT || '|' ||
      p_currency,
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 15. BLOCK WRITES TO CLOSED PERIODS
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_block_closed_period()
RETURNS TRIGGER AS $$
DECLARE
  v_period_status period_status;
BEGIN
  IF NEW.period_id IS NOT NULL THEN
    SELECT status INTO v_period_status
    FROM fiscal_periods
    WHERE id = NEW.period_id;

    IF v_period_status = 'closed' THEN
      RAISE EXCEPTION 'Cannot post transaction to closed fiscal period %.', NEW.period_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_closed_period
  BEFORE INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION fn_block_closed_period();

-- ============================================================================
-- 16. AUTO-UPDATE updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_coa_updated BEFORE UPDATE ON chart_of_accounts FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_charges_updated BEFORE UPDATE ON charges FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_pi_updated BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================================
-- 17. SEED: DEFAULT CHART OF ACCOUNTS TEMPLATE
-- ============================================================================
-- This function creates a standard chart_of_accounts for a new tenant.
-- Called by the application layer after tenant creation.

CREATE OR REPLACE FUNCTION fn_seed_chart_of_accounts(p_tenant_id UUID)
RETURNS void AS $$
DECLARE
  v_asset_parent   UUID;
  v_liability_parent UUID;
  v_equity_parent  UUID;
  v_revenue_parent UUID;
  v_expense_parent UUID;
BEGIN
  -- Level 1: Root accounts
  INSERT INTO chart_of_accounts (id, tenant_id, code, name, account_type)
  VALUES (uuid_generate_v4(), p_tenant_id, '1000', 'Activos', 'asset')
  RETURNING id INTO v_asset_parent;

  INSERT INTO chart_of_accounts (id, tenant_id, code, name, account_type)
  VALUES (uuid_generate_v4(), p_tenant_id, '2000', 'Pasivos', 'liability')
  RETURNING id INTO v_liability_parent;

  INSERT INTO chart_of_accounts (id, tenant_id, code, name, account_type)
  VALUES (uuid_generate_v4(), p_tenant_id, '3000', 'Patrimonio', 'equity')
  RETURNING id INTO v_equity_parent;

  INSERT INTO chart_of_accounts (id, tenant_id, code, name, account_type)
  VALUES (uuid_generate_v4(), p_tenant_id, '4000', 'Ingresos', 'revenue')
  RETURNING id INTO v_revenue_parent;

  INSERT INTO chart_of_accounts (id, tenant_id, code, name, account_type)
  VALUES (uuid_generate_v4(), p_tenant_id, '5000', 'Gastos', 'expense')
  RETURNING id INTO v_expense_parent;

  -- Level 2: Common sub-accounts
  -- Assets
  INSERT INTO chart_of_accounts (tenant_id, code, name, account_type, parent_id) VALUES
    (p_tenant_id, '1100', 'Banco Principal', 'asset', v_asset_parent),
    (p_tenant_id, '1200', 'Caja Menor', 'asset', v_asset_parent),
    (p_tenant_id, '1300', 'Cuentas por Cobrar - Cuota Ordinaria', 'asset', v_asset_parent),
    (p_tenant_id, '1310', 'Cuentas por Cobrar - Cuota Extraordinaria', 'asset', v_asset_parent),
    (p_tenant_id, '1320', 'Cuentas por Cobrar - Multas', 'asset', v_asset_parent),
    (p_tenant_id, '1400', 'Procesador de Pagos por Liquidar', 'asset', v_asset_parent),
    (p_tenant_id, '1500', 'Cuenta Suspense (No Identificados)', 'asset', v_asset_parent);

  -- Liabilities
  INSERT INTO chart_of_accounts (tenant_id, code, name, account_type, parent_id) VALUES
    (p_tenant_id, '2100', 'Anticipos Recibidos', 'liability', v_liability_parent),
    (p_tenant_id, '2200', 'Cuentas por Pagar - Proveedores', 'liability', v_liability_parent),
    (p_tenant_id, '2300', 'Impuestos por Pagar', 'liability', v_liability_parent);

  -- Equity
  INSERT INTO chart_of_accounts (tenant_id, code, name, account_type, parent_id) VALUES
    (p_tenant_id, '3100', 'Fondo de Reserva', 'equity', v_equity_parent),
    (p_tenant_id, '3200', 'Fondo de Imprevistos', 'equity', v_equity_parent),
    (p_tenant_id, '3300', 'Superávit / Déficit Acumulado', 'equity', v_equity_parent);

  -- Revenue
  INSERT INTO chart_of_accounts (tenant_id, code, name, account_type, parent_id) VALUES
    (p_tenant_id, '4100', 'Cuota de Administración Ordinaria', 'revenue', v_revenue_parent),
    (p_tenant_id, '4200', 'Cuota Extraordinaria', 'revenue', v_revenue_parent),
    (p_tenant_id, '4300', 'Multas y Sanciones', 'revenue', v_revenue_parent),
    (p_tenant_id, '4400', 'Intereses por Mora', 'revenue', v_revenue_parent),
    (p_tenant_id, '4500', 'Otros Ingresos', 'revenue', v_revenue_parent);

  -- Expenses
  INSERT INTO chart_of_accounts (tenant_id, code, name, account_type, parent_id) VALUES
    (p_tenant_id, '5100', 'Servicios Públicos', 'expense', v_expense_parent),
    (p_tenant_id, '5200', 'Mantenimiento y Reparaciones', 'expense', v_expense_parent),
    (p_tenant_id, '5300', 'Personal (Portería, Aseo)', 'expense', v_expense_parent),
    (p_tenant_id, '5400', 'Seguros', 'expense', v_expense_parent),
    (p_tenant_id, '5500', 'Comisiones Procesador de Pagos', 'expense', v_expense_parent),
    (p_tenant_id, '5600', 'Honorarios Administración', 'expense', v_expense_parent),
    (p_tenant_id, '5700', 'Otros Gastos', 'expense', v_expense_parent);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 18. HELPER VIEWS
-- ============================================================================

-- Account balances (real-time computed from ledger)
CREATE OR REPLACE VIEW v_account_balances AS
SELECT
  le.tenant_id,
  le.account_id,
  coa.code AS account_code,
  coa.name AS account_name,
  coa.account_type,
  SUM(CASE WHEN le.entry_type = 'debit' THEN le.amount ELSE 0 END) AS total_debits,
  SUM(CASE WHEN le.entry_type = 'credit' THEN le.amount ELSE 0 END) AS total_credits,
  CASE
    WHEN coa.account_type IN ('asset', 'expense')
      THEN SUM(CASE WHEN le.entry_type = 'debit' THEN le.amount ELSE -le.amount END)
    ELSE
      SUM(CASE WHEN le.entry_type = 'credit' THEN le.amount ELSE -le.amount END)
  END AS balance
FROM ledger_entries le
JOIN chart_of_accounts coa ON le.account_id = coa.id
GROUP BY le.tenant_id, le.account_id, coa.code, coa.name, coa.account_type;

-- Unit outstanding balance (what each unit owes)
CREATE OR REPLACE VIEW v_unit_outstanding AS
SELECT
  c.tenant_id,
  c.unit_id,
  c.user_id,
  SUM(c.amount - c.paid_amount) AS outstanding_amount,
  COUNT(*) FILTER (WHERE c.status = 'overdue') AS overdue_count,
  MIN(c.due_date) FILTER (WHERE c.status IN ('active', 'overdue')) AS earliest_due
FROM charges c
WHERE c.status IN ('active', 'partial', 'overdue')
GROUP BY c.tenant_id, c.unit_id, c.user_id;

COMMIT;
