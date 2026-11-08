# TrustVault – Secure Document Sharing with Real Audit Trail

TrustVault is a secure document-sharing web application that allows registered users to upload, manage, and share documents with authorized users. It enforces document ownership and separate viewing and downloading permissions while maintaining audit logs of important activities.

## Features

### Accounts and Sessions
- User registration and login.
- Password hashing using bcrypt.
- JWT-based authentication with server-side session validation.
- Automatic logout after 15 minutes of inactivity.
- Manual logout revokes the active server-side session.
- Secure password reset using time-limited email tokens.
- Existing sessions are revoked after a successful password reset.

### Document Management and Sharing
- Authenticated document uploads.
- Private document storage using Supabase Storage.
- Document ownership verification.
- Share documents with registered users.
- Separate VIEW and DOWNLOAD permissions.
- Owners can view granted permissions.
- Owners can revoke document access.
- Owners can delete their own documents.
- SHA-256 document hashing.
- Upload progress indicator.
- Automatic document-list synchronization.

### Audit Trail
- Records document access activities.
- Records permission changes and revocation.
- Records document deletion.
- Records successful password resets.
- Stores user, action, outcome, and timestamp information.

## Technology Stack

### Frontend
- React
- Vite
- HTML
- CSS
- JavaScript

### Backend
- Node.js
- Express.js
- JSON Web Tokens (JWT)
- bcryptjs
- Multer
- Supabase JavaScript client

### Database and Storage
- Supabase PostgreSQL
- Supabase Storage (private bucket)
- PostgreSQL connection pooling using `pg`

### Email
- Resend for password reset emails

## Project Structure

```text
TrustVault/
├── backend/
│   ├── middleware/
│   ├── routes/
│   ├── uploads/              # Temporary/local upload directory if used
│   ├── database.js
│   ├── server.js
│   ├── schema_backup.sql     # Legacy SQL Server schema backup
│   ├── package.json
│   └── .env                  # Private configuration; not committed
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── THREATS.md
├── PROMPTS.md
├── README.md
└── .gitignore
```

## Setup and Installation

### Prerequisites

- Node.js and npm
- Supabase account and project
- Resend account and API key for password reset emails
- Visual Studio Code
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/jagarlamudinandini6-source/Trustvault-secure-document-sharing.git
cd Trustvault-secure-document-sharing
```

### 2. Configure Supabase

1. Create a Supabase project.
2. Configure the PostgreSQL database.
3. Create the application tables:
   - `users`
   - `documents`
   - `document_permissions`
   - `audit_logs`
   - `sessions`
   - `password_reset_tokens`
4. Enable Row Level Security on the application tables.
5. Create a Storage bucket named `trustvault-documents`.
6. Keep the Storage bucket private. Do not enable public access.
7. Obtain the database connection string and required Supabase project credentials.

**Important:** `backend/schema_backup.sql` is a legacy SQL Server backup. It is not the PostgreSQL setup script and should not be executed in Supabase.

### 3. Configure the Backend

Open a terminal:

```bash
cd backend
npm install
```

Create a `.env` file inside the `backend` directory.

Configure the following environment variables using your own credentials:

```env
DATABASE_URL=your_supabase_postgresql_connection_string
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_private_supabase_server_key
JWT_SECRET=your_private_jwt_secret
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=your_verified_sender_email
FRONTEND_URL=http://localhost:5173
```

Use the appropriate private Supabase server key expected by the backend configuration. Never expose this key in frontend code.

Do not commit `.env` or share its contents publicly.

### 4. Start the Backend

From the `backend` directory, run:

```bash
node server.js
```

The backend runs on port 5000 by default.

### 5. Configure and Start the Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

If required, configure the frontend API URL using a `VITE_API_URL` environment variable.

Open the local URL displayed by Vite, usually:

```text
http://localhost:5173
```

Keep the backend and Supabase database accessible while using the application.

## Main API Routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register an account |
| POST | `/api/auth/login` | Log in and create a session |
| POST | `/api/auth/logout` | Revoke the current session |
| POST | `/api/auth/forgot-password` | Request a password reset email |
| POST | `/api/auth/reset-password` | Reset the password using a valid token |
| POST | `/api/documents/upload` | Upload a document |
| GET | `/api/documents` | List accessible documents |
| POST | `/api/documents/:id/share` | Share a document |
| GET | `/api/documents/:id/permissions` | List permissions for an owned document |
| DELETE | `/api/documents/:id/permissions/:userId` | Revoke recipient access |
| DELETE | `/api/documents/:id` | Delete an owned document |
| GET | `/api/documents/:id/view` | View a document when permitted |
| GET | `/api/documents/:id/download` | Download a document when permitted |
| GET | `/api/documents/audit` | Retrieve audit information |

Protected routes require valid authentication and authorization.

Refer to `backend/routes/auth.js` and `backend/routes/documents.js` for the exact implementation.

## Security

TrustVault implements the following security measures:

- Password hashing using bcrypt.
- JWT authentication with server-side session validation.
- Fifteen-minute inactivity timeout.
- Session revocation on logout and successful password reset.
- Time-limited, single-use password reset tokens.
- Document ownership verification.
- Separate VIEW and DOWNLOAD permission checks.
- Private Supabase Storage.
- SHA-256 document hashing.
- Audit logging of important security and document activities.
- Environment variables for sensitive configuration.
- Git ignore rules for private configuration and local uploads.

These controls reduce common application security risks but do not independently guarantee production-grade security. See [THREATS.md](THREATS.md) for implemented controls, residual risks, and recommended hardening.

## AI Development Transparency

Development prompts, AI tool usage, issues, alternatives, and implementation progress are documented in [PROMPTS.md](PROMPTS.md).

## Project Status

Core application functionality has been implemented, including authentication, password reset, session management, document upload, private storage, document sharing, permission management, and audit logging.

The application has been tested in a local development environment. Cloud deployment, production configuration, and further security hardening remain to be completed and verified.

## Author

Developed as part of the TrustVault project for the Snovasys assessment.
