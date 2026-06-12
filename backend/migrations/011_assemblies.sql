-- Sprint 12: Asambleas Digitales (Ley 675 de 2001)
-- Adds coeficiente de copropiedad to units, then creates assembly, agenda,
-- attendance, and vote tables with full tenant isolation via RLS.

-- ── 1. Coefficient on units ──────────────────────────────────────────────────
-- Expressed as a share of 100 (e.g., unit with 1.5% ownership = 1.5000).
-- Some buildings use thousandths instead; the admin enters whatever their
-- reglamento says. No DB constraint on the sum — totals are computed at runtime.
ALTER TABLE units ADD COLUMN IF NOT EXISTS coefficient NUMERIC(8,4) NOT NULL DEFAULT 0;

-- ── 2. Assembly types ────────────────────────────────────────────────────────
CREATE TYPE assembly_type    AS ENUM ('ordinaria', 'extraordinaria');
CREATE TYPE assembly_status  AS ENUM ('borrador', 'convocada', 'en_curso', 'cerrada');
CREATE TYPE agenda_item_type AS ENUM ('informativo', 'votacion');
CREATE TYPE vote_value       AS ENUM ('a_favor', 'en_contra', 'abstencion');
CREATE TYPE attendance_mode  AS ENUM ('presencial', 'virtual', 'poder');

-- ── 3. Assemblies ─────────────────────────────────────────────────────────────
CREATE TABLE assemblies (
  id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type                assembly_type  NOT NULL DEFAULT 'ordinaria',
  title               TEXT           NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  status              assembly_status NOT NULL DEFAULT 'borrador',
  scheduled_date      DATE,
  scheduled_time      TIME,
  location            TEXT,
  -- quorum_pct: percentage of total coefficient that must be present to deliberate
  quorum_pct          NUMERIC(5,2)   NOT NULL DEFAULT 50.00 CHECK (quorum_pct BETWEEN 0 AND 100),
  -- total_coefficient: snapshot captured when assembly is started (PATCH /start)
  -- NULL until the assembly begins; prevents late-joining units from inflating quorum
  total_coefficient   NUMERIC(12,4),
  notes               TEXT,
  minutes_text        TEXT,          -- acta libre — Markdown / plain text
  minutes_approved_at TIMESTAMPTZ,
  created_by          TEXT           NOT NULL,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- ── 4. Agenda items ───────────────────────────────────────────────────────────
CREATE TABLE assembly_agenda_items (
  id                UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id       UUID             NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  tenant_id         UUID             NOT NULL,
  "order"           SMALLINT         NOT NULL DEFAULT 0,
  title             TEXT             NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  description       TEXT,
  type              agenda_item_type NOT NULL DEFAULT 'votacion',
  -- required_majority: % of present coefficient needed to approve (usually 50+1)
  required_majority NUMERIC(5,2)     NOT NULL DEFAULT 50.00 CHECK (required_majority BETWEEN 0 AND 100),
  -- resolved_status is set by the admin after votes are counted
  resolved_status   TEXT             CHECK (resolved_status IN ('aprobado', 'rechazado', 'abstencion')),
  created_at        TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- ── 5. Attendances (quorum tracking) ─────────────────────────────────────────
CREATE TABLE assembly_attendances (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id     UUID          NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  tenant_id       UUID          NOT NULL,
  unit_id         TEXT          NOT NULL,
  unit_label      TEXT          NOT NULL,
  owner_name      TEXT,
  -- snapshot of the unit's coefficient at registration time
  coefficient     NUMERIC(8,4)  NOT NULL DEFAULT 0,
  attendance_mode attendance_mode NOT NULL DEFAULT 'presencial',
  delegate_name   TEXT,         -- non-null only when attendance_mode = 'poder'
  registered_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (assembly_id, unit_id)  -- one registration per unit per assembly
);

-- ── 6. Votes ─────────────────────────────────────────────────────────────────
CREATE TABLE assembly_votes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id    UUID        NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  agenda_item_id UUID        NOT NULL REFERENCES assembly_agenda_items(id) ON DELETE CASCADE,
  tenant_id      UUID        NOT NULL,
  unit_id        TEXT        NOT NULL,
  vote           vote_value  NOT NULL,
  -- snapshot of the unit's coefficient at vote time
  coefficient    NUMERIC(8,4) NOT NULL DEFAULT 0,
  cast_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (agenda_item_id, unit_id)  -- one vote per unit per agenda item
);

-- ── 7. Row-level security ─────────────────────────────────────────────────────
ALTER TABLE assemblies ENABLE ROW LEVEL SECURITY;
ALTER TABLE assemblies FORCE ROW LEVEL SECURITY;

ALTER TABLE assembly_agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_agenda_items FORCE ROW LEVEL SECURITY;

ALTER TABLE assembly_attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_attendances FORCE ROW LEVEL SECURITY;

ALTER TABLE assembly_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_votes FORCE ROW LEVEL SECURITY;

CREATE POLICY assemblies_tenant ON assemblies
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY assembly_agenda_items_tenant ON assembly_agenda_items
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY assembly_attendances_tenant ON assembly_attendances
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY assembly_votes_tenant ON assembly_votes
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ── 8. updated_at trigger (assemblies only) ───────────────────────────────────
CREATE TRIGGER trg_assemblies_updated
  BEFORE UPDATE ON assemblies
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ── 9. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX idx_assemblies_tenant_date ON assemblies (tenant_id, scheduled_date DESC);
CREATE INDEX idx_agenda_items_assembly  ON assembly_agenda_items (assembly_id, "order");
CREATE INDEX idx_attendances_assembly   ON assembly_attendances (assembly_id);
CREATE INDEX idx_votes_agenda_item      ON assembly_votes (agenda_item_id);
