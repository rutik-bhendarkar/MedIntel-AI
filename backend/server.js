const express = require("express");
const cors = require("cors");
require("dotenv").config();


global.db = db;

const authRoutes = require("./routes/authRoutes");
const reportRoutes = require("./routes/reportRoutes");
app.use("/api/auth", authRoutes);
const chatRoutes = require("./routes/chatRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static folders
app.use("/uploads", express.static("uploads"));
app.use("/report_outputs", express.static("report_outputs"));

// Root
app.get("/", (req, res) => {
  res.send("MedIntel AI Backend Running");
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    service: "MedIntel AI Backend",
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/chat", chatRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route Not Found",
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.log("Server Error:");
  console.log(error);

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});