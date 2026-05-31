const express = require("express");
const cors = require("cors");
const { Pool } = require("pg"); // 🟢 Changed from mysql2 to pg
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const reportRoutes = require("./routes/reportRoutes");
const chatRoutes = require("./routes/chatRoutes");

const app = express();

// =====================================
// DATABASE CONNECTION (PostgreSQL)
// =====================================
try {
    // Uses the single DATABASE_URL string you added to .env / Render
    const db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
    });

    // Verify connection
    db.query("SELECT NOW()", (err, res) => {
        if (err) {
            console.log("PostgreSQL Connection Failed ❌");
            console.log(err.message);
        } else {
            console.log("PostgreSQL Connected Successfully 🚀");
        }
    });

    // 🟢 Keeps your global mapping so your routes don't break!
    global.db = db;
    
} catch (error) {
    console.log("Database Setup Error");
    console.log(error.message);
}

// =====================================
// MIDDLEWARE
// =====================================
app.use(cors({
    origin: "https://medintel-app.onrender.com", // Your live frontend URL
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
})); // Allows your frontend to communicate without security blockages
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================================
// STATIC FOLDERS
// =====================================
app.use("/uploads", express.static("uploads"));
app.use("/report_outputs", express.static("report_outputs"));

// =====================================
// ROOT ROUTES
// =====================================
app.get("/", (req, res) => {
    res.send("MedIntel AI Backend Running");
});

app.get("/health", (req, res) => {
    res.json({
        success: true,
        status: "ok",
        service: "MedIntel AI Backend"
    });
});

// =====================================
// API ROUTES
// =====================================
app.use("/api/auth", authRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/chat", chatRoutes);

// =====================================
// 404 HANDLER
// =====================================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route Not Found"
    });
});

// =====================================
// ERROR HANDLER
// =====================================
app.use((error, req, res, next) => {
    console.log("Server Error:");
    console.log(error);

    res.status(500).json({
        success: false,
        message: "Internal Server Error"
    });
});

// =====================================
// SERVER
// =====================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});