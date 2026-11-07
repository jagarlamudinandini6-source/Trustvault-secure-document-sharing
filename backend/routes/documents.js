
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");

const { sql, getPool } = require("../database");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Every document API requires authentication.
router.use(authenticateToken);

// Allowed document types
const allowedTypes = {
  ".pdf": ["application/pdf"],
  ".doc": ["application/msword"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ],
  ".txt": ["text/plain"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"]
};

// Store documents using random filenames.
const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, UPLOAD_DIR);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    callback(null, crypto.randomUUID() + extension);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },

  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const validMimes = allowedTypes[extension];

    if (!validMimes || !validMimes.includes(file.mimetype)) {
      return callback(
        new Error("Unsupported file type. Upload an allowed document format.")
      );
    }

    callback(null, true);
  }
});

// Write an audit record.
async function writeAudit(
  request,
  req,
  documentId,
  action,
  outcome,
  details
) {
  return request
    .input("UserId", sql.Int, req.user.userId)
    .input("DocumentId", sql.UniqueIdentifier, documentId)
    .input("Action", sql.VarChar(40), action)
    .input("Outcome", sql.VarChar(10), outcome)
    .input("Details", sql.NVarChar(1000), details)
    .input("IpAddress", sql.VarChar(45), req.ip || null)
    .input(
      "UserAgent",
      sql.NVarChar(512),
      req.get("user-agent")?.slice(0, 512) || null
    )
    .query(`
      INSERT INTO dbo.AuditLogs
      (UserId, DocumentId, Action, Outcome, Details, IpAddress, UserAgent)
      VALUES
      (@UserId, @DocumentId, @Action, @Outcome, @Details, @IpAddress, @UserAgent)
    `);
}

// Upload a document.
router.post("/upload", upload.single("document"), async (req, res) => {
  let uploadedFilePath;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a document."
      });
    }

    uploadedFilePath = req.file.path;

    const pool = await getPool();

    const fileBuffer = await fs.readFile(req.file.path);
    const hash = crypto
      .createHash("sha256")
      .update(fileBuffer)
      .digest("hex");

    const storedFileName = req.file.filename;
    const originalFileName = path.basename(req.file.originalname).slice(0, 255);
    const storageKey = `uploads/${storedFileName}`;

    // Save document and audit record in one SQL transaction.
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const insertRequest = new sql.Request(transaction);

      const result = await insertRequest
        .input("OwnerId", sql.Int, req.user.userId)
        .input("OriginalFileName", sql.NVarChar(255), originalFileName)
        .input("StoredFileName", sql.NVarChar(255), storedFileName)
        .input("ContentType", sql.NVarChar(127), req.file.mimetype)
        .input("FileSize", sql.BigInt, req.file.size)
        .input("StorageKey", sql.NVarChar(500), storageKey)
        .input("SHA256Hash", sql.Char(64), hash)
        .query(`
          INSERT INTO dbo.Documents
          (
            OwnerId,
            OriginalFileName,
            StoredFileName,
            ContentType,
            FileSize,
            StorageKey,
            SHA256Hash
          )
          OUTPUT
            INSERTED.DocumentId,
            INSERTED.OriginalFileName,
            INSERTED.FileSize,
            INSERTED.UploadedAt
          VALUES
          (
            @OwnerId,
            @OriginalFileName,
            @StoredFileName,
            @ContentType,
            @FileSize,
            @StorageKey,
            @SHA256Hash
          )
        `);

      const document = result.recordset[0];

      const auditRequest = new sql.Request(transaction);

      await writeAudit(
        auditRequest,
        req,
        document.DocumentId,
        "DOCUMENT_UPLOADED",
        "SUCCESS",
        "Document uploaded successfully."
      );

      await transaction.commit();

      return res.status(201).json({
        success: true,
        message: "Document uploaded successfully.",
        document
      });

    } catch (error) {
      await transaction.rollback().catch(() => {});
      throw error;
    }

  } catch (error) {
    if (uploadedFilePath) {
      await fs.unlink(uploadedFilePath).catch(() => {});
    }

    console.error("Document upload error:", error);

    return res.status(500).json({
      success: false,
      message: "Document upload failed."
    });
  }
});

