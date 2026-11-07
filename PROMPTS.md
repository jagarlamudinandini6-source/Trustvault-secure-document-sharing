# TrustVault – AI Prompts and Development Log

This file documents the AI-assisted development process for TrustVault, including prompts, outputs, issues encountered, alternatives considered, and related Git commits.

## Entry 1 – 2026-11-04: Project Setup and Architecture

**Prompt:** What requirements are needed to build the TrustVault secure document-sharing platform, including frontend, backend, and database?

**Tool / AI Output:**
- Selected React and Vite for the frontend.
- Selected Node.js and Express.js for the backend.
- Selected Microsoft SQL Server for database storage.
- Planned separate backend routes, middleware, and database configuration.

**Issue encountered:** The development environment and project folder were not initially configured.

**Alternative / Resolution:** Installed and configured the development tools and created separate frontend and backend folders.

**Related commit:** [Initial TrustVault application](https://github.com/jagarlamudinandini6-source/Trustvault-secure-document-sharing/commit/b34e77c)

## Entry 2 – 2026-11-05: Authentication and Authorization

**Prompt:** Implement secure user registration and login, and protect backend APIs so that only authenticated users can access them.

**Tool / AI Output:**
- Implemented registration and login API routes.
- Used bcryptjs for password hashing.
- Implemented JWT token generation and verification.
- Added authentication middleware.

**Issue encountered:** Requests without a valid authentication token were rejected.

**Alternative / Resolution:** Used the Authorization Bearer token header for authenticated API requests and verified protected endpoint behaviour.

**Related commit:** [Initial TrustVault application](https://github.com/jagarlamudinandini6-source/Trustvault-secure-document-sharing/commit/b34e77c)

## Entry 3 – 2026-11-05: Document Access Control

**Prompt:** Ensure that another user cannot access an owner's private document without explicit permission. Implement separate view and download permissions.

**Tool / AI Output:**
- Implemented document ownership checks.
- Added document sharing permissions.
- Implemented separate view and download access checks.

**Issue encountered:** A second user initially received HTTP 403 when attempting to access an unshared document.

**Alternative / Resolution:** Granted explicit view permission and tested access again. Viewing succeeded with HTTP 200, while downloading remained denied with HTTP 403 because download permission had not been granted.

**Related commit:** [Initial TrustVault application](https://github.com/jagarlamudinandini6-source/Trustvault-secure-document-sharing/commit/b34e77c)

## Entry 4 – 2026-11-06: Audit Trail Implementation

**Prompt:** Implement a real audit trail that records who accessed a document and when, including denied access attempts.

**Tool / AI Output:**
- Created the AuditLogs database table.
- Added document-related audit events.
- Implemented an authenticated audit API endpoint.
- Connected activity logs to the frontend.

**Issue encountered:** Opening the protected audit API directly in a browser without an authentication token did not return the logs.

**Alternative / Resolution:** Tested the endpoint using an authenticated request with a valid Bearer token and verified the recorded activity.

**Related commit:** [Initial TrustVault application](https://github.com/jagarlamudinandini6-source/Trustvault-secure-document-sharing/commit/b34e77c)

## Entry 5 – 2026-11-07: Frontend Integration and Security Testing

**Prompt:** Integrate the frontend with the backend APIs and provide document upload, sharing, viewing, downloading, and activity log functionality.

**Tool / AI Output:**
- Integrated React frontend with Express APIs.
- Added document upload and listing.
- Added document-sharing interface.
- Added activity logs and logout functionality.
- Added private file response headers.

**Issue encountered:** DOCX files did not display as previews in the browser because browsers do not natively render DOCX documents.

**Alternative / Resolution:** Kept document downloading available; a dedicated DOCX preview component can be added as a future improvement.

**Related commit:** [Initial TrustVault application](https://github.com/jagarlamudinandini6-source/Trustvault-secure-document-sharing/commit/b34e77c)

## Development Transparency

- AI assistance was used for implementation guidance, debugging, and testing suggestions.
- Features and test outcomes are documented based on the actual development process.
- The related entries point to the real initial application commit because the core implementation was committed together.
- No separate or fabricated commit history is claimed.
- Additional improvements and deployment work will be documented as they are completed.
### 2026-11-07 – Document deletion, permission revocation, and logout improvements

**Prompt / Request:**  
Enhance TrustVault so document owners can delete uploaded documents and revoke previously granted VIEW or DOWNLOAD permissions. Also fix manual logout so the page reloads after logout.

**AI/tool output:**  
- Added owner-only document deletion.
- Added an API to list document permissions.
- Added an API to revoke a user's document access.
- Recorded document deletion and access revocation in audit logs.
- Updated manual logout handling to reload the page after a user clicks Logout.

**Issue encountered:**  
The manual logout page was not reloading. The Logout button passed a React click event to the logout handler, causing the reload condition to behave incorrectly.

**Alternative / Resolution:**  
Changed the button handler from `onClick={handleLogout}` to `onClick={() => handleLogout()}`. This allowed manual logout to work while preserving the automatic inactivity timeout behavior.

**Testing:**  
Verified document deletion, permission management, audit-log updates, and manual logout. Automatic 15-minute timeout had also been tested.

**Commit link:**  
https://github.com/jagarlamudinandini6-source/Trustvault-secure-document-sharing/commit/efcf77e09ed224192124ae84c3dad17c2d772c7f
