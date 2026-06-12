-- Sprint 11: Portal Residente — tokens de acceso por unidad
--
-- Modelo de seguridad: capability URL (igual que /pay/:reference).
-- El token crudo (256 bits aleatorios) viaja solo en la URL compartida por
-- WhatsApp; en la base se guarda únicamente su SHA-256, de modo que una fuga
-- de la base de datos no expone los links de acceso.
-- Rotar el token de una unidad revoca todos los anteriores.

CREATE TABLE unit_portal_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id          TEXT NOT NULL,            -- building-scoped id (units.unit_id)
  token_hash       TEXT NOT NULL UNIQUE,     -- sha256 hex del token crudo
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ
);

ALTER TABLE unit_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_portal_tokens FORCE ROW LEVEL SECURITY;

-- NOTA DE ARQUITECTURA: las rutas públicas del portal (y /pay) consultan con
-- el rol de aplicación SIN app.tenant_id establecido; ese rol tiene BYPASSRLS
-- (igual que el flujo Wompi en producción). La política de abajo protege
-- contra roles futuros sujetos a RLS. El aislamiento real de la superficie
-- pública es a nivel de aplicación: cada query filtra por tenant_id/unit_id
-- derivados del hash del token, nunca de parámetros del cliente.
CREATE POLICY unit_portal_tokens_tenant_isolation ON unit_portal_tokens
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX idx_unit_portal_tokens_unit
  ON unit_portal_tokens (tenant_id, unit_id, active);

-- Garantiza que rotar tokens nunca deje dos activos por unidad, incluso bajo
-- POSTs concurrentes (el segundo INSERT falla limpiamente sobre este índice).
CREATE UNIQUE INDEX uq_unit_portal_tokens_active
  ON unit_portal_tokens (tenant_id, unit_id)
  WHERE active;
