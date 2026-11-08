
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const documentRoutes = require("./routes/documents");
const authenticateToken = require("./middleware/auth");
const { getPool } = require("./database");

const app = express();
const PORT = process.env.PORT || 5000;

// Allow local frontend and the configured deployment frontend.
const allowedOrigins = (
  process.env.FRONTEND_URL || "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed by CORS."));
  }
}));

app.use(express.json({ limit: "1mb" }));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);

// Home route
app.get("/", (req, res) => {
  res.send("Welcome to TrustVault Backend API!");
});

// Backend health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "TrustVault backend is running successfully!",
    status: "OK"
  });
});

// Supabase PostgreSQL database check
app.get("/api/db-check", async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.query(`
      SELECT
        current_database() AS "databaseName",
        current_user AS "databaseUser"
    `);

    res.json({
      success: true,
      message: "TrustVault PostgreSQL database connected successfully!",
      database: result.rows[0].databaseName,
      databaseUser: result.rows[0].databaseUser
    });

  } catch (error) {
    console.error("Database connection error:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed."
    });
  }
});

// Protected route
app.get("/api/protected-check", authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: "Authentication verified. Protected access granted.",
    user: req.user
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`TrustVault backend running on port ${PORT}`);
});
