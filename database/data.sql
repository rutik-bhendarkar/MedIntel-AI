-- PostgreSQL schema (converted from MySQL)
-- Note: create the database in Supabase and connect to it before running this file.

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    age INTEGER,
    gender VARCHAR(20),
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    symptoms TEXT,
    predicted_disease VARCHAR(100),
    confidence_score REAL,
    future_risk TEXT,
    emergency_level VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS report_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    report_name VARCHAR(255),
    report_type VARCHAR(100),
    risk_level VARCHAR(50),
    findings TEXT,
    recommendations TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS predictions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    disease_name VARCHAR(100),
    probability REAL,
    severity_level VARCHAR(50),
    future_risk TEXT,
    emergency_risk TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recommendations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    recommendation_type VARCHAR(100),
    recommendation_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS emergency_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    alert_message TEXT,
    severity VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- List tables (Postgres)
-- SELECT tablename FROM pg_tables WHERE schemaname = current_schema();

-- Example seed (uncomment to run)
-- INSERT INTO users (full_name, email, password, age, gender)
-- VALUES ('Rutik','rutik@gmail.com','test123',22,'Male');

-- Use caution with DROP statements. For cleanup run explicitly as needed:
-- DROP TABLE IF EXISTS report_history;
-- DROP TABLE IF EXISTS chat_history;
-- DROP TABLE IF EXISTS predictions;
-- DROP TABLE IF EXISTS recommendations;
-- DROP TABLE IF EXISTS emergency_alerts;
-- DROP TABLE IF EXISTS users;

CREATE INDEX IF NOT EXISTS idx_user_reports ON report_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_predictions ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_chat ON chat_history(user_id);

ALTER TABLE IF EXISTS chat_history
    ADD COLUMN IF NOT EXISTS ai_reasoning TEXT,
    ADD COLUMN IF NOT EXISTS confidence_gap TEXT;

ALTER TABLE IF EXISTS predictions
    ADD COLUMN IF NOT EXISTS confidence_explanation TEXT;

ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS medical_history TEXT,
    ADD COLUMN IF NOT EXISTS allergies TEXT,
    ADD COLUMN IF NOT EXISTS chronic_conditions TEXT;

-- SELECT * FROM users;