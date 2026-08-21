import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePortalAuth } from "../auth/portalAuth";
import Header from "../components/Header";
import AdminPostDashboard from "../components/admin/AdminPostDashboard";
import AdminWorkspaceSwitcher from "../components/admin/AdminWorkspaceSwitcher";
import ChapterMasterManagementTable from "../components/admin/ChapterMasterManagementTable";
import CountyContactsManager from "../components/admin/CountyContactsManager";
import TabNav from "../components/admin/TabNav";
import RecordsRequestGoalsManager from "../components/records-request-goals/RecordsRequestGoalsManager";
import ChapterAccountSettings from "../components/portal/ChapterAccountSettings";
import ChapterPostsView from "../components/portal/ChapterPostsView";

const chapterMenuItems = [
  ["Posts", "posts"],
  ["Records Request Goals", "records-request-goals"],
  ["Archive documents", "Uploading county archive documents is coming next."],
  ["County statistics", "Expanded county reporting is coming next."],
  ["Account Settings", "account-settings"],
];

const chapterMenuTabs = chapterMenuItems.map(([label, id]) => ({ id, label }));

export default function PortalDashboard({ mode, initialEditPostId = null }) {
  const navigate = useNavigate();
  const { user, account, assignedCounty, signOut } = usePortalAuth();
  const isAdmin = mode === "admin";
  const [activeSection, setActiveSection] = useState(isAdmin ? "posts" : null);
  const menuItems = chapterMenuItems;

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
            <AdminWorkspaceSwitcher activeWorkspace={activeSection} onSelectWorkspace={setActiveSection} />
            {activeSection === "posts" && (
              <AdminPostDashboard user={user} initialEditPostId={initialEditPostId} />
            )}
            {activeSection === "goals" && <RecordsRequestGoalsManager />}
            {activeSection === "chapter-accounts" && <ChapterMasterManagementTable />}
            {activeSection === "contacts" && <CountyContactsManager />}
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
              <h1>Signed in as {assignedCounty.name} Chapter Master</h1>
            </div>
            <button type="button" onClick={handleSignOut}>
              Sign Out
            </button>
          </header>

          <dl className="portal-account-summary">
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
            <div>
              <dt>Account status</dt>
              <dd>{account.status}</dd>
            </div>
          </dl>

          <TabNav
            items={chapterMenuTabs}
            activeId={activeSection}
            onSelect={(id) => setActiveSection(activeSection === id ? null : id)}
            label="Portal sections"
          />

          {activeSection === "records-request-goals" && (
            <div style={{ marginTop: "2rem" }}>
              <RecordsRequestGoalsManager />
            </div>
          )}
          {activeSection === "posts" && (
            <div style={{ marginTop: "2rem" }}>
              <ChapterPostsView user={user} county={assignedCounty} />
            </div>
          )}
          {activeSection === "account-settings" && (
            <div style={{ marginTop: "2rem" }}>
              <ChapterAccountSettings user={user} account={account} onSignOut={handleSignOut} />
            </div>
          )}
          {!["records-request-goals", "posts", "account-settings"].includes(activeSection) && (
            <div className="portal-placeholder-grid">
              {menuItems
                .filter(([, id]) => !["records-request-goals", "posts", "account-settings"].includes(id))
                .map(([title, id]) => (
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
