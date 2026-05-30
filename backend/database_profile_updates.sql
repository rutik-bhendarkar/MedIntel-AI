ALTER TABLE users
    ADD COLUMN IF NOT EXISTS username VARCHAR(120) NULL AFTER full_name,
    ADD COLUMN IF NOT EXISTS is_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER gender,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER is_verified,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
    ADD COLUMN IF NOT EXISTS last_login DATETIME NULL AFTER updated_at,
    ADD COLUMN IF NOT EXISTS profile_image VARCHAR(500) NULL AFTER last_login,
    ADD COLUMN IF NOT EXISTS theme_preference ENUM('light', 'dark', 'system') NOT NULL DEFAULT 'light' AFTER profile_image,
    ADD COLUMN IF NOT EXISTS notifications_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER theme_preference,
    ADD COLUMN IF NOT EXISTS medical_reminders_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER notifications_enabled,
    ADD COLUMN IF NOT EXISTS chronic_conditions TEXT NULL AFTER medical_reminders_enabled,
    ADD COLUMN IF NOT EXISTS allergies TEXT NULL AFTER chronic_conditions,
    ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(255) NULL AFTER allergies,
    ADD COLUMN IF NOT EXISTS medical_history TEXT NULL AFTER emergency_contact,
    ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER medical_history,
    ADD COLUMN IF NOT EXISTS account_status VARCHAR(40) NOT NULL DEFAULT 'active' AFTER is_active;

CREATE TABLE IF NOT EXISTS password_reset_otps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_password_reset_user (user_id),
    INDEX idx_password_reset_email (email),
    INDEX idx_password_reset_expires (expires_at)
);

ALTER TABLE report_history
    ADD COLUMN IF NOT EXISTS ai_summary TEXT NULL AFTER recommendations,
    ADD COLUMN IF NOT EXISTS doctor_summary TEXT NULL AFTER ai_summary,
    ADD COLUMN IF NOT EXISTS patient_summary TEXT NULL AFTER doctor_summary,
    ADD COLUMN IF NOT EXISTS warning_signals TEXT NULL AFTER patient_summary,
    ADD COLUMN IF NOT EXISTS abnormal_values JSON NULL AFTER warning_signals,
    ADD COLUMN IF NOT EXISTS recommendation_list JSON NULL AFTER abnormal_values,
    ADD COLUMN IF NOT EXISTS confidence_score INT NULL AFTER recommendation_list;
