-- Phase 2 additions. Every statement is safe to re-run (IF NOT EXISTS),
-- so this file runs on every deploy alongside the base schema.sql.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  recipient_role TEXT,
  recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('critical_result', 'specimen_rejected', 'general')),
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(branch_id, recipient_role, is_read);

ALTER TABLE results ADD COLUMN IF NOT EXISTS critical_ack_by UUID REFERENCES users(id);
ALTER TABLE results ADD COLUMN IF NOT EXISTS critical_ack_at TIMESTAMPTZ;
