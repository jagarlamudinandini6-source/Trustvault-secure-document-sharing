const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const { getPool } = require("../database");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

const BUCKET_NAME = "trustvault-documents";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".txt", ".png", ".jpg", ".jpeg"
]);

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/png",
  "image/jpeg"
]);

let storageClient;

function getStorage() {
  if (!process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase Storage environment variables are missing.");
  }

  if (!storageClient) {
    storageClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  return storageClient;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension) ||
        !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return callback(
        new Error("This file type is not allowed.")
      );
    }

    callback(null, true);
  }
});

function isValidUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeFileName(value) {
  return path.basename(String(value || "document"))
    .replace(/[\r\n"]/g, "_");
}

function contentDisposition(fileName, mode) {
  const safeName = safeFileName(fileName);
  const fallbackName = safeName.replace(/[^\x20-\x7E]/g, "_");

  return `${mode}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

async function writeAudit(
  db,
  req,
  documentId,
  action,
  outcome = "SUCCESS",
  details = ""
) {
  await db.query(
    `INSERT INTO audit_logs
      (user_id, document_id, action, outcome, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      req.user?.userId || null,
      documentId || null,
      action,
      outcome,
      String(details).slice(0, 1000),
      String(req.ip || "").slice(0, 45),
      String(req.get("user-agent") || "").slice(0, 512)
    ]
  );
}

router.use(authenticateToken);

// --------------------------------------------------
// UPLOAD DOCUMENT
// --------------------------------------------------

router.post(
  "/upload",
  (req, res, next) => {
    upload.single("file")(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.code === "LIMIT_FILE_SIZE"
            ? "File size must not exceed 10 MB."
            : error.message
        });
      }

      next();
    });
  },
  async (req, res) => {
    let storageKey;
    let storageUploaded = false;
    let client;

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please select a file to upload."
        });
      }

      const pool = await getPool();
      const extension = path.extname(req.file.originalname).toLowerCase();
      const storedFileName = `${crypto.randomUUID()}${extension}`;

      storageKey = `${req.user.userId}/${storedFileName}`;

      const sha256Hash = crypto
        .createHash("sha256")
        .update(req.file.buffer)
        .digest("hex");

      const originalFileName = safeFileName(req.file.originalname);

      console.time("TrustVault storage upload");
      const { error: storageError } = await getStorage()
        .storage
        .from(BUCKET_NAME)
        .upload(storageKey, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });
      console.timeEnd("TrustVault storage upload");
      if (storageError) {
        throw storageError;
      }

      storageUploaded = true;

      client = await pool.connect();
      await client.query("BEGIN");

      const result = await client.query(
        `INSERT INTO documents
          (owner_id, original_file_name, stored_file_name,
           content_type, file_size, storage_key, sha256_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING
           document_id AS "DocumentId",
           original_file_name AS "OriginalFileName",
           file_size AS "FileSize",
           uploaded_at AS "UploadedAt"`,
        [
          req.user.userId,
          originalFileName,
          storedFileName,
          req.file.mimetype,
          req.file.size,
          storageKey,
          sha256Hash
        ]
      );

      const document = result.rows[0];

      await writeAudit(
        client,
        req,
        document.DocumentId,
        "UPLOAD",
        "SUCCESS",
        `Uploaded ${originalFileName}`
      );

      console.time("TrustVault database save and audit");
      console.timeEnd("TrustVault database save and audit");
      await client.query("COMMIT");

      return res.status(201).json({
        success: true,
        message: "Document uploaded successfully.",
        document
      });

    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Upload rollback error:", rollbackError);
        }
      }

      if (storageUploaded && storageKey) {
        try {
          await getStorage()
            .storage
            .from(BUCKET_NAME)
            .remove([storageKey]);
        } catch (cleanupError) {
          console.error("Storage cleanup error:", cleanupError);
        }
      }

      console.error("Document upload error:", error);

      return res.status(500).json({
        success: false,
        message: "Document upload failed. Check the backend logs."
      });

    } finally {
      if (client) client.release();
    }
  }
);

// --------------------------------------------------
// LIST OWNED AND SHARED DOCUMENTS
// --------------------------------------------------

router.get("/", async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.query(
      `SELECT DISTINCT
         d.document_id AS "DocumentId",
         d.original_file_name AS "OriginalFileName",
         d.content_type AS "ContentType",
         d.file_size AS "FileSize",
         d.uploaded_at AS "UploadedAt",
         d.owner_id AS "OwnerId"
       FROM documents d
       LEFT JOIN document_permissions p
         ON p.document_id = d.document_id
        AND p.user_id = $1
       WHERE d.is_deleted = FALSE
         AND (
           d.owner_id = $1
           OR p.can_view = TRUE
         )
       ORDER BY d.uploaded_at DESC`,
      [req.user.userId]
    );

    return res.json({
      success: true,
      documents: result.rows
    });

  } catch (error) {
    console.error("List documents error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve documents."
    });
  }
});

