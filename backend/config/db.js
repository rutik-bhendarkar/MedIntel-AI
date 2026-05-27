const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect((err) => {

    if (err) {

        console.log("Database Connection Failed");
        console.log(err);

    } else {

        console.log("PostgreSQL Connected Successfully");

    }

});

module.exports = pool;