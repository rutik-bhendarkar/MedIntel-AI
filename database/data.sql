CREATE DATABASE healthcare_ai_platform;
use healthcare_ai_platform;

CREATE TABLE users (

    id INT PRIMARY KEY AUTO_INCREMENT,

    full_name VARCHAR(100) NOT NULL,

    email VARCHAR(150) UNIQUE NOT NULL,

    password VARCHAR(255) NOT NULL,

    age INT,

    gender VARCHAR(20),

    is_verified BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

CREATE TABLE chat_history (

    id INT PRIMARY KEY AUTO_INCREMENT,

    user_id INT NOT NULL,

    symptoms TEXT,

    predicted_disease VARCHAR(100),

    confidence_score FLOAT,

    future_risk TEXT,

    emergency_level VARCHAR(50),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE

);

CREATE TABLE report_history (

    id INT PRIMARY KEY AUTO_INCREMENT,

    user_id INT NOT NULL,

    report_name VARCHAR(255),

    report_type VARCHAR(100),

    risk_level VARCHAR(50),

    findings TEXT,

    recommendations TEXT,

    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE

);

CREATE TABLE predictions (

    id INT PRIMARY KEY AUTO_INCREMENT,

    user_id INT NOT NULL,

    disease_name VARCHAR(100),

    probability FLOAT,

    severity_level VARCHAR(50),

    future_risk TEXT,

    emergency_risk TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE

);

CREATE TABLE recommendations (

    id INT PRIMARY KEY AUTO_INCREMENT,

    user_id INT NOT NULL,

    recommendation_type VARCHAR(100),

    recommendation_text LONGTEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE

);

CREATE TABLE emergency_alerts (

    id INT PRIMARY KEY AUTO_INCREMENT,

    user_id INT NOT NULL,

    alert_message LONGTEXT,
	
    severity VARCHAR(50),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE

);

SHOW TABLES;

INSERT INTO users (

    full_name,
    email,
    password,
    age,
    gender

)

VALUES (

    'Rutik',
    'rutik@gmail.com',
    'test123',
    22,
    'Male'

);

select * from users;
select *from report_history;
DROP TABLE report_history;
DROP TABLE chat_history;
DROP TABLE predictions;
DROP TABLE recommendations;
DROP TABLE emergency_alerts;
DROP TABLE users;


SHOW TABLES;

CREATE INDEX idx_user_reports
ON report_history(user_id);

CREATE INDEX idx_user_predictions
ON predictions(user_id);

CREATE INDEX idx_user_chat
ON chat_history(user_id);

ALTER TABLE chat_history
ADD COLUMN ai_reasoning LONGTEXT,
ADD COLUMN confidence_gap TEXT;

ALTER TABLE predictions
ADD COLUMN confidence_explanation TEXT;

ALTER TABLE users
ADD COLUMN medical_history TEXT,
ADD COLUMN allergies TEXT,
ADD COLUMN chronic_conditions TEXT;

select *from users