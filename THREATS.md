# TrustVault – Security Threat Model

## 1. Introduction

TrustVault is a secure document-sharing platform intended to ensure that only authenticated and authorized users can access shared documents. It maintains audit logs for important document and account activities.

This document identifies important assets, trust boundaries, potential threats, implemented protections, and residual risks. It distinguishes controls present in the current application from improvements that are still recommended.

## 2. Important Assets

- User account credentials and password hashes
- JWTs and server-side session records
- Password reset tokens
- Uploaded documents and their SHA-256 hashes
- Document ownership and sharing permissions
- Audit logs
- Supabase PostgreSQL database records
- Private Supabase Storage objects
- Environment variables and application secrets
- Email delivery configuration and password reset links

## 3. Trust Boundaries

1. **Frontend:** Accepts user input and displays application data. Frontend checks are not a security boundary; authorization must be enforced by the backend.
2. **Backend API:** Authenticates users, validates sessions, enforces document ownership and permissions, and controls access to private storage.
3. **Database:** Supabase PostgreSQL stores user information, document metadata, permissions, sessions, password reset tokens, and audit records.
4. **Private file storage:** Supabase Storage stores uploaded documents in a private bucket. Access is mediated through authorized backend operations.
5. **Email service:** Resend delivers password reset messages. Reset links contain time-limited tokens and must be protected from disclosure.

## 4. Potential Security Threats

| Threat | Possible impact | Current protection / status |
|---|---|---|
| Unauthorized document access | Exposure of private documents | Authenticated API routes, ownership checks, and permission checks |
| Password theft or account compromise | Attacker gains access to a user's documents | Passwords are hashed using bcrypt; rate limiting and stronger account protections remain recommended |
| Stolen JWT | Unauthorized API requests while the token remains usable | JWT authentication plus server-side session validation and revocation; secure token storage and transport hardening remain important |
| Inactive session left open | Another person may use an unattended logged-in session | Server-side session expiry after 15 minutes of inactivity |
| Session not revoked on logout | A previously issued token may continue to be accepted | Logout endpoint revokes the server-side session; middleware checks session status |
| Password reset token theft | Attacker may reset another user's password | Reset tokens are hashed before database storage, expire after 15 minutes, and are single-use |
| Existing sessions remain active after password reset | Previously authenticated devices may continue accessing the account | All existing server-side sessions are revoked after a successful password reset |
| Unauthorized document download | Confidential files may be copied | Separate VIEW and DOWNLOAD permissions are enforced by backend routes |
| Unauthorized document deletion | A user's document may be removed | Delete operation checks document ownership; deletion is recorded in the audit log |
| Unauthorized permission changes | A recipient may gain or retain access without the owner's approval | Sharing and permission-management operations are restricted to the document owner |
| SQL injection | Database data may be read or modified | Parameterized PostgreSQL queries are used; continue reviewing every query and input path |
| Malicious or misleading file upload | Unsafe or unexpected files may be stored or served | Upload validation and restrictions are implemented; malware scanning and stronger file-signature validation remain future improvements |
| Unauthorized storage access | Private documents may be exposed | Supabase Storage bucket is private; backend authorization checks are essential |
| Audit-log tampering or loss | Reduced accountability or incomplete investigation | Application writes audit events for relevant actions; stronger tamper resistance and restricted database administration are still needed |
| Secret exposure | Database or signing secret compromise | Secrets are configured through environment variables and `.env` files are excluded by Git ignore rules |
| Browser or network interception | Credentials, tokens, or documents may be exposed in transit | HTTPS and secure deployment configuration are required before public production use |
| Cross-site scripting (XSS) | Attackers may execute scripts or access browser-held tokens | Input handling and frontend security require continued review; Content Security Policy and additional browser protections are recommended |

## 5. Implemented Security Controls

The current implementation includes:

### Authentication and Sessions

- Password hashing using bcrypt.
- JWT-based user authentication.
- Protected backend API endpoints.
- Server-side session records and session validation in authentication middleware.
- Automatic session expiry after 15 minutes of inactivity.
- Session revocation on manual logout.
- Session revocation after a successful password reset.

### Password Reset

- Cryptographically generated password reset tokens.
- SHA-256 hashing of reset tokens before database storage.
- Fifteen-minute token expiration.
- Single-use reset tokens.
- Password updates using bcrypt hashing.
- Existing session revocation after a successful password reset.
- Audit logging of successful password reset events.
- Generic responses for password reset requests to reduce account enumeration.

### Document Access and Storage

- Document ownership verification for owner-only operations.
- Separate document viewing and downloading permissions.
- Owner-only document deletion.
- Owner-only permission listing and recipient-access revocation.
- Private Supabase Storage bucket for uploaded documents.
- Backend-mediated document access.
- SHA-256 document hashing.
- File size restrictions and upload validation.
- Cache-control and content-type security headers for document responses.

### Database and Audit

- Supabase PostgreSQL database.
- Row Level Security enabled on the application tables.
- Parameterized database queries.
- Audit events for document access and permission-related activities, including access revocation and deletion.
- Audit events for successful password resets.
- Environment variables for sensitive configuration.
- Git ignore rules to prevent committing environment files and private uploads.

The frontend also reloads after a user-initiated manual logout. The security control is backend session revocation and validation, not the page reload itself.

## 6. Residual Risks and Future Improvements

The following improvements should be considered and tested before production deployment:

- Add login, password reset, and API rate limiting.
- Review JWT lifetime, signing-secret strength, and token storage. Browser session storage can be exposed by successful XSS attacks.
- Enforce HTTPS in deployed environments.
- Configure a restrictive Content Security Policy and review frontend input handling.
- Validate file extensions, MIME types, file signatures, and file sizes; consider malware scanning.
- Review Supabase Row Level Security policies and database-role privileges. Ensure the backend service credentials are never exposed to the frontend.
- Continue enforcing authorization in the backend before every private storage operation.
- Consider encryption at rest for uploaded documents and sensitive database information.
- Protect audit logs against modification or deletion, for example through restricted database permissions and an append-only or externally retained audit destination.
- Add automated tests for ownership checks, VIEW/DOWNLOAD permissions, deletion, permission revocation, password reset, and expired/revoked sessions.
- Add backup and recovery procedures for the database and uploaded files.
- Configure production CORS, secrets, database access, storage, monitoring, and error handling.
- Review whether soft-deleted document metadata and associated audit records are retained according to the intended retention policy.

## 7. Conclusion

TrustVault implements authentication, server-side session validation, secure password reset, document ownership checks, separate access permissions, private Supabase Storage, and audit logging to reduce the risk of unauthorized document access and changes.

The application still requires further testing and security hardening before production use. A threat model documents risks and controls; it is not a guarantee that every attack is prevented.