// List documents owned by the user or shared with view permission.
router.get("/", async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.request()
      .input("UserId", sql.Int, req.user.userId)
      .query(`
        SELECT
          d.DocumentId,
          d.OriginalFileName,
          d.ContentType,
          d.FileSize,
          d.UploadedAt,
          d.OwnerId
        FROM dbo.Documents d
        WHERE d.IsDeleted = 0
          AND (
            d.OwnerId = @UserId
            OR EXISTS (
              SELECT 1
              FROM dbo.DocumentPermissions p
              WHERE p.DocumentId = d.DocumentId
                AND p.UserId = @UserId
                AND p.CanView = 1
            )
          )
        ORDER BY d.UploadedAt DESC
      `);

    return res.json({
      success: true,
      documents: result.recordset
    });

  } catch (error) {
    console.error("Document list error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve documents."
    });
  }
});

// Open a document after checking view permission.
router.get("/:id/view", async (req, res) => {
  await serveDocument(req, res, false);
});

// Download a document after checking download permission.
router.get("/:id/download", async (req, res) => {
  await serveDocument(req, res, true);
});

// Shared access-checking function.
async function serveDocument(req, res, download) {
  try {
    const documentId = req.params.id;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID."
      });
    }

    const pool = await getPool();

    const documentResult = await pool.request()
      .input("DocumentId", sql.UniqueIdentifier, documentId)
      .query(`
        SELECT *
        FROM dbo.Documents
        WHERE DocumentId = @DocumentId
          AND IsDeleted = 0
      `);

    const document = documentResult.recordset[0];

    if (!document) {
      await writeAudit(
        pool.request(),
        req,
        null,
        download ? "DOCUMENT_DOWNLOAD" : "DOCUMENT_VIEW",
        "DENIED",
        `Requested document not found: ${documentId}`
      );

      return res.status(404).json({
        success: false,
        message: "Document not found."
      });
    }
    // Owners can always view and download their own documents.
    // Other users need explicit permissions.
    // Supply the download flag as a SQL parameter.
    // This separate request avoids relying on client-provided permission values.
    const permissionCheck = await pool.request()
      .input("DocumentId", sql.UniqueIdentifier, documentId)
      .input("UserId", sql.Int, req.user.userId)
      .input("Download", sql.Bit, download)
      .query(`
        SELECT CASE
          WHEN d.OwnerId = @UserId THEN 1
          WHEN p.CanView = 1
               AND (@Download = 0 OR p.CanDownload = 1) THEN 1
          ELSE 0
        END AS IsAllowed
        FROM dbo.Documents d
        LEFT JOIN dbo.DocumentPermissions p
          ON p.DocumentId = d.DocumentId
          AND p.UserId = @UserId
        WHERE d.DocumentId = @DocumentId
      `);

    const isAllowed =
      permissionCheck.recordset.length > 0 &&
      permissionCheck.recordset[0].IsAllowed === 1;

    if (!isAllowed) {
      await writeAudit(
        pool.request(),
        req,
        document.DocumentId,
        download ? "DOCUMENT_DOWNLOAD" : "DOCUMENT_VIEW",
        "DENIED",
        "User attempted to access a document without sufficient permission."
      );

      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission."
      });
    }

    await writeAudit(
      pool.request(),
      req,
      document.DocumentId,
      download ? "DOCUMENT_DOWNLOADED" : "DOCUMENT_VIEWED",
      "SUCCESS",
      download
        ? "Document downloaded successfully."
        : "Document viewed successfully."
    );

    // Never use a client-provided file path.
    const filePath = path.resolve(
      UPLOAD_DIR,
      path.basename(document.StoredFileName)
    );

    if (!filePath.startsWith(UPLOAD_DIR + path.sep)) {
      return res.status(403).json({
        success: false,
        message: "Invalid document storage location."
      });
    }

    await fs.access(filePath);

// Security headers to prevent caching of confidential documents
res.setHeader(
  "Cache-Control",
  "private, no-store, no-cache, must-revalidate"
);

res.setHeader("Pragma", "no-cache");

res.setHeader("X-Content-Type-Options", "nosniff");

if (download) {
  return res.download(filePath, document.OriginalFileName);
}

res.setHeader(
  "Content-Type",
  document.ContentType || "application/octet-stream"
);

res.setHeader(
  "Content-Disposition",
  `inline; filename*=UTF-8''${encodeURIComponent(document.OriginalFileName)}`
);

