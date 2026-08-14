import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { adminUploadAdapter } from "../../lib/adminUploadAdapter";
import PostComposer from "../post-composer/PostComposer";
import {
  ADMIN_DASHBOARD_VIEWS,
  getAdminDashboardCounts,
  getAdminDashboardItems,
} from "../../utils/adminDashboardViews";
import ContentManagementTable from "./ContentManagementTable";
import "./AdminPostDashboard.css";

const ADMIN_CAPABILITIES = {
  canPin: true,
  canMassEmail: true,
  canManageMedia: true,
};

const POST_LIST_FIELDS = [
  "id", "title", "summary", "county_id", "scope", "content_type", "status", "is_pinned",
  "author_user_id", "created_at", "updated_at", "submitted_at", "approved_at", "rejected_at",
  "admin_edited", "show_in_status_feed", "mass_email_requested", "mass_email_approved",
  "event_start", "event_location", "counties(id, name, slug)", "post_media(id)",
].join(", ");

async function loadEditablePost(postId) {
  return supabase
    .from("posts")
    .select("*, counties(id, name, slug), post_media(*)")
    .eq("id", postId)
    .single();
}

export default function AdminPostDashboard({ user, onSignOut, initialEditPostId = null, activeSection = null, onSectionChange = null }) {
  const [activeView, setActiveView] = useState("pending");
  const [posts, setPosts] = useState([]);
  const [counties, setCounties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creationType, setCreationType] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [sourceLookup, setSourceLookup] = useState({});

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    const [postsResult, countiesResult, accountsResult] = await Promise.all([
      supabase.from("posts").select(POST_LIST_FIELDS).order("created_at", { ascending: false }),
      supabase.from("counties").select("id, name, slug").order("name"),
      supabase.from("portal_accounts").select("user_id, role, county_id"),
    ]);
    if (postsResult.error || countiesResult.error) {
      console.error("Admin post dashboard request failed:", postsResult.error ?? countiesResult.error);
      setError("The post workspace could not be loaded. Confirm that the composer migration has been applied.");
    } else {
      const loadedPosts = postsResult.data ?? [];
      const loadedCounties = countiesResult.data ?? [];
      setPosts(loadedPosts);
      setCounties(loadedCounties);
      if (accountsResult.error) {
        console.warn("Publishing source labels could not be loaded:", accountsResult.error.code);
        setSourceLookup({});
      } else {
        const countyNames = new Map(loadedCounties.map((county) => [String(county.id), county.name]));
        setSourceLookup(Object.fromEntries((accountsResult.data ?? []).map((account) => [account.user_id, {
          role: account.role,
          countyName: countyNames.get(String(account.county_id)),
        }])));
      }
      if (initialEditPostId) {
        const requestedResult = await loadEditablePost(initialEditPostId);
        if (requestedResult.data && !requestedResult.error) {
          const requestedPost = requestedResult.data;
          setEditingPost(requestedPost);
          setCreationType(requestedPost.show_in_status_feed === false ? "meeting" : "post");
        } else {
          setError("The requested post could not be found.");
        }
      }
    }
    setLoading(false);
  }, [initialEditPostId]);

  useEffect(() => {
    const timer = setTimeout(loadDashboard, 0);
    return () => clearTimeout(timer);
  }, [loadDashboard]);

  const counts = useMemo(() => getAdminDashboardCounts(posts), [posts]);
  const activeItems = useMemo(() => getAdminDashboardItems(posts, activeView), [activeView, posts]);
  const activeDefinition = ADMIN_DASHBOARD_VIEWS.find((view) => view.id === activeView);

  async function beginEdit(post) {
    setError("");
    const result = await loadEditablePost(post.id);
    if (result.error || !result.data) {
      console.error("Post editor request failed:", result.error);
      setError("This item could not be opened for editing. Please try again.");
      return;
    }
    setEditingPost(result.data);
    setCreationType(result.data.show_in_status_feed === false ? "meeting" : "post");
  }

  function finishComposer() {
    setCreationType(null);
    setEditingPost(null);
    loadDashboard();
  }

  if (creationType) {
    return <PostComposer
      key={`${editingPost?.id ?? "new"}-${creationType}`}
      mode="admin"
      creationType={creationType}
      initialPost={editingPost}
      counties={counties}
      capabilities={ADMIN_CAPABILITIES}
      uploadAdapter={adminUploadAdapter}
      user={user}
      onComplete={finishComposer}
      onCancel={() => { setCreationType(null); setEditingPost(null); }}
    />;
  }

  return (
    <section className="admin-post-dashboard">
      <header className="admin-post-dashboard__header">
        <div><p>Administrator workspace</p><h1>Publishing dashboard</h1></div>
        <div className="admin-dashboard-actions">
          <button type="button" onClick={() => setCreationType("post")}>Publish update</button>
          <span>
            <button type="button" className="is-secondary" onClick={() => setCreationType("meeting")}>Create meeting without post</button>
            <small>Add a meeting to the schedule without publishing a full county update.</small>
          </span>
          <button type="button" className="is-secondary" onClick={onSignOut}>Sign Out</button>
        </div>
      </header>

      {loading && <p role="status">Loading administrator posts...</p>}
      {error && <p className="composer-error" role="alert">{error}</p>}

      {!loading && !error && <>
        <div className="admin-overview-grid" aria-label="Publishing queues">
          {ADMIN_DASHBOARD_VIEWS.map((view) => <DashboardViewCard key={view.id} definition={view} count={counts[view.id]} active={activeView === view.id} onSelect={() => setActiveView(view.id)} />)}
        </div>
        <section className="admin-dashboard-content" aria-labelledby="admin-active-view-heading">
          <header><h2 id="admin-active-view-heading">{activeDefinition.heading}</h2><p>{counts[activeView]} {counts[activeView] === 1 ? "item" : "items"}.</p></header>
          <ContentManagementTable
            key={activeView}
            records={activeItems}
            counties={counties}
            variant={activeView === "meetings" ? "meetings" : "posts"}
            context="admin"
            activeView={activeView}
            sourceLookup={sourceLookup}
            onEdit={beginEdit}
            getPreviewPath={(post) => post.status === "draft" ? `/portal/admin/posts/${post.id}/preview` : null}
          />
        </section>
      </>}

    </section>
  );
}

function DashboardViewCard({ definition, count, active, onSelect }) {
  return <button type="button" className={`admin-dashboard-card ${active ? "is-active" : ""}`} aria-label={`${definition.label}: ${count}`} aria-pressed={active} onClick={onSelect}><span>{definition.label}</span><strong>{count}</strong>{active && <small>✓ Selected</small>}</button>;
}
