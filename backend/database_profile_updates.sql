-- PostgreSQL-compatible profile and report updates
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS username VARCHAR(120),
    ADD COLUMN IF NOT EXISTS is_verified SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS last_login TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS profile_image VARCHAR(500) NULL,
    ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) NOT NULL DEFAULT 'light' CHECK (theme_preference IN ('light','dark','system')),
    ADD COLUMN IF NOT EXISTS notifications_enabled SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS medical_reminders_enabled SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS chronic_conditions TEXT NULL,
    ADD COLUMN IF NOT EXISTS allergies TEXT NULL,
    ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS medical_history TEXT NULL,
    ADD COLUMN IF NOT EXISTS is_active SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS account_status VARCHAR(40) NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS password_reset_otps (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    email VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- indexes for password_reset_otps
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_otps (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_email ON password_reset_otps (email);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_otps (expires_at);

ALTER TABLE report_history
    ADD COLUMN IF NOT EXISTS ai_summary TEXT NULL,
    ADD COLUMN IF NOT EXISTS doctor_summary TEXT NULL,
    ADD COLUMN IF NOT EXISTS patient_summary TEXT NULL,
    ADD COLUMN IF NOT EXISTS warning_signals TEXT NULL,
    ADD COLUMN IF NOT EXISTS abnormal_values JSONB NULL,
    ADD COLUMN IF NOT EXISTS recommendation_list JSONB NULL,
    ADD COLUMN IF NOT EXISTS confidence_score INTEGER NULL;
