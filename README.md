# TrustVault – Secure Document Sharing with Real Audit Trail

TrustVault is a secure document-sharing web application that allows users to upload, manage, and share documents with authorized users. It provides access permissions and audit logs to improve document security and accountability.

## Features

- User registration and login.
- Password hashing using bcrypt.
- JWT-based authentication.
- Secure document uploads.
- Private document storage.
- Document ownership verification.
- Share documents with other registered users.
- Separate view and download permissions.
- SHA-256 document hashing.
- Audit logs recording document-related activities.
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
- JWT
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
│   ├── uploads/
│   ├── database.js
│   ├── schema.sql
│   └── server.js
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── THREATS.md
├── PROMPTS.md
├── README.md
└── .gitignore
```

## Setup and Installation

### Prerequisites

- Node.js and npm
- Python is not required for the current Node.js backend.
- Microsoft SQL Server
- Visual Studio Code

### 1. Clone the repository

```bash
git clone https://github.com/jagarlamudinandini6-source/Trustvault-secure-document-sharing.git
cd Trustvault-secure-document-sharing
```

### 2. Configure the database

1. Open SQL Server Management Studio.
2. Create a database named `TrustVaultDB`.
3. Execute `backend/schema.sql`.

### 3. Configure the backend

Navigate to the backend folder:

```bash
cd backend
npm install
```

Create a `.env` file inside `backend/` and configure the required database connection settings and a private JWT secret.

Do not commit `.env` or expose its contents.

### 4. Start the backend

```bash
npm run dev
```

### 5. Start the frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed by Vite in your browser.

## Security

TrustVault implements authentication, authorization, private file storage, and document activity logging.

For additional security details, see [THREATS.md](THREATS.md).

## AI Development Transparency

Development prompts, tool usage, issues, alternatives, and actual progress are documented in [PROMPTS.md](PROMPTS.md).

## Project Status

The application has implemented core authentication, document management, sharing permissions, and audit logging. Cloud deployment and additional production security hardening remain separate tasks.
    
## Author

Developed as part of the TrustVault project for the Snovasys assessment.
### Additional Security Enhancement – Automatic Session Timeout

I independently enhanced TrustVault by implementing an automatic session timeout feature.

- Users are automatically logged out after 15 minutes of inactivity.
- Active sessions are renewed when users interact with the application.
- Server-side session validation prevents expired or revoked sessions from accessing protected resources.
- Manual logout revokes the active session.

**Purpose:** To improve account security and reduce the risk of unauthorized access when users leave their accounts unattended.