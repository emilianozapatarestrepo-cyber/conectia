-- PQRS: Peticiones, Quejas, Reclamos y Sugerencias
-- Legally mandated by Ley 675/2001 — property administrators must maintain a formal
-- channel for residents to file requests, complaints, claims, and suggestions.
-- Default SLA: 15 calendar days from submission.

-- ── 1. Enum types ──────────────────────────────────────────────────────────────

CREATE TYPE pqrs_category AS ENUM (
  'peticion',    -- formal request / information request
  'queja',       -- complaint about service quality or conduct
  'reclamo',     -- claim / demand for correction of an error
  'sugerencia'   -- suggestion / improvement proposal
);

CREATE TYPE pqrs_status AS ENUM (
  'abierta',     -- just filed, no action yet
  'en_proceso',  -- admin acknowledged, actively working on it
  'respondida',  -- admin posted a formal response
  'cerrada'      -- closed (resolved or withdrawn)
);

CREATE TYPE pqrs_priority AS ENUM ('baja', 'media', 'alta');

CREATE TYPE pqrs_submitter_type AS ENUM ('residente', 'administrador', 'visitante');

-- ── 2. Table ───────────────────────────────────────────────────────────────────

CREATE TABLE pqrs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Unit reference (nullable for anonymous / non-unit submissions)
  unit_id          TEXT,
  unit_label       TEXT,

  -- Submission details
  category         pqrs_category         NOT NULL,
  subject          TEXT                  NOT NULL CHECK (char_length(subject) BETWEEN 5 AND 200),
  description      TEXT                  NOT NULL CHECK (char_length(description) >= 20),
  status           pqrs_status           NOT NULL DEFAULT 'abierta',
  priority         pqrs_priority         NOT NULL DEFAULT 'media',

  -- Who filed it
  submitted_by       TEXT                  NOT NULL,   -- display name
  submitted_by_phone TEXT,
  submitter_type     pqrs_submitter_type   NOT NULL DEFAULT 'residente',

  -- Admin response
  admin_response   TEXT,
  responded_at     TIMESTAMPTZ,
  responded_by     TEXT,   -- Firebase UID of the admin who responded

  -- SLA deadline: 15 calendar days (Ley 675/2001)
  due_date         DATE NOT NULL DEFAULT (CURRENT_DATE + 15),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE pqrs ENABLE ROW LEVEL SECURITY;

CREATE POLICY pqrs_tenant_isolation ON pqrs
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ── 4. Indexes ─────────────────────────────────────────────────────────────────

-- Primary list query: filter by status
CREATE INDEX idx_pqrs_tenant_status   ON pqrs (tenant_id, status);

-- Default sort (newest first)
CREATE INDEX idx_pqrs_tenant_created  ON pqrs (tenant_id, created_at DESC);

-- Filter by category / priority
CREATE INDEX idx_pqrs_tenant_category ON pqrs (tenant_id, category);
CREATE INDEX idx_pqrs_tenant_priority ON pqrs (tenant_id, priority);

-- Due-date alerts — only query open tickets
CREATE INDEX idx_pqrs_due_open ON pqrs (due_date)
  WHERE status NOT IN ('respondida', 'cerrada');

-- Unit filter (sparse — not all PQRS are tied to a unit)
CREATE INDEX idx_pqrs_unit ON pqrs (tenant_id, unit_id)
  WHERE unit_id IS NOT NULL;

-- ── 5. updated_at trigger ──────────────────────────────────────────────────────

CREATE TRIGGER trg_pqrs_updated
  BEFORE UPDATE ON pqrs
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
