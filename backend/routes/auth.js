const { Resend } = require("resend");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { getPool } = require("../database");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const RESET_TOKEN_EXPIRY_MINUTES = 15;

const IDLE_TIMEOUT_MINUTES = 15;
const JWT_MAX_LIFETIME = "12h";

// Create a server-side session and return its signed token.
async function createSession(user, req) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing from .env");
  }

  const sessionId = crypto.randomUUID();
  const pool = await getPool();

  await pool.query(
    `INSERT INTO sessions
      (session_id, user_id, last_activity_at, expires_at, ip_address, user_agent)
     VALUES
      ($1, $2, NOW(), NOW() + INTERVAL '${IDLE_TIMEOUT_MINUTES} minutes', $3, $4)`,
    [
      sessionId,
      user.user_id,
      String(req.ip || "").slice(0, 45),
      String(req.get("user-agent") || "").slice(0, 512)
    ]
  );

  return jwt.sign(
    {
      userId: user.user_id,
      email: user.email,
      role: user.role,
      sessionId
    },
    secret,
    { expiresIn: JWT_MAX_LIFETIME }
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

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING user_id, full_name, email, role`,
      [fullName, email, passwordHash]
    );

    const user = result.rows[0];
    const token = await createSession(user, req);

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user: {
        userId: user.user_id,
        fullName: user.full_name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error("Registration error:", error);

    if (error.code === "23505") {
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

    const result = await pool.query(
      `SELECT user_id, full_name, email, password_hash, role, is_active
       FROM users
       WHERE email = $1`,
      [email]
    );

    const user = result.rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const token = await createSession(user, req);

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        userId: user.user_id,
        fullName: user.full_name,
        email: user.email,
        role: user.role
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

// Revoke the current server-side session on logout.
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();

    await pool.query(
      `UPDATE sessions
       SET revoked_at = NOW()
       WHERE session_id = $1
         AND user_id = $2
         AND revoked_at IS NULL`,
      [req.user.sessionId, req.user.userId]
    );

    return res.json({
      success: true,
      message: "You have been logged out successfully."
    });

  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      success: false,
      message: "Logout could not be confirmed by the server."
    });
  }
});

// The authentication middleware refreshes the session activity.
router.post("/activity", authenticateToken, (req, res) => {
  return res.json({
    success: true,
    message: "Session activity updated."
  });
});

// --------------------------------------------------
// FORGOT PASSWORD - SEND RESET EMAIL
// --------------------------------------------------

router.post("/forgot-password", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address."
    });
  }

  if (!resend || !process.env.FRONTEND_URL ||
      !process.env.RESEND_FROM_EMAIL) {
    return res.status(503).json({
      success: false,
      message: "Password reset email service is not configured."
    });
  }

  let client;
  let resetId;

  try {
    const pool = await getPool();

    const userResult = await pool.query(
      `SELECT user_id, email
       FROM users
       WHERE email = $1 AND is_active = TRUE`,
      [email]
    );

    // Always return the same response for unknown email addresses.
    if (userResult.rowCount === 0) {
      return res.json({
        success: true,
        message: "If an account exists with this email, a password reset link will be sent."
      });
    }

    const user = userResult.rows[0];

    // Generate a cryptographically secure, one-time token.
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Store only the SHA-256 hash in the database.
    const tokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    client = await pool.connect();
    await client.query("BEGIN");

    // Invalidate previous unused reset links for this user.
    await client.query(
      `DELETE FROM password_reset_tokens
       WHERE user_id = $1`,
      [user.user_id]
    );

    const tokenResult = await client.query(
      `INSERT INTO password_reset_tokens
        (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${RESET_TOKEN_EXPIRY_MINUTES} minutes')
       RETURNING reset_id`,
      [user.user_id, tokenHash]
    );

    resetId = tokenResult.rows[0].reset_id;

    await client.query("COMMIT");

    client.release();
    client = null;

    const frontendUrl = process.env.FRONTEND_URL.replace(/\/+$/, "");
    const resetLink =
      `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

    const emailResult = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: user.email,
      subject: "Reset your TrustVault password",
      text:
        `We received a request to reset your TrustVault password.\n\n` +
        `Open this link to create a new password:\n${resetLink}\n\n` +
        `This link expires in ${RESET_TOKEN_EXPIRY_MINUTES} minutes.\n` +
        `If you did not request this, you can ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <h2>TrustVault Password Reset</h2>
          <p>We received a request to reset your TrustVault password.</p>
          <p>
            <a href="${resetLink}"
               style="background:#2563eb;color:white;padding:12px 20px;
               text-decoration:none;border-radius:6px;display:inline-block">
              Reset Password
            </a>
          </p>
          <p>This link expires in ${RESET_TOKEN_EXPIRY_MINUTES} minutes.</p>
          <p>If you did not request this, you can safely ignore this email.</p>
        </div>
      `
    });

    if (emailResult.error) {
      throw emailResult.error;
    }

    return res.json({
      success: true,
      message: "If an account exists with this email, a password reset link will be sent."
    });

  } catch (error) {
    console.error("Forgot password error:", error);

    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Forgot password rollback error:", rollbackError);
      }
    }

    if (resetId) {
      try {
        const pool = await getPool();
        await pool.query(
          `DELETE FROM password_reset_tokens
           WHERE reset_id = $1`,
          [resetId]
        );
      } catch (cleanupError) {
        console.error("Reset token cleanup error:", cleanupError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Unable to process the password reset request. Please try again."
    });

  } finally {
    if (client) client.release();
  }
});


