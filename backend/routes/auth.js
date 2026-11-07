
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sql, getPool } = require("../database");

const router = express.Router();

// Generate authentication token
function generateToken(user) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing from .env");
  }

  return jwt.sign(
    {
      userId: user.UserId,
      email: user.Email,
      role: user.Role
    },
    secret,
    { expiresIn: "1h" }
  );
}

// USER REGISTRATION
router.post("/register", async (req, res) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;

    if (!fullName || !email || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Full name, email and password are required."
      });
    }

    if (fullName.length > 100 || email.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Full name or email is too long."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address."
      });
    }

    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters and no more than 72 bytes."
      });
    }

    const pool = await getPool();

    const existingUser = await pool.request()
      .input("Email", sql.NVarChar(255), email)
      .query(`
        SELECT UserId
        FROM dbo.Users
        WHERE Email = @Email
      `);

    if (existingUser.recordset.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.request()
      .input("FullName", sql.NVarChar(100), fullName)
      .input("Email", sql.NVarChar(255), email)
      .input("PasswordHash", sql.NVarChar(255), passwordHash)
      .query(`
        INSERT INTO dbo.USERS
          (FullName, Email, PasswordHash)
        OUTPUT
          INSERTED.UserId,
          INSERTED.FullName,
          INSERTED.Email,
          INSERTED.Role
        VALUES
          (@FullName, @Email, @PasswordHash)
      `);

    const user = result.recordset[0];
    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user: {
        userId: user.UserId,
        fullName: user.FullName,
        email: user.Email,
        role: user.Role
  }
    });

  } catch (error) {
    console.error("Registration error:", error);

    if (error.number === 2601 || error.number === 2627) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    return res.status(500).json({
      success: false,
      message: "Registration failed. Check the backend logs."
    });
  }
});

// USER LOGIN
router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;

    if (!email || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Email and password are required."
      });
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("Email", sql.NVarChar(255), email)
      .query(`
        SELECT UserId, FullName, Email, PasswordHash, Role, IsActive
        FROM dbo.Users
        WHERE Email = @Email
      `);

    const user = result.recordset[0];

    if (!user || !user.IsActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.PasswordHash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const token = generateToken(user);

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        userId: user.UserId,
        fullName: user.FullName,
        email: user.Email,
        role: user.Role
      }
    });

  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed. Check the backend logs."
    });
  }
});

module.exports = router;
