-- Sprint 13: Recordatorios automáticos de cartera morosa
-- Tracks which reminders have been generated and sent.
-- The nightly cron creates pending reminders; admins send them via WhatsApp
-- or the system sends via Meta Cloud API when credentials are configured.

-- ── 1. Reminder type + status ────────────────────────────────────────────────
CREATE TYPE reminder_type   AS ENUM ('D1', 'D7', 'D30');   -- days past due date
CREATE TYPE reminder_status AS ENUM ('pending', 'sent', 'skipped', 'failed');

-- ── 2. Charge reminders ───────────────────────────────────────────────────────
CREATE TABLE charge_reminders (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  charge_id    UUID           NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  unit_id      TEXT           NOT NULL,
  unit_label   TEXT,
  owner_name   TEXT,
  phone        TEXT,                      -- snapshot at creation time
  amount_cents NUMERIC(20,0)  NOT NULL,   -- outstanding balance at creation time
  concept      TEXT           NOT NULL,
  due_date     DATE           NOT NULL,   -- snapshot of charge.due_date
  reminder_type reminder_type NOT NULL,
  status       reminder_status NOT NULL DEFAULT 'pending',
  scheduled_for DATE          NOT NULL,   -- date the reminder should go out
  sent_at      TIMESTAMPTZ,
  sent_via     TEXT           CHECK (sent_via IN ('manual', 'api', 'whatsapp_link')),
  error_msg    TEXT,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  -- One reminder type per charge — don't spam
  UNIQUE (charge_id, reminder_type)
);

-- ── 3. Optional WhatsApp Business API credentials per tenant ─────────────────
-- NULL = fallback to manual wa.me links (works from day 1 with no setup)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_phone_id   TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_api_token  TEXT;  -- encrypted at app level

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE charge_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_reminders FORCE ROW LEVEL SECURITY;

CREATE POLICY charge_reminders_tenant ON charge_reminders
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ── 5. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX idx_charge_reminders_tenant_status
  ON charge_reminders (tenant_id, status, scheduled_for);
CREATE INDEX idx_charge_reminders_charge
  ON charge_reminders (charge_id);
