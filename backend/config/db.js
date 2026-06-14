const dns = require("dns");
// Prefer IPv4 results to avoid ENETUNREACH when the environment has limited IPv6
if (dns.setDefaultResultOrder) {
    try {
        dns.setDefaultResultOrder("ipv4first");
    } catch (e) {}
}

const { Pool } = require("pg");
require("dotenv").config();

// Build pool config from DATABASE_URL or individual env vars
const wantSsl = (process.env.DB_SSL === "true") || process.env.FORCE_DB_SSL === "true" || process.env.NODE_ENV === "production";

let poolConfig;
if (process.env.DATABASE_URL) {
    poolConfig = { connectionString: process.env.DATABASE_URL, max: 10 };
    if (wantSsl) poolConfig.ssl = { rejectUnauthorized: false };
} else {
    poolConfig = {
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "healthcare_ai_platform",
        max: 10,
        idleTimeoutMillis: 30000,
    };

    if (wantSsl) poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on("error", (err) => {
    console.error("Unexpected Postgres client error", err && err.message ? err.message : err);
});

(async function testConnection() {
    try {
        const client = await pool.connect();
        try {
            const info = process.env.DATABASE_URL ? "(using DATABASE_URL)" : `${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`;
            console.log("Postgres Connected Successfully", info);
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Database Connection Failed:", err && err.message ? err.message : err);
    }
})();

// Verify that key application tables exist and log helpful diagnostics
(async function verifySchema() {
    try {
        const client = await pool.connect();
        try {
            const result = await client.query("SELECT to_regclass('public.report_history') as table_name");
            const exists = result && result.rows && result.rows[0] && result.rows[0].table_name;
            if (exists) {
                console.log("DB CHECK: report_history table exists");
            } else {
                console.warn("DB CHECK: report_history table does NOT exist; attempting to create minimal table to recover...");

                try {
                    await client.query(`
                        CREATE TABLE IF NOT EXISTS report_history (
                            id SERIAL PRIMARY KEY,
                            user_id INTEGER NOT NULL,
                            report_name VARCHAR(255),
                            report_type VARCHAR(100),
                            risk_level VARCHAR(50),
                            findings TEXT,
                            recommendations TEXT,
                            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    `);

                    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_reports ON report_history(user_id)`);

                    console.log("DB CHECK: Created minimal report_history table and index");
                } catch (creationErr) {
                    console.error("DB CHECK: Failed to create report_history table:", creationErr && creationErr.message ? creationErr.message : creationErr);
                    console.warn("DB CHECK: Please run database/data.sql or create the table manually in your database.");
                }
            }
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("DB CHECK FAILED:", err && err.message ? err.message : err);
    }
})();

function convertPlaceholders(sql) {
    if (!sql || sql.indexOf("?") === -1) return sql;
    const parts = sql.split("?");
    let out = parts[0];
    for (let i = 1; i < parts.length; i++) {
        out += `$${i}` + parts[i];
    }
    return out;
}

function isInsertSql(sql) {
    return /^\s*insert\s+into/i.test(sql);
}

function isSelectSql(sql) {
    return /^\s*select/i.test(sql);
}

function query(sql, params = [], callback) {
    const insert = isInsertSql(sql);
    let sqlForPg = convertPlaceholders(sql);

    if (insert && !/returning\s+/i.test(sqlForPg)) {
        sqlForPg = `${sqlForPg} RETURNING id`;
    }

    if (typeof callback === "function") {
        pool.query(sqlForPg, params, (err, result) => {
            if (err) return callback(err);

            if (insert) {
                const insertId = result && result.rows && result.rows[0] ? result.rows[0].id : undefined;
                return callback(null, { insertId });
            }

            if (isSelectSql(sql)) return callback(null, result.rows);

            return callback(null, { affectedRows: result.rowCount, rows: result.rows });
        });

        return;
    }

    // Promise style
    return pool.query(sqlForPg, params).then((result) => {
        if (insert) return { insertId: result.rows && result.rows[0] ? result.rows[0].id : undefined };
        if (isSelectSql(sql)) return result.rows;
        return { affectedRows: result.rowCount, rows: result.rows };
    });
}

module.exports = { query, pool };
