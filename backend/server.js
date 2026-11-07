const documentRoutes = require("./routes/documents");
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const authenticateToken = require("./middleware/auth");

require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: "http://localhost:5173"
}));

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);

// Home route
app.get("/", (req, res) => {
  res.send("Welcome to TrustVault Backend API!");
});

// Health check API
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "TrustVault backend is running successfully!",
    status: "OK"
  });
});

const { getPool } = require("./database");

app.get("/api/db-check", async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT DB_NAME() AS databaseName,
             @@SERVERNAME AS serverName
    `);

    res.json({
      success: true,
      message: "TrustVault database connected successfully!",
      database: result.recordset[0].databaseName,
      server: result.recordset[0].serverName
    });

  } catch (error) {
    console.error("Database connection error:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message
    });
  }
});

app.get("/api/protected-check", authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: "Authentication verified. Protected access granted.",
    user: req.user
  });
});
// Start server
app.listen(PORT, () => {
  console.log(`TrustVault backend running at http://localhost:${PORT}`);
});
