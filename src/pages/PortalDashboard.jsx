import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePortalAuth } from "../auth/portalAuth";
import Header from "../components/Header";
import AdminPostDashboard from "../components/admin/AdminPostDashboard";
import RecordsRequestGoalsManager from "../components/records-request-goals/RecordsRequestGoalsManager";

const chapterMenuItems = [
  ["Posts", "Chapter publishing tools"],
  ["Records Request Goals", "records-request-goals"],
  ["Archive documents", "Uploading county archive documents is coming next."],
  ["County statistics", "Expanded county reporting is coming next."],
  ["Chapter contacts", "Private chapter contact tools are coming next."],
];

const adminMenuItems = [
  ["Posts", "admin-posts"],
  ["Records Request Goals", "records-request-goals"],
  ["Archive documents", "Managing archive documents for all jurisdictions is coming next."],
  ["Pending approvals", "Approval workflows are coming next."],
  ["Chapter accounts", "Chapter account management is coming next."],
];

export default function PortalDashboard({ mode, initialEditPostId = null }) {
  const navigate = useNavigate();
  const { user, account, assignedCounty, signOut } = usePortalAuth();
  const isAdmin = mode === "admin";
  const [activeSection, setActiveSection] = useState(isAdmin ? "admin-posts" : null);
  const menuItems = isAdmin ? adminMenuItems : chapterMenuItems;

  async function handleSignOut() {
    await signOut();
    navigate("/portal/login", { replace: true });
  }

  if (isAdmin) {
    return (
      <div className="site-shell">
        <Header />
        <main className="portal-dashboard">
          <section className="portal-dashboard__shell">
            <AdminPostDashboard 
              user={user} 
              onSignOut={handleSignOut} 
              initialEditPostId={initialEditPostId}
              activeSection={activeSection}
              onSectionChange={setActiveSection}
            />
            {activeSection === "records-request-goals" && (
              <div style={{ marginTop: "2rem" }}>
                <RecordsRequestGoalsManager />
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="site-shell">
      <Header />
      <main className="portal-dashboard">
        <section className="portal-dashboard__shell">
          <header className="portal-dashboard__header">
            <div>
              <p className="portal-login-eyebrow">Authenticated portal</p>
              <h1>
                {isAdmin
                  ? "Flock Block Tennessee Administration"
                  : `Signed in as ${assignedCounty.name} Chapter Master`}
              </h1>
            </div>
            <button type="button" onClick={handleSignOut}>
              Sign Out
            </button>
          </header>

          <dl className="portal-account-summary">
            {isAdmin ? (
              <>
                <div>
                  <dt>Administrator identity</dt>
                  <dd>{user.email}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{account.role}</dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>Chapter status</dt>
                  <dd>{account.status}</dd>
                </div>
                <div>
                  <dt>Camera count</dt>
                  <dd>{assignedCounty.camera_count ?? "Not reported"}</dd>
                </div>
                <div>
                  <dt>Drone count</dt>
                  <dd>{assignedCounty.drone_count ?? "Not reported"}</dd>
                </div>
              </>
            )}
            <div>
              <dt>Account status</dt>
              <dd>{account.status}</dd>
            </div>
          </dl>

          <nav className="portal-dashboard__nav" aria-label="Portal sections">
            <div className="portal-dashboard__nav-title">Portal Sections</div>
            <div className="portal-dashboard__nav-items">
              {menuItems.map(([title, id]) => (
                <button
                  key={id}
                  type="button"
                  className={`portal-dashboard__nav-item ${
                    activeSection === id ? "portal-dashboard__nav-item--active" : ""
                  }`}
                  onClick={() => setActiveSection(activeSection === id ? null : id)}
                >
                  {title}
                </button>
              ))}
            </div>
          </nav>

          {activeSection === "records-request-goals" ? (
            <div style={{ marginTop: "2rem" }}>
              <RecordsRequestGoalsManager />
            </div>
          ) : (
            <div className="portal-placeholder-grid">
              {menuItems.map(([title, id]) => (
                <article key={id}>
                  <span>Placeholder</span>
                  <h2>{title}</h2>
                  <p>
                    Click the navigation button above to access this section.
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
