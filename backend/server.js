const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const reportRoutes = require("./routes/reportRoutes");
const chatRoutes = require("./routes/chatRoutes");

const app = express();

// =====================================
// DATABASE CONNECTION
// =====================================
try {
    const db = mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "healthcare_ai_platform"
    });

    db.connect((err) => {
        if (err) {
            console.log("MySQL Connection Failed");
            console.log(err.message);
        } else {
            console.log("MySQL Connected Successfully");
        }
    });

    global.db = db;
} catch (error) {
    console.log("Database Setup Error");
    console.log(error.message);
}

// =====================================
// MIDDLEWARE
// =====================================
app.use(cors());
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
