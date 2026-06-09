-- Sprint 10: Comunicados (anuncios masivos WhatsApp-first)
-- Segmentación: todos / morosos / selección de unidades

CREATE TYPE announcement_audience AS ENUM ('todos', 'morosos', 'seleccion');
CREATE TYPE announcement_status   AS ENUM ('borrador', 'publicado');

CREATE TABLE announcements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 150),
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  audience     announcement_audience NOT NULL DEFAULT 'todos',
  unit_ids     TEXT[],                -- only for audience = 'seleccion'
  status       announcement_status NOT NULL DEFAULT 'borrador',
  created_by   TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY announcements_tenant_isolation ON announcements
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE TRIGGER trg_announcements_updated
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Snapshot de destinatarios al publicar — permite reanudar envíos y auditar entregas
CREATE TABLE announcement_recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  unit_id         TEXT NOT NULL,
  unit_label      TEXT,
  owner_name      TEXT,
  phone           TEXT,
  sent            BOOLEAN NOT NULL DEFAULT false,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE announcement_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY announcement_recipients_tenant_isolation ON announcement_recipients
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX idx_announcement_recipients_lookup
  ON announcement_recipients (announcement_id, sent);