return res.sendFile(filePath);


    res.setHeader(
      "Content-Type",
      document.ContentType || "application/octet-stream"
    );

    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(document.OriginalFileName)}`
    );

    return res.sendFile(filePath);

  } catch (error) {
    console.error("Document access error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Unable to access this document."
      });
    }
  }
}

// Handle upload validation errors.
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;

    return res.status(status).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Maximum file size is 10 MB."
          : error.message
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Invalid document upload."
    });
  }

  next();
});

// SHARE DOCUMENT WITH ANOTHER USER
router.post("/:id/share", async (req, res) => {
  try {
    const documentId = req.params.id;
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const canView =
      req.body.canView === undefined ? true : req.body.canView;

    const canDownload =
      req.body.canDownload === undefined
        ? false
        : req.body.canDownload;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID."
      });
    }

    if (
      !email ||
      email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid recipient email."
      });
    }

    if (
      typeof canView !== "boolean" ||
      typeof canDownload !== "boolean" ||
      (canDownload && !canView)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid document permissions."
      });
    }

    const pool = await getPool();

    // Check document ownership.
    const documentResult = await pool.request()
      .input("DocumentId", sql.UniqueIdentifier, documentId)
      .query(`
        SELECT DocumentId, OwnerId
        FROM dbo.Documents
        WHERE DocumentId = @DocumentId
          AND IsDeleted = 0
      `);

    const document = documentResult.recordset[0];

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found."
      });
    }

    // Only the document owner can share it.
    if (document.OwnerId !== req.user.userId) {
      await writeAudit(
        pool.request(),
        req,
        documentId,
        "DOCUMENT_SHARE",
        "DENIED",
        "Unauthorized attempt to share a document."
      );

      return res.status(403).json({
        success: false,
        message: "Only the document owner can share it."
      });
    }

    // Find the recipient.
    const userResult = await pool.request()
      .input("Email", sql.NVarChar(255), email)
      .query(`
        SELECT UserId, Email
        FROM dbo.Users
        WHERE Email = @Email
          AND IsActive = 1
      `);

    const recipient = userResult.recordset[0];

    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: "Recipient account not found."
      });
    }

    if (recipient.UserId === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: "You already own this document."
      });
    }

    // Save permission and audit record together.
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      await new sql.Request(transaction)
        .input("DocumentId", sql.UniqueIdentifier, documentId)
        .input("TargetUserId", sql.Int, recipient.UserId)
        .input("GrantedBy", sql.Int, req.user.userId)
        .input("CanView", sql.Bit, canView)
        .input("CanDownload", sql.Bit, canDownload)
        .query(`
          UPDATE dbo.DocumentPermissions
          SET
            CanView = @CanView,
            CanDownload = @CanDownload,
            GrantedBy = @GrantedBy,
            GrantedAt = SYSUTCDATETIME()
          WHERE DocumentId = @DocumentId
            AND UserId = @TargetUserId;

          IF @@ROWCOUNT = 0
          BEGIN
            INSERT INTO dbo.DocumentPermissions
            (
              DocumentId,
              UserId,
              CanView,
              CanDownload,
              GrantedBy
            )
            VALUES
            (
              @DocumentId,
              @TargetUserId,
              @CanView,
              @CanDownload,
              @GrantedBy
            );
          END
        `);

      await writeAudit(
        new sql.Request(transaction),
        req,
        documentId,
        "DOCUMENT_SHARED",
        "SUCCESS",
        `Shared with ${email}. View: ${canView}; Download: ${canDownload}.`
      );

      await transaction.commit();

      return res.json({
        success: true,
        message: "Document shared successfully.",
        recipient: email,
        permissions: {
          canView,
          canDownload
        }
      });

    } catch (error) {
      await transaction.rollback().catch(() => {});
      throw error;
    }

  } catch (error) {
    console.error("Document sharing error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to share document."
    });
  }
});


// GET ACTIVITY LOGS FOR THE LOGGED-IN USER
router.get("/audit", async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.request()
      .input("UserId", sql.Int, req.user.userId)
      .query(`
        SELECT TOP (100)
          a.AuditId,
          a.UserId,
          u.FullName AS UserName,
          u.Email AS UserEmail,
          a.DocumentId,
          d.OriginalFileName,
          a.Action,
          a.Outcome,
          a.Details,
          a.OccurredAt
        FROM dbo.AuditLogs a
        LEFT JOIN dbo.Users u
          ON a.UserId = u.UserId
        LEFT JOIN dbo.Documents d
          ON a.DocumentId = d.DocumentId
        WHERE
          a.UserId = @UserId
          OR d.OwnerId = @UserId
        ORDER BY a.OccurredAt DESC, a.AuditId DESC
      `);

    res.json({
      success: true,
      logs: result.recordset
    });

  } catch (error) {
    console.error("Audit logs error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve activity logs."
    });
  }
});


module.exports = router;
