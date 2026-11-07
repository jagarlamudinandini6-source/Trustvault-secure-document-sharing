const jwt = require("jsonwebtoken");
const { sql, getPool } = require("../database");

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

    // Refresh the server-side idle expiry only while the previous session
    // is still active. An expired or revoked session cannot be revived.
    const result = await pool.request()
      .input("SessionId", sql.UniqueIdentifier, decoded.sessionId)
      .input("UserId", sql.Int, decoded.userId)
      .query(`
        UPDATE dbo.Sessions
        SET LastActivityAt = SYSUTCDATETIME(),
            ExpiresAt = DATEADD(MINUTE, 15, SYSUTCDATETIME())
        OUTPUT INSERTED.SessionId
        WHERE SessionId = @SessionId
          AND UserId = @UserId
          AND RevokedAt IS NULL
          AND ExpiresAt > SYSUTCDATETIME()
      `);

    if (!result.recordset || result.recordset.length === 0) {
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
