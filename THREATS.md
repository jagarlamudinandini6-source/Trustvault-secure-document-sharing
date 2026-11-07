# TrustVault – Security Threat Model

## 1. Introduction

TrustVault is a document-sharing platform intended to ensure that only authenticated and authorized users can access shared documents. It maintains audit logs for document-related activities.

This document identifies important assets, trust boundaries, potential threats, implemented protections, and residual risks. It distinguishes controls present in the current application from improvements that are still recommended.

## 2. Important Assets

- User account credentials
- JWTs and server-side session records
- Uploaded documents and their file hashes
- Document ownership and sharing permissions
- Audit logs
- Database records
- Environment variables and application secrets

## 3. Trust Boundaries

1. **Frontend:** Accepts user input and displays application data. Frontend checks are not a security boundary; authorization must be enforced by the backend.
2. **Backend API:** Authenticates users, validates sessions, and enforces document ownership and permission checks.
3. **Database:** Stores user information, document metadata, permissions, sessions, and audit records.
4. **Private file storage:** Stores uploaded documents outside the public frontend directory. Access should occur through authorized backend routes.

## 4. Potential Security Threats

| Threat | Possible impact | Current protection / status |
|---|---|---|
| Unauthorized document access | Exposure of private documents | Authenticated API routes, ownership checks, and permission checks |
| Password theft or account compromise | Attacker gains access to a user's documents | Passwords are hashed using bcrypt; rate limiting and stronger account protections remain recommended |
| Stolen JWT | Unauthorized API requests while the token remains usable | JWT authentication plus server-side session validation and revocation; secure token storage and transport hardening remain important |
| Inactive session left open | Another person may use an unattended logged-in session | Frontend inactivity handling and server-side session expiry after 15 minutes |
| Session not revoked on logout | A previously issued token may continue to be accepted | Logout endpoint revokes the server-side session; middleware checks session status |
| Unauthorized document download | Confidential files may be copied | Separate VIEW and DOWNLOAD permissions are enforced by backend routes |
| Unauthorized document deletion | A user's document may be removed | Delete operation checks document ownership; deletion is recorded in the audit log |
| Unauthorized permission changes | A recipient may gain or retain access without the owner's approval | Sharing and permission-management operations are restricted to the document owner; owners can revoke recipient access |
| SQL injection | Database data may be read or modified | Parameterized database queries are used; continue reviewing every query and input path |
| Malicious or misleading file upload | Unsafe or unexpected files may be stored or served | Upload validation/restrictions should be reviewed and strengthened; malware scanning is a future improvement |
| Audit-log tampering or loss | Reduced accountability or incomplete investigation | Application writes audit events for relevant actions; stronger tamper resistance and restricted database administration are still needed |
| Secret exposure | Database or signing secret compromise | Secrets are configured through environment variables and `.env` files are excluded by Git ignore rules |
| Browser or network interception | Credentials, tokens, or documents may be exposed in transit | HTTPS and secure deployment configuration are required before public production use |

## 5. Implemented Security Controls

The current implementation includes:

- Password hashing using bcrypt.
- JWT-based user authentication.
- Protected API endpoints.
- Server-side session records and session validation in authentication middleware.
- Automatic session expiry after 15 minutes of inactivity.
- Session revocation on manual logout.
- Document ownership verification for owner-only operations.
- Separate document viewing and downloading permissions.
- Owner-only document deletion.
- Owner-only permission listing and recipient-access revocation.
- Private document upload storage.
- SHA-256 document hashing.
- Audit events for document access and permission-related activities, including access revocation and deletion.
- Cache-control and content-type security headers for document responses.
- Environment variables for sensitive configuration.
- Git ignore rules to prevent committing environment files and private uploads.

The frontend also reloads after a user-initiated manual logout. The security control is the backend session revocation and validation, not the page reload itself.

## 6. Residual Risks and Future Improvements

The following improvements should be considered and tested before production deployment:

- Add login and API rate limiting.
- Review JWT lifetime, signing-secret strength, and token storage. Prefer secure transport and appropriately protected cookies or other hardened token handling.
- Enforce HTTPS in deployed environments.
- Validate file extensions, MIME types, file signatures, and file sizes; consider malware scanning.
- Consider encryption at rest for uploaded documents and sensitive database information.
- Protect audit logs against modification or deletion, for example through restricted database permissions and an append-only or externally retained audit destination.
- Add automated tests for ownership checks, VIEW/DOWNLOAD permissions, deletion, permission revocation, and expired/revoked sessions.
- Add backup and recovery procedures for the database and uploaded files.
- Configure production CORS, secrets, database access, storage, monitoring, and error handling.
- Review whether soft-deleted document metadata and associated audit records are retained according to the intended retention policy.

## 7. Conclusion

TrustVault implements authentication, server-side session validation, document ownership checks, separate access permissions, private document storage, and audit logging to reduce the risk of unauthorized document access and changes.

The application still requires further testing and security hardening before production use. A threat model documents risks and controls; it is not a guarantee that every attack is prevented.
