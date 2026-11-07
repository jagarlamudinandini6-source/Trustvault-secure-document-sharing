# TrustVault – Security Threat Model

## 1. Introduction

TrustVault is a secure document-sharing platform designed to ensure that only authorized users can access shared documents. It also maintains audit logs to record document-related activities.

This document identifies potential security threats and describes the protections implemented or planned.

## 2. Important Assets

- User account credentials
- Authentication tokens
- Uploaded documents
- Document ownership and sharing permissions
- Audit logs
- Database records
- Environment variables and application secrets

## 3. Trust Boundaries

TrustVault contains the following trust boundaries:

1. **Frontend:** Accepts user input and displays document information.
2. **Backend API:** Authenticates users and enforces document permissions.
3. **Database:** Stores user information, document metadata, permissions, and audit logs.
4. **Private file storage:** Stores uploaded documents outside the public frontend directory.

## 4. Potential Security Threats

| Threat | Possible impact | Protection |
|---|---|---|
| Unauthorized document access | Private documents exposed | JWT authentication and permission checks |
| Password theft | Account compromise | Password hashing using bcrypt |
| Token theft | Unauthorized API access | JWT-based authentication; secure token handling should be strengthened |
| Unauthorized document downloads | Confidential files leaked | Separate view and download permissions |
| SQL injection | Database compromise | Parameterized database queries |
| Malicious file uploads | Unsafe files stored | File upload validation and restrictions should be reviewed |
| Audit log tampering | Loss of activity accountability | Restrict audit access to authenticated users; stronger tamper protection is planned |
| Secret exposure | Database or account compromise | Environment variables and Git ignore rules |

## 5. Implemented Security Controls

The current implementation includes:

- Password hashing using bcrypt.
- JWT-based user authentication.
- Protected API endpoints.
- Document ownership verification.
- Separate document viewing and downloading permissions.
- Private document upload storage.
- SHA-256 document hashing.
- Audit events for document access and permission-related activities.
- Cache-control and content-type security headers for document responses.
- Environment variables for sensitive configuration.
- Git ignore rules to prevent uploading environment files and private uploads.

## 6. Residual Risks and Future Improvements

The following improvements should be considered before production deployment:

- Add login rate limiting.
- Strengthen JWT storage and token expiration handling.
- Validate file types, file sizes, and potentially scan uploads for malware.
- Encrypt stored documents and sensitive database information.
- Protect audit logs against modification or deletion.
- Add HTTPS and secure deployment configuration.
- Add automated security and authorization tests.
- Implement backup and recovery procedures.

## 7. Conclusion

TrustVault uses authentication, authorization, private document storage, and audit logging to reduce the risk of unauthorized document access.

Security is an ongoing process. Additional testing and hardening are required before production use.