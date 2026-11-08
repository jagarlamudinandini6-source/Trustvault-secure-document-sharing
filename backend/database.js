require("dotenv").config();

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing from backend environment variables.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Supabase PostgreSQL requires an encrypted connection.
  ssl: {
    rejectUnauthorized: false
  },

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

let connectionPromise;

async function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!connectionPromise) {
    connectionPromise = pool.query("SELECT 1")
      .then(() => {
        console.log("Supabase PostgreSQL connected successfully!");
        return pool;
      })
      .catch((error) => {
        connectionPromise = null;
        throw error;
      });
  }

  return connectionPromise;
}

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

module.exports = { pool, getPool };