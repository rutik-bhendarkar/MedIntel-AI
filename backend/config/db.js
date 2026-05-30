const { Pool } = require('pg');
require('dotenv').config();

// Create a connection pool that adapts to local development or production
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Simple helper: convert MySQL-style `?` placeholders to Postgres `$1,$2...`
function mapPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => {
    i += 1;
    return `$${i}`;
  });
}

// Compatibility wrapper to support existing callback-style `db.query(sql, params, cb)`
async function internalQuery(text, params = []) {
  const sql = String(text || "");
  const mapped = mapPlaceholders(sql);

  // If INSERT without RETURNING, add RETURNING id so callers expecting insertId work
  let finalSql = mapped;
  if (/^\s*INSERT\s+/i.test(mapped) && !/RETURNING\s+/i.test(mapped)) {
    finalSql = `${mapped} RETURNING id`;
  }

  const clientResult = await pool.query(finalSql, params);

  // Normalize result to mimic mysql driver's shape in minimal ways
  const normalized = {
    rows: clientResult.rows,
    affectedRows: clientResult.rowCount,
    rowCount: clientResult.rowCount,
  };

  if (clientResult.rows && clientResult.rows[0] && (clientResult.rows[0].id !== undefined)) {
    normalized.insertId = clientResult.rows[0].id;
  }

  return normalized;
}

function query(text, params = [], callback) {
  // allow query(sql, cb)
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  if (typeof callback === 'function') {
    internalQuery(text, params)
      .then((res) => callback(null, res))
      .catch((err) => {
        // Map Postgres unique_violation to MySQL-like ER_DUP_ENTRY for compatibility
        if (err && err.code === '23505') {
          err.code = 'ER_DUP_ENTRY';
        }
        callback(err);
      });
    return;
  }

  // Promise style
  return internalQuery(text, params).catch((err) => {
    if (err && err.code === '23505') {
      err.code = 'ER_DUP_ENTRY';
    }
    throw err;
  });
}

// Test the connection
pool.query('SELECT NOW()', (err) => {
  if (!err) {
    console.log('PostgreSQL Connected Successfully');
  } else {
    console.error('PostgreSQL Connection Error:', err);
  }
});

module.exports = { query, pool };