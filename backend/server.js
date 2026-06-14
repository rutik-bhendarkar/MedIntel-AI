const express = require("express");
const cors = require("cors");
const path = require("path");

// Load environment from backend/.env when running the server from the repository root
require("dotenv").config({ path: path.join(__dirname, ".env") });

const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const reportRoutes = require("./routes/reportRoutes");

const app = express();

const allowedOrigins = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "https://medintel-ai.netlify.app"
];

function normalizeOrigin(o) {
  if (!o) return o;
  return String(o).trim().replace(/\/$/, "").toLowerCase();
}

const corsOptions = {
  origin(origin, callback) {
    const incoming = normalizeOrigin(origin);
    const allowed = allowedOrigins.map(normalizeOrigin);

    // debug log to help diagnose CORS origin mismatches
    // (safe to leave in; shows only origin and whether it's allowed)
    try {
      console.log(`[CORS-check] incoming='${incoming}' allowed=${allowed.join(",")}`);
    } catch (e) {}

    if (!incoming) {
      // no origin (e.g., curl, server-to-server) — allow
      callback(null, true);
      return;
    }

    if (allowed.includes(incoming)) {
      callback(null, true);
      return;
    }

    // Do not throw an error here — return false so CORS middleware does not
    // set CORS headers for disallowed origins. This avoids 500 responses for
    // preflight requests from unknown origins.
    callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin"],
  optionsSuccessStatus: 204,
  preflightContinue: false,
  credentials: false,
};

// Apply CORS middleware and ensure OPTIONS preflight is handled
app.use(cors(corsOptions));

// Debug log for auth routes to confirm CORS response headers
app.use((req, res, next) => {
  res.on("finish", () => {
    if (req.path && req.path.startsWith("/api/auth")) {
      console.log(`[CORS] ${req.method} ${req.path} Origin=${req.headers.origin} ACAO=${res.getHeader("Access-Control-Allow-Origin")}`);
    }
  });
  next();
});

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/report", reportRoutes);

app.get("/", (req, res) => {
  res.send("MedIntel AI Backend Running");
});

app.use((err, req, res, next) => {
  if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON request body",
    });
  }

  console.error("Unhandled server error:", err);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