// --------------------------------------------------
// VIEW OR DOWNLOAD DOCUMENT
// --------------------------------------------------

async function serveDocument(req, res, mode) {
  const documentId = req.params.id;

  if (!isValidUuid(documentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid document ID."
    });
  }

  try {
    const pool = await getPool();

    const result = await pool.query(
      `SELECT
         d.document_id,
         d.owner_id,
         d.original_file_name,
         d.content_type,
         d.storage_key,
         d.is_deleted,
         (
           d.owner_id = $2
           OR (
             p.can_view = TRUE
             AND ($3 = FALSE OR p.can_download = TRUE)
           )
         ) AS is_allowed
       FROM documents d
       LEFT JOIN document_permissions p
         ON p.document_id = d.document_id
        AND p.user_id = $2
       WHERE d.document_id = $1`,
      [documentId, req.user.userId, mode === "download"]
    );

    const document = result.rows[0];

    if (!document || document.is_deleted || !document.is_allowed) {
      await writeAudit(
        pool,
        req,
        document ? document.document_id : null,
        mode.toUpperCase(),
        "DENIED",
        "Document access denied."
      );

      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this document."
      });
    }

    const { data, error } = await getStorage()
      .storage
      .from(BUCKET_NAME)
      .download(document.storage_key);

    if (error) {
      throw error;
    }

    const fileBuffer = Buffer.from(await data.arrayBuffer());

    await writeAudit(
      pool,
      req,
      document.document_id,
      mode.toUpperCase(),
      "SUCCESS",
      `${mode === "view" ? "Viewed" : "Downloaded"} ${document.original_file_name}`
    );

    res.setHeader(
      "Content-Type",
      document.content_type || "application/octet-stream"
    );
    res.setHeader(
      "Content-Disposition",
      contentDisposition(
        document.original_file_name,
        mode === "view" ? "inline" : "attachment"
      )
    );
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");

    return res.send(fileBuffer);

  } catch (error) {
    console.error(`Document ${mode} error:`, error);

    return res.status(500).json({
      success: false,
      message: `Unable to ${mode} this document.`
    });
  }
}

router.get("/:id/view", (req, res) => {
  return serveDocument(req, res, "view");
});

router.get("/:id/download", (req, res) => {
  return serveDocument(req, res, "download");
});

// --------------------------------------------------
// SHARE DOCUMENT WITH ANOTHER USER
// --------------------------------------------------


router.post("/:id/share", async (req, res) => {
  const documentId = req.params.id;
  const recipientEmail = String(req.body.email || "").trim().toLowerCase();

  const canView = req.body.canView !== false;
  const canDownload = req.body.canDownload === true;

  if (
    !isValidUuid(documentId) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid document ID and recipient email are required."
    });
  }

  if (canDownload && !canView) {
    return res.status(400).json({
      success: false,
      message: "Download permission requires view permission."
    });
  }

  let client;

  try {
    const pool = await getPool();
    client = await pool.connect();

    await client.query("BEGIN");

    const documentResult = await client.query(
      `SELECT document_id
       FROM documents
       WHERE document_id = $1
         AND owner_id = $2
         AND is_deleted = FALSE`,
      [documentId, req.user.userId]
    );

    if (documentResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Document not found or you are not the owner."
      });
    }

    const userResult = await client.query(
      `SELECT user_id, email
       FROM users
       WHERE email = $1
         AND is_active = TRUE`,
      [recipientEmail]
    );

    if (userResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Recipient account was not found or is inactive."
      });
    }

    const recipientId = userResult.rows[0].user_id;

    if (recipientId === req.user.userId) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "You cannot share a document with yourself."
      });
    }

    await client.query(
      `INSERT INTO document_permissions
        (document_id, user_id, can_view, can_download, granted_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (document_id, user_id)
       DO UPDATE SET
         can_view = EXCLUDED.can_view,
         can_download = EXCLUDED.can_download,
         granted_by = EXCLUDED.granted_by,
         granted_at = NOW()`,
      [
        documentId,
        recipientId,
        canView,
        canDownload,
        req.user.userId
      ]
    );

    await writeAudit(
      client,
      req,
      documentId,
      "SHARE",
      "SUCCESS",
      `Shared with ${recipientEmail}; view=${canView}; download=${canDownload}`
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Document permissions updated successfully."
    });

  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Share rollback error:", rollbackError);
      }
    }

    console.error("Share document error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to share this document."
    });

  } finally {
    if (client) client.release();
  }
});


// --------------------------------------------------
// DELETE DOCUMENT (OWNER ONLY)
// --------------------------------------------------

