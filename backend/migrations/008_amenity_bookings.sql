-- Sprint 9: Zonas Comunes y Reservas
-- Gestión de amenidades (piscina, salón, gym, BBQ, etc.) y reservas de residentes

CREATE TABLE amenities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  description  TEXT,
  icon         TEXT,           -- emoji for UI display
  capacity     INT  NOT NULL DEFAULT 1,    -- max simultaneous groups
  open_time    TIME NOT NULL DEFAULT '07:00',
  close_time   TIME NOT NULL DEFAULT '22:00',
  slot_minutes INT  NOT NULL DEFAULT 120,  -- default slot duration (minutes)
  advance_days INT  NOT NULL DEFAULT 30,   -- max days ahead residents can book
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE amenities ENABLE ROW LEVEL SECURITY;

CREATE POLICY amenities_tenant_isolation ON amenities
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE TRIGGER trg_amenities_updated
  BEFORE UPDATE ON amenities
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE booking_status AS ENUM ('pendiente', 'aprobada', 'rechazada', 'cancelada');

CREATE TABLE amenity_bookings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amenity_id     UUID NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  unit_id        TEXT,
  unit_label     TEXT,
  resident_name  TEXT NOT NULL CHECK (char_length(resident_name) >= 2),
  resident_phone TEXT,
  date           DATE NOT NULL,
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  attendees      INT  NOT NULL DEFAULT 1 CHECK (attendees >= 1),
  status         booking_status NOT NULL DEFAULT 'pendiente',
  notes          TEXT,
  admin_notes    TEXT,
  approved_by    TEXT,
  approved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_time_order CHECK (end_time > start_time)
);

ALTER TABLE amenity_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY amenity_bookings_tenant_isolation ON amenity_bookings
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE TRIGGER trg_amenity_bookings_updated
  BEFORE UPDATE ON amenity_bookings
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_amenity_bookings_date   ON amenity_bookings (tenant_id, date, amenity_id);
CREATE INDEX idx_amenity_bookings_status ON amenity_bookings (tenant_id, status);
