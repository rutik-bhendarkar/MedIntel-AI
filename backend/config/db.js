const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

function normalizeSql(sql) {
  const text = String(sql || "").trim();

  // MySQL -> PostgreSQL compatibility
  if (/^SHOW\s+COLUMNS\s+FROM\s+users\s*;?$/i.test(text)) {
    return { type: "show_columns_users" };
  }

  if (/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+password_reset_otps/i.test(text)) {
    return { type: "create_password_reset_otps" };
  }

  // Replace ? with $1, $2 ...
  let i = 0;

  const translated = text.replace(/\?/g, () => {
    i += 1;
    return `$${i}`;
  });

  return {
    type: "normal",
    sql: translated,
  };
}

async function run(sql, values = []) {
  const originalSql = String(sql || "").trim();

  const normalized = normalizeSql(originalSql);

  // SHOW COLUMNS compatibility
  if (normalized.type === "show_columns_users") {
    const result = await pool.query(`
      SELECT column_name AS "Field"
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'users'
      ORDER BY ordinal_position
    `);

    return result.rows;
  }

  // Auto create OTP table
  if (normalized.type === "create_password_reset_otps") {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_otps (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        otp_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_user
      ON password_reset_otps(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_email
      ON password_reset_otps(email)
    `);

    return {
      created: true,
    };
  }

  let finalSql = normalized.sql;

  // Add RETURNING * automatically for INSERT
  const isInsert = /^\s*INSERT\s+INTO/i.test(originalSql);

  const hasReturning = /\bRETURNING\b/i.test(finalSql);

  if (isInsert && !hasReturning) {
    finalSql += " RETURNING *";
  }

  const result = await pool.query(finalSql, values);

  // SELECT
  if (/^\s*SELECT\b/i.test(originalSql)) {
    return result.rows;
  }

  // INSERT
  if (/^\s*INSERT\b/i.test(originalSql)) {
    return {
      insertId: result.rows?.[0]?.id || null,
      affectedRows: result.rowCount || 0,
      rows: result.rows,
    };
  }

  // UPDATE / DELETE
  if (/^\s*(UPDATE|DELETE)\b/i.test(originalSql)) {
    return {
      affectedRows: result.rowCount || 0,
      rows: result.rows,
    };
  }

  return result;
}

function query(sql, values, callback) {
  if (typeof values === "function") {
    callback = values;
    values = [];
  }

  const promise = run(sql, values);

  if (typeof callback === "function") {
    promise
      .then((result) => callback(null, result))
      .catch((err) => callback(err));

    return;
  }

  return promise;
}

// Test database connection
pool
  .connect()
  .then(() => {
    console.log("PostgreSQL Connected Successfully");
  })
  .catch((err) => {
    console.log("Database Connection Failed");
    console.log(err);
  });

// Export compatible query method
module.exports = {
  query,
};