// --------------------------------------------------
// RESET PASSWORD - VERIFY TOKEN AND UPDATE PASSWORD
// --------------------------------------------------

router.post("/reset-password", async (req, res) => {
  const resetToken = String(req.body.token || "");
  const newPassword = req.body.newPassword;

  if (
    !/^[a-f0-9]{64}$/i.test(resetToken) ||
    typeof newPassword !== "string" ||
    newPassword.length < 8 ||
    Buffer.byteLength(newPassword, "utf8") > 72
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide a valid reset token and a password of at least 8 characters and no more than 72 bytes."
    });
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  let client;

  try {
    const pool = await getPool();
    client = await pool.connect();

    await client.query("BEGIN");

    // Lock the token row to prevent simultaneous reuse.
    const tokenResult = await client.query(
      `SELECT reset_id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );

    if (tokenResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "This password reset link is invalid, expired or already used."
      });
    }

    const resetRecord = tokenResult.rows[0];

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await client.query(
      `UPDATE users
       SET password_hash = $1
       WHERE user_id = $2`,
      [passwordHash, resetRecord.user_id]
    );

    // Revoke every active session for this user.
    await client.query(
      `UPDATE sessions
       SET revoked_at = NOW()
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [resetRecord.user_id]
    );

    // Mark this token as used.
    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE reset_id = $1`,
      [resetRecord.reset_id]
    );

    // Invalidate all remaining reset tokens for this user.
    await client.query(
      `DELETE FROM password_reset_tokens
       WHERE user_id = $1
         AND reset_id <> $2`,
      [resetRecord.user_id, resetRecord.reset_id]
    );

    // Record the successful password reset in the audit log.
await client.query(
  `INSERT INTO audit_logs
    (user_id, document_id, action, outcome, details, ip_address, user_agent, occurred_at)
   VALUES ($1, NULL, $2, $3, $4, $5, $6, NOW())`,
  [
    resetRecord.user_id,
    "PASSWORD_RESET",
    "SUCCESS",
    "Password successfully reset; all existing sessions revoked.",
    String(req.ip || "").slice(0, 45),
    String(req.get("user-agent") || "").slice(0, 512)
  ]
);

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Password reset successfully. Please log in with your new password."
    });

  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Password reset rollback error:", rollbackError);
      }
    }

    console.error("Reset password error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to reset password. Please try again."
    });

  } finally {
    if (client) client.release();
  }
});

module.exports = router;
