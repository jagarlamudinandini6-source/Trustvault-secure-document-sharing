import { useRef, useState } from "react";
import "./App.css";

const menuItems = [
  { name: "Dashboard", icon: "▦" },
  { name: "My Documents", icon: "▤" },
  { name: "Upload Documents", icon: "↑" },
  { name: "Activity Logs", icon: "◷" },
  { name: "Settings", icon: "⚙" },
];

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  // Authentication and page state
  const [isRegister, setIsRegister] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [passwordPlaceholder, setPasswordPlaceholder] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Dashboard state
  const [activePage, setActivePage] = useState("Dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [documents, setDocuments] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Load documents visible to the currently authenticated user.
  const loadDocuments = async (token) => {
    if (!token) {
      throw new Error("Please log in again.");
    }

    const response = await fetch("http://127.0.0.1:5000/api/documents", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Unable to load documents.");
    }

    const formattedDocuments = (data.documents || []).map((doc) => ({
      id: doc.DocumentId,
      name: doc.OriginalFileName,
      ownerId: doc.OwnerId,
      type: doc.OriginalFileName?.includes(".")
        ? doc.OriginalFileName.split(".").pop().toUpperCase()
        : "FILE",
      size: formatSize(Number(doc.FileSize)),
      date: doc.UploadedAt
        ? new Date(doc.UploadedAt).toLocaleDateString()
        : "",
      status: "Stored",
    }));

    setDocuments(formattedDocuments);
    return formattedDocuments;
  };

  // Load audit records available to the current user.
  const loadAuditLogs = async (token) => {
    if (!token) {
      setAuditError("Please log in again.");
      return;
    }

    setAuditLoading(true);
    setAuditError("");

    try {
      const response = await fetch(
        "http://127.0.0.1:5000/api/documents/audit",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load activity logs.");
      }

      setAuditLogs(data.logs || []);
    } catch (error) {
      setAuditError(error.message || "Unable to load activity logs.");
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  };

  // View a document using the protected backend endpoint.
  const viewDocument = async (doc) => {
    const token = sessionStorage.getItem("trustvault_token");

    if (!token) {
      alert("Please log in again.");
      return;
    }

    // Open the tab immediately so the browser does not block the popup.
    const newTab = window.open("about:blank", "_blank");
    if (!newTab) {
      alert("Please allow pop-ups for TrustVault.");
      return;
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:5000/api/documents/${encodeURIComponent(doc.id)}/view`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Unable to view document.");
      }

      const blob = await response.blob();
      const fileUrl = URL.createObjectURL(blob);
      newTab.location.href = fileUrl;

      // Revoke the temporary object URL after the new tab has had time to load.
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);
    } catch (error) {
      newTab.close();
      alert(error.message || "Unable to view document.");
    }
  };

  // Download a document using the protected backend endpoint.
  const downloadDocument = async (doc) => {
    const token = sessionStorage.getItem("trustvault_token");

    if (!token) {
      alert("Please log in again.");
      return;
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:5000/api/documents/${encodeURIComponent(doc.id)}/download`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Unable to download document.");
      }

      const blob = await response.blob();
      const fileUrl = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = fileUrl;
      link.download = doc.name;
      window.document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);
    } catch (error) {
      alert(error.message || "Unable to download document.");
    }
  };

  // Share a document with another registered user.
  const shareDocument = async (doc) => {
    const recipientEmail = window.prompt(
      "Enter the email address of the user to share with:"
    );

    if (!recipientEmail || !recipientEmail.trim()) return;

    const permission = window.prompt(
      "Enter VIEW for view-only access or DOWNLOAD for view and download access:",
      "VIEW"
    );

    if (!permission) return;

    const choice = permission.trim().toUpperCase();
    if (choice !== "VIEW" && choice !== "DOWNLOAD") {
      alert("Please enter VIEW or DOWNLOAD.");
      return;
    }

    const token = sessionStorage.getItem("trustvault_token");
    if (!token) {
      alert("Please log in again.");
      return;
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:5000/api/documents/${encodeURIComponent(doc.id)}/share`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: recipientEmail.trim(),
            canView: true,
            canDownload: choice === "DOWNLOAD",
          }),
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Document sharing failed.");
      }

      alert("Document shared successfully!");
      await loadAuditLogs(token);
    } catch (error) {
      alert(error.message || "Document sharing failed.");
    }
  };

  // Login or register through the backend API.
  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setIsLoading(true);

    try {
      const endpoint = isRegister ? "register" : "login";
      const requestBody = isRegister
        ? { fullName, email, password: passwordPlaceholder }
        : { email, password: passwordPlaceholder };

      const response = await fetch(
        `http://127.0.0.1:5000/api/auth/${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Authentication failed.");
      }

      if (!data.token || !data.user) {
        throw new Error("Authentication response is incomplete.");
      }

      const user = {
        userId: data.user.userId ?? data.user.UserId,
        fullName: data.user.fullName ?? data.user.FullName,
        email: data.user.email ?? data.user.Email,
        role: data.user.role ?? data.user.Role,
      };

      sessionStorage.setItem("trustvault_token", data.token);

      try {
        await loadDocuments(data.token);
      } catch (documentError) {
        console.error("Document loading error:", documentError);
        setDocuments([]);
      }

      setCurrentUser(user);
      setEmail(user.email);
      setLoggedIn(true);
      setActivePage("Dashboard");
      setIsRegister(false);
      setFullName("");
      setPasswordPlaceholder("");
    } catch (error) {
      setMessage(error.message || "Unable to connect to backend.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("trustvault_token");
    setLoggedIn(false);
    setCurrentUser(null);
    setEmail("");
    setPasswordPlaceholder("");
    setIsRegister(false);
    setMessage("");
    setDocuments([]);
    setAuditLogs([]);
    setAuditError("");
    setActivePage("Dashboard");
  };

  // Upload selected files to the protected backend endpoint.
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const token = sessionStorage.getItem("trustvault_token");
    if (!token) {
      alert("Please log in again.");
      event.target.value = "";
      return;
    }

    setUploading(true);

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("document", file);

        const response = await fetch(
          "http://127.0.0.1:5000/api/documents/upload",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          }
        );

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || `Upload failed for ${file.name}.`);
        }
      }

      await loadDocuments(token);
      setActivePage("My Documents");
      alert("Document uploaded successfully!");
    } catch (error) {
      alert(error.message || "Unable to upload document.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleNavigation = (pageName) => {
    setActivePage(pageName);

    if (pageName === "Activity Logs") {
      loadAuditLogs(sessionStorage.getItem("trustvault_token"));
    }

    if (pageName === "My Documents") {
      loadDocuments(sessionStorage.getItem("trustvault_token")).catch((error) => {
        console.error("Document refresh error:", error);
      });
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderDocuments = (items) => {
    if (items.length === 0) {
      return <p className="empty-message">No documents found.</p>;
    }

    return (
      <div className="document-list">
        {items.map((doc) => (
          <div className="document-row" key={doc.id}>
            <div className="file-icon">{doc.type.slice(0, 4)}</div>

            <div className="document-info">
              <strong>{doc.name}</strong>
              <span>
                {doc.type} · {doc.size}
              </span>
            </div>

            <span className="document-date">{doc.date}</span>

            <span className="status-badge preview-badge">{doc.status}</span>

            <div className="document-actions">
              <button type="button" onClick={() => viewDocument(doc)}>
                View
              </button>
              <button type="button" onClick={() => downloadDocument(doc)}>
                Download
              </button>
              {Number(doc.ownerId) === Number(currentUser?.userId) && (
                <button type="button" onClick={() => shareDocument(doc)}>
                  Share
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Login and registration screen
  if (!loggedIn) {
    return (
      <div className="app-container">
        <nav className="navbar">
          <h2 className="logo">🔐 TrustVault</h2>
          <span>Secure Document Management Platform</span>
        </nav>

        <main className="main-content">
          <section className="welcome-section">
            <h1>Your Documents.</h1>
            <h1>Your Security.</h1>
            <p>
              Store, manage and access your important documents securely in one
              place.
            </p>
            <div className="features">
              <p>✓ Secure document storage</p>
              <p>✓ Easy document management</p>
              <p>✓ Controlled document access</p>
            </div>
          </section>

          <section className="login-card">
            <h2>{isRegister ? "Create Account" : "Welcome Back"}</h2>
            <p>
              {isRegister
                ? "Register to get started with TrustVault"
                : "Login to access your secure documents"}
            </p>

            <form onSubmit={handleSubmit}>
              {isRegister && (
                <input
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              )}

              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />

              <input
                type="password"
                placeholder="Password"
                value={passwordPlaceholder}
                onChange={(event) => setPasswordPlaceholder(event.target.value)}
                minLength={8}
                required
              />

              <button type="submit" disabled={isLoading}>
                {isLoading
                  ? "Please wait..."
                  : isRegister
                    ? "Create Account"
                    : "Login"}
              </button>
            </form>

            {message && <p className="message">{message}</p>}

            <p className="switch-text">
              {isRegister
                ? "Already have an account?"
                : "Don't have an account?"}
              <button
                type="button"
                className="switch-button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setMessage("");
                }}
              >
                {isRegister ? "Login" : "Register"}
              </button>
            </p>
          </section>
        </main>

        <footer>
          © 2026 TrustVault. Secure Document Management Platform.
        </footer>
      </div>
    );
  }

  // Authenticated dashboard
  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <h2 className="sidebar-logo">🔐 TrustVault</h2>
        <p className="sidebar-label">MAIN MENU</p>

        <nav className="side-navigation">
          {menuItems.map((item) => (
            <button
              key={item.name}
              className={activePage === item.name ? "nav-item active" : "nav-item"}
              onClick={() => handleNavigation(item.name)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <button className="logout-button" onClick={handleLogout}>
          ⇥ Logout
        </button>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <span className="topbar-label">TRUSTVAULT WORKSPACE</span>
            <h2>{activePage}</h2>
          </div>

          <div className="user-info">
            <div className="user-avatar">
              {email ? email.charAt(0).toUpperCase() : "U"}
            </div>
            <div>
              <strong>{currentUser?.fullName || email || "User"}</strong>
              <span>{currentUser?.role || "USER"}</span>
            </div>
          </div>
        </header>

        <div className="dashboard-content">
          {activePage === "Dashboard" && (
            <>
              <div className="welcome-banner">
                <div>
                  <h2>Welcome to TrustVault!</h2>
                  <p>Manage all your important documents in one place.</p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setActivePage("Upload Documents")}
                >
                  + Upload Document
                </button>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-icon blue">▤</span>
                  <p>Total Documents</p>
                  <h2>{documents.length}</h2>
                  <small>Documents you can access</small>
                </div>

                <div className="stat-card">
                  <span className="stat-icon green">↗</span>
                  <p>Shared With Me</p>
                  <h2>
                    {
                      documents.filter(
                        (doc) => Number(doc.ownerId) !== Number(currentUser?.userId)
                      ).length
                    }
                  </h2>
                  <small>Documents shared by other users</small>
                </div>

                <div className="stat-card">
                  <span className="stat-icon purple">▣</span>
                  <p>Document Types</p>
                  <h2>{new Set(documents.map((doc) => doc.type)).size}</h2>
                  <small>Different file formats</small>
                </div>
              </div>

              <section className="content-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Recent Documents</h3>
                    <p>Your latest accessible documents</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => handleNavigation("My Documents")}
                  >
                    View All
                  </button>
                </div>
                {renderDocuments(documents.slice(0, 4))}
              </section>
            </>
          )}

          {activePage === "My Documents" && (
            <section className="content-panel">
              <div className="panel-heading">
                <div>
                  <h3>My Documents</h3>
                  <p>Documents you own or have permission to access.</p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setActivePage("Upload Documents")}
                >
                  + Upload
                </button>
              </div>

              <input
                className="search-input"
                type="search"
                placeholder="Search documents by name..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              {renderDocuments(filteredDocuments)}
            </section>
          )}

          {activePage === "Upload Documents" && (
            <section className="content-panel">
              <h3>Upload Documents</h3>
              <p className="panel-description">
                Upload a file to your private TrustVault storage.
              </p>

              <div className="upload-area">
                <div className="upload-icon">↑</div>
                <h3>Upload your files</h3>
                <p>Choose PDF, Word, Excel, text or image files.</p>

                <input
                  ref={fileInputRef}
                  className="file-input"
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg"
                  onChange={handleFileUpload}
                />

                <button
                  className="primary-button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? "Uploading..." : "Choose Files"}
                </button>
              </div>

              <p className="upload-note">
                Uploaded files are stored by the backend. Document details and
                permissions are recorded in TrustVaultDB.
              </p>
            </section>
          )}

          {activePage === "Activity Logs" && (
            <section className="content-panel">
              <div className="panel-heading">
                <div>
                  <h3>Activity Logs</h3>
                  <p>Document access and security activity.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() =>
                    loadAuditLogs(sessionStorage.getItem("trustvault_token"))
                  }
                >
                  Refresh
                </button>
              </div>

              {auditLoading && <p>Loading activity logs...</p>}
              {auditError && <p className="message">{auditError}</p>}

              {!auditLoading && !auditError && auditLogs.length === 0 && (
                <p className="empty-message">No activity records found.</p>
              )}

              {!auditLoading &&
                auditLogs.map((log) => (
                  <div className="activity-item" key={log.AuditId}>
                    <span
                      className={
                        log.Outcome === "DENIED"
                          ? "activity-dot denied"
                          : "activity-dot success"
                      }
                    />

                    <div className="activity-details">
                      <strong>{(log.Action || "ACTIVITY").replace(/_/g, " ")}</strong>
                      <p>
                        Document: {log.OriginalFileName || "Unavailable"}
                      </p>
                      <p>
                        User: {log.UserName || log.UserEmail || `User #${log.UserId}`}
                      </p>
                      <p>Status: {log.Outcome}</p>
                      <p>
                        Date: {new Date(log.OccurredAt).toLocaleString()}
                      </p>
                      {log.Details && <p>{log.Details}</p>}
                    </div>

                    <span
                      className={
                        log.Outcome === "DENIED"
                          ? "audit-status denied-status"
                          : "audit-status success-status"
                      }
                    >
                      {log.Outcome}
                    </span>
                  </div>
                ))}
            </section>
          )}

          {activePage === "Settings" && (
            <section className="content-panel">
              <h3>Account Settings</h3>
              <p className="panel-description">Your account information.</p>

              <div className="settings-row">
                <span>Account name</span>
                <strong>{currentUser?.fullName || ""}</strong>
              </div>
              <div className="settings-row">
                <span>Account email</span>
                <strong>{email}</strong>
              </div>
              <div className="settings-row">
                <span>Account role</span>
                <strong>{currentUser?.role || "USER"}</strong>
              </div>
              <div className="settings-row">
                <span>Authentication</span>
                <strong>JWT authenticated</strong>
              </div>
            </section>
          )}
        </div>

        <footer className="dashboard-footer">
          © 2026 TrustVault · Secure Document Management Platform
          <span>Secure workspace</span>
        </footer>
      </main>
    </div>
  );
}

export default App;