-- Phase 4: real gateway delivery tracking + OTP brute-force protection
ALTER TABLE message_log ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE message_log ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE patient_otps ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_patient_otps_identifier ON patient_otps (identifier, created_at DESC);
