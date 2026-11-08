
USE TrustVaultDB;
GO

-- 1. USERS TABLE
IF OBJECT_ID('dbo.USERS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.USERS (
        UserId INT IDENTITY(1,1) PRIMARY KEY,
        FullName NVARCHAR(100) NOT NULL,
        Email NVARCHAR(255) NOT NULL UNIQUE,
        PasswordHash NVARCHAR(255) NOT NULL,
        Role VARCHAR(10) NOT NULL DEFAULT 'USER',
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

        CONSTRAINT CK_Users_Role
        CHECK (Role IN ('USER', 'ADMIN'))
    );
END;
GO

-- 2. DOCUMENTS TABLE
IF OBJECT_ID('dbo.DOCUMENTS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DOCUMENTS (
        DocumentId UNIQUEIDENTIFIER PRIMARY KEY
            DEFAULT NEWSEQUENTIALID(),

        OwnerId INT NOT NULL,
        OriginalFileName NVARCHAR(255) NOT NULL,
        StoredFileName NVARCHAR(255) NOT NULL UNIQUE,
        ContentType NVARCHAR(127),
        FileSize BIGINT NOT NULL,
        StorageKey NVARCHAR(500) NOT NULL,
        SHA256Hash CHAR(64),
        UploadedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        IsDeleted BIT NOT NULL DEFAULT 0,

        CONSTRAINT FK_Documents_Users
        FOREIGN KEY (OwnerId) REFERENCES dbo.Users(UserId),

        CONSTRAINT CK_Documents_FileSize
        CHECK (FileSize >= 0)
    );
END;
GO

-- 3. DOCUMENT PERMISSIONS TABLE
IF OBJECT_ID('dbo.DOCUMENTPERMISSIONS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DOCUMENTPERMISSIONS (
        PermissionId BIGINT IDENTITY(1,1) PRIMARY KEY,
        DocumentId UNIQUEIDENTIFIER NOT NULL,
        UserId INT NOT NULL,
        CanView BIT NOT NULL DEFAULT 1,
        CanDownload BIT NOT NULL DEFAULT 0,
        GrantedBy INT NOT NULL,
        GrantedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

        CONSTRAINT FK_Permissions_Documents
        FOREIGN KEY (DocumentId)
        REFERENCES dbo.Documents(DocumentId),

        CONSTRAINT FK_Permissions_Users
        FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),

        CONSTRAINT FK_Permissions_GrantedBy
        FOREIGN KEY (GrantedBy) REFERENCES dbo.Users(UserId),

        CONSTRAINT UQ_Document_User
        UNIQUE (DocumentId, UserId),

        CONSTRAINT CK_Permissions_Download
        CHECK (CanDownload = 0 OR CanView = 1)
    );
END;
GO

-- 4. AUDIT LOGS TABLE
IF OBJECT_ID('dbo.AUDITLOGS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AUDITLOGS (
        AuditId BIGINT IDENTITY(1,1) PRIMARY KEY,
        UserId INT NULL,
        DocumentId UNIQUEIDENTIFIER NULL,
        Action VARCHAR(40) NOT NULL,
        Outcome VARCHAR(10) NOT NULL DEFAULT 'SUCCESS',
        Details NVARCHAR(1000),
        IpAddress VARCHAR(45),
        UserAgent NVARCHAR(512),
        OccurredAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

        CONSTRAINT FK_AuditLogs_Users
        FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),

        CONSTRAINT FK_AuditLogs_Documents
        FOREIGN KEY (DocumentId)
        REFERENCES dbo.Documents(DocumentId),

        CONSTRAINT CK_AuditLogs_Outcome
        CHECK (Outcome IN ('SUCCESS', 'DENIED', 'FAILED'))
    );
END;
GO

-- CREATE INDEXES
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Documents_OwnerId'
      AND object_id = OBJECT_ID('dbo.DOCUMENTS')
)
    CREATE INDEX IX_Documents_OwnerId
    ON dbo.Documents(OwnerId);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Permissions_UserId'
      AND object_id = OBJECT_ID('dbo.DOCUMENTPERMISSIONS')
)
    CREATE INDEX IX_Permissions_UserId
    ON dbo.DocumentPermissions(UserId);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_AuditLogs_DocumentId'
      AND object_id = OBJECT_ID('dbo.AUDITLOGS')
)
    CREATE INDEX IX_AuditLogs_DocumentId
    ON dbo.AuditLogs(DocumentId, OccurredAt);
GO


-- 5. SERVER-SIDE LOGIN SESSIONS
-- Safe to run again: existing tables and data are not replaced.
IF OBJECT_ID('dbo.Sessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Sessions (
        SessionId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        UserId INT NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        LastActivityAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        ExpiresAt DATETIME2 NOT NULL,
        RevokedAt DATETIME2 NULL,
        IpAddress VARCHAR(45) NULL,
        UserAgent NVARCHAR(512) NULL,

        CONSTRAINT FK_Sessions_Users
        FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Sessions_UserId_ExpiresAt'
      AND object_id = OBJECT_ID('dbo.Sessions')
)
BEGIN
    CREATE INDEX IX_Sessions_UserId_ExpiresAt
    ON dbo.Sessions(UserId, ExpiresAt);
END;
GO

-- VERIFY TABLES
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
GO
