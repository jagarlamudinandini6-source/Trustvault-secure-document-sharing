
const jwt = require("jsonwebtoken");
const { getPool } = require("../database");

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Authentication token required."
    });
  }

  const token = authHeader.slice(7).trim();
  let decoded;

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing.");
    }

    decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (
      !Number.isInteger(decoded.userId) ||
      typeof decoded.sessionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded.sessionId)
    ) {
      throw new Error("Invalid token payload.");
    }
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token."
    });
  }

  try {
    const pool = await getPool();

    // Refresh the session only if it is still active.
    const result = await pool.query(
      `UPDATE sessions
       SET last_activity_at = NOW(),
           expires_at = NOW() + INTERVAL '15 minutes'
       WHERE session_id = $1
         AND user_id = $2
         AND revoked_at IS NULL
         AND expires_at > NOW()
       RETURNING session_id`,
      [decoded.sessionId, decoded.userId]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: "Your session has expired or has been logged out. Please log in again."
      });
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      sessionId: decoded.sessionId
    };

    return next();

  } catch (error) {
    console.error("Authentication session check error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify your session. Please try again."
    });
  }
}

module.exports = authenticateToken;
