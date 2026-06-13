const { Pool } = require("pg");
require("dotenv").config();

// Build pool config from DATABASE_URL or individual env vars
const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, max: 10 }
    : {
            host: process.env.DB_HOST || "localhost",
            port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
            user: process.env.DB_USER || "postgres",
            password: process.env.DB_PASSWORD || "",
            database: process.env.DB_NAME || "healthcare_ai_platform",
            max: 10,
            idleTimeoutMillis: 30000,
        };

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
