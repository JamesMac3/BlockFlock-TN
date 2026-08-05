import { useNavigate } from "react-router-dom";
import { usePortalAuth } from "../auth/portalAuth";
import Header from "../components/Header";
import AdminPostDashboard from "../components/admin/AdminPostDashboard";

const chapterCards = [
  ["Posts", "Chapter publishing tools are coming next."],
  ["Documents", "Chapter document tools are coming next."],
  ["County statistics", "Expanded county reporting is coming next."],
  ["Chapter contacts", "Private chapter contact tools are coming next."],
];

const adminCards = [
  ["Pending approvals", "Approval workflows are coming next."],
  ["Chapter accounts", "Chapter account management is coming next."],
  ["County management", "County administration tools are coming next."],
  ["Email jobs", "Administrative email tools are coming next."],
];

export default function PortalDashboard({ mode, initialEditPostId = null }) {
  const navigate = useNavigate();
  const { user, account, assignedCounty, signOut } = usePortalAuth();
  const isAdmin = mode === "admin";
  const cards = isAdmin ? adminCards : chapterCards;

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
            <AdminPostDashboard user={user} onSignOut={handleSignOut} initialEditPostId={initialEditPostId} />
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

          <div className="portal-placeholder-grid">
            {cards.map(([title, description]) => (
              <article key={title}>
                <span>Placeholder</span>
                <h2>{title}</h2>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
