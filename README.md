# TrustVault – Secure Document Sharing with Real Audit Trail

TrustVault is a secure document-sharing web application that allows registered users to upload, manage, and share documents with authorized users. It enforces document ownership and separate viewing and downloading permissions, and records important document activities in audit logs.

## Features

### Accounts and sessions
- User registration and login.
- Password hashing using bcrypt.
- JWT-based authentication with server-side session validation.
- Automatic logout after 15 minutes of inactivity.
- Manual logout revokes the active server-side session.

### Document management and sharing
- Authenticated document uploads to private backend storage.
- Document ownership verification.
- Share documents with other registered users.
- Separate VIEW and DOWNLOAD permissions.
- Owners can view the permissions granted for their documents.
- Owners can revoke a recipient's document access.
- Owners can delete their own documents.
- SHA-256 document hashing.
- Audit events for document access, permission changes/revocation, and deletion.
- Protected backend API routes.

## Technology Stack

**Frontend**
- React
- Vite
- HTML
- CSS
- JavaScript

**Backend**
- Node.js
- Express.js
- JSON Web Tokens (JWT)
- bcryptjs
- Multer

**Database**
- Microsoft SQL Server

## Project Structure

```text
TrustVault/
├── backend/
│   ├── middleware/
│   ├── routes/
│   ├── uploads/          # Private uploaded files; not committed
│   ├── database.js
│   ├── schema.sql
│   └── server.js
├── frontend/
│   ├── src/
│   └── package.json
├── THREATS.md
├── PROMPTS.md
├── README.md
└── .gitignore
```

## Setup and Installation

### Prerequisites

- Node.js and npm
- Microsoft SQL Server
- SQL Server Management Studio (SSMS)
- Visual Studio Code

Python is not required for the current Node.js backend.

### 1. Clone the repository

```bash
git clone https://github.com/jagarlamudinandini6-source/Trustvault-secure-document-sharing.git
cd Trustvault-secure-document-sharing
```

### 2. Configure the database

1. Open SQL Server Management Studio.
2. Create a database named `TrustVaultDB`.
3. Execute `backend/schema.sql` against that database.

The schema script defines the database tables used by the application. The database connection settings must match your local SQL Server installation.

### 3. Configure the backend

```bash
cd backend
npm install
```

Create a `.env` file inside `backend/` with the database connection settings expected by `backend/database.js` and a private JWT secret. Use your own local SQL Server configuration; do not copy another developer's credentials or secrets.

Do not commit `.env` or expose its contents.

### 4. Start the backend

From the `backend` folder, run the development command configured in `backend/package.json`:

```bash
npm run dev
```

### 5. Start the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed by Vite in your browser. Keep the backend and database running while using the application.

## Main API Routes

The API is protected by authentication where required. The exact request bodies and response formats are defined in the backend route files.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register an account |
| POST | `/api/auth/login` | Log in and create a session |
| POST | `/api/auth/logout` | Revoke the current session |
| GET/POST | `/api/auth/activity` | Session activity handling, as implemented by the authentication routes |
| POST | `/api/documents/upload` | Upload a document |
| GET | `/api/documents` | List documents available to the authenticated user |
| POST | `/api/documents/:id/share` | Share a document and grant permissions |
| GET | `/api/documents/:id/permissions` | List permissions for an owned document |
| DELETE | `/api/documents/:id/permissions/:userId` | Revoke a recipient's access to an owned document |
| DELETE | `/api/documents/:id` | Delete an owned document |
| GET | `/api/documents/:id/view` | View a document when permitted |
| GET | `/api/documents/:id/download` | Download a document when permitted |
| GET | `/api/documents/audit` | Retrieve audit information for the authenticated user, subject to route authorization |

Check `backend/routes/auth.js` and `backend/routes/documents.js` for the current route definitions and authorization behavior.

## Security

TrustVault includes:
- Password hashing with bcrypt.
- JWT authentication and server-side session checks.
- A 15-minute inactivity timeout and server-side session revocation on logout.
- Owner checks for document management operations.
- Separate view and download permission checks.
- Private upload storage outside the public frontend directory.
- SHA-256 document hashing.
- Audit logging for document-related activities, including access, permission revocation, and deletion.
- Cache-control and content-type security headers on document responses.
- Environment variables for sensitive configuration and Git ignore rules for `.env` files and private uploads.

These controls reduce common risks but do not by themselves establish production-grade security. See [THREATS.md](THREATS.md) for implemented controls, residual risks, and recommended hardening.

## AI Development Transparency

Development prompts, tool usage, issues, alternatives, and progress are documented in [PROMPTS.md](PROMPTS.md).

## Project Status

The application has implemented core authentication, session handling, document upload and management, sharing permissions, and audit logging. The project is currently documented for local development. Cloud deployment, production infrastructure, and additional security hardening remain outstanding and must be completed and tested before the application is presented as a live production service.

## Author

Developed as part of the TrustVault project for the Snovasys assessment.