router.delete("/:id", async (req, res) => {
  const documentId = req.params.id;

  if (!isValidUuid(documentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid document ID."
    });
  }

  let client;
  let storageKey;

  try {
    const pool = await getPool();
    client = await pool.connect();

    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE documents
       SET is_deleted = TRUE
       WHERE document_id = $1
         AND owner_id = $2
         AND is_deleted = FALSE
       RETURNING storage_key, original_file_name`,
      [documentId, req.user.userId]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Document not found or you are not the owner."
      });
    }

    storageKey = result.rows[0].storage_key;

    await client.query(
      `DELETE FROM document_permissions
       WHERE document_id = $1`,
      [documentId]
    );

    await writeAudit(
      client,
      req,
      documentId,
      "DELETE",
      "SUCCESS",
      `Deleted ${result.rows[0].original_file_name}`
    );

    await client.query("COMMIT");

    const { error: storageError } = await getStorage()
      .storage
      .from(BUCKET_NAME)
      .remove([storageKey]);

    if (storageError) {
      console.error("Deleted document storage cleanup error:", storageError);
    }

    return res.json({
      success: true,
      message: "Document deleted successfully."
    });

  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Delete rollback error:", rollbackError);
      }
    }

    console.error("Delete document error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete this document."
    });

  } finally {
    if (client) client.release();
  }
});

// --------------------------------------------------
// LIST DOCUMENT PERMISSIONS (OWNER ONLY)
// --------------------------------------------------

router.get("/:id/permissions", async (req, res) => {
  const documentId = req.params.id;

  if (!isValidUuid(documentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid document ID."
    });
  }

  try {
    const pool = await getPool();

    const ownerResult = await pool.query(
      `SELECT document_id
       FROM documents
       WHERE document_id = $1
         AND owner_id = $2
         AND is_deleted = FALSE`,
      [documentId, req.user.userId]
    );

    if (ownerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Document not found or you are not the owner."
      });
    }

    const result = await pool.query(
      `SELECT
         u.user_id AS "UserId",
         u.full_name AS "FullName",
         u.email AS "Email",
         p.can_view AS "CanView",
         p.can_download AS "CanDownload",
         p.granted_at AS "GrantedAt"
       FROM document_permissions p
       JOIN users u ON u.user_id = p.user_id
       WHERE p.document_id = $1
       ORDER BY p.granted_at DESC`,
      [documentId]
    );

    return res.json({
      success: true,
      permissions: result.rows
    });

  } catch (error) {
    console.error("List permissions error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve document permissions."
    });
  }
});

// --------------------------------------------------
// REVOKE DOCUMENT PERMISSION (OWNER ONLY)
// --------------------------------------------------

router.delete("/:id/permissions/:userId", async (req, res) => {
  const documentId = req.params.id;
  const recipientId = Number(req.params.userId);

  if (!isValidUuid(documentId) ||
      !Number.isInteger(recipientId) ||
      recipientId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid document or user ID."
    });
  }

  let client;

  try {
    const pool = await getPool();
    client = await pool.connect();

    await client.query("BEGIN");

    const ownerResult = await client.query(
      `SELECT document_id
       FROM documents
       WHERE document_id = $1
         AND owner_id = $2
         AND is_deleted = FALSE`,
      [documentId, req.user.userId]
    );

    if (ownerResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Document not found or you are not the owner."
      });
    }

    const deleteResult = await client.query(
      `DELETE FROM document_permissions
       WHERE document_id = $1
         AND user_id = $2`,
      [documentId, recipientId]
    );

    if (deleteResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Permission was not found."
      });
    }

    await writeAudit(
      client,
      req,
      documentId,
      "REVOKE_PERMISSION",
      "SUCCESS",
      `Revoked permission for user ${recipientId}`
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Document permission revoked successfully."
    });

  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Revoke rollback error:", rollbackError);
      }
    }

    console.error("Revoke permission error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to revoke document permission."
    });

  } finally {
    if (client) client.release();
  }
});

// --------------------------------------------------
// AUDIT LOGS
// --------------------------------------------------

router.get("/audit", async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.query(
      `SELECT
         a.audit_id AS "AuditId",
         a.user_id AS "UserId",
         u.full_name AS "UserName",
         u.email AS "UserEmail",
         a.document_id AS "DocumentId",
         d.original_file_name AS "OriginalFileName",
         a.action AS "Action",
         a.outcome AS "Outcome",
         a.details AS "Details",
         a.occurred_at AS "OccurredAt"
       FROM audit_logs a
       LEFT JOIN users u ON u.user_id = a.user_id
       LEFT JOIN documents d ON d.document_id = a.document_id
       WHERE
         a.user_id = $1
         OR d.owner_id = $1
       ORDER BY a.occurred_at DESC
       LIMIT 100`,
      [req.user.userId]
    );

    return res.json({
      success: true,
      logs: result.rows
    });

  } catch (error) {
    console.error("Audit logs error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve audit logs."
    });
  }
});

module.exports = router;