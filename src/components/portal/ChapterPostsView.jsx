import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { adminUploadAdapter } from "../../lib/adminUploadAdapter";
import { usePortalAuth } from "../../auth/portalAuth";
import PostComposer from "../post-composer/PostComposer";
import {
  ADMIN_DASHBOARD_VIEWS,
  getAdminDashboardCounts,
  getAdminDashboardItems,
} from "../../utils/adminDashboardViews";
import ContentManagementTable from "../admin/ContentManagementTable";
import { describePostApprovalBehavior } from "../../features/portal-admin/chapterAccounts";
import "../admin/AdminPostDashboard.css";

const CHAPTER_CAPABILITIES = { canPin: false, canMassEmail: false, canManageMedia: true };

const POST_LIST_FIELDS = [
  "id", "title", "summary", "county_id", "scope", "content_type", "status", "is_pinned",
  "author_user_id", "created_at", "updated_at", "submitted_at", "approved_at", "rejected_at",
  "admin_edited", "show_in_status_feed", "mass_email_requested", "mass_email_approved",
  "event_start", "event_location", "counties(id, name, slug)", "post_media(id)",
].join(", ");

async function loadEditablePost(postId) {
  return supabase.from("posts").select("*, counties(id, name, slug), post_media(*)").eq("id", postId).single();
}

export default function ChapterPostsView({ user, county }) {
  const { account } = usePortalAuth();
  const [activeView, setActiveView] = useState("drafts");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creationType, setCreationType] = useState(null);
  const [editingPost, setEditingPost] = useState(null);

  const loadDashboard = useCallback(async () => {
    if (!county?.id) return;
    setLoading(true);
    setError("");
    const { data, error: postsError } = await supabase
      .from("posts")
      .select(POST_LIST_FIELDS)
      .eq("county_id", county.id)
      .order("created_at", { ascending: false });
    if (postsError) {
      console.error("Chapter post workspace request failed:", postsError);
      setError("Your post workspace could not be loaded.");
    } else {
      setPosts(data ?? []);
    }
    setLoading(false);
  }, [county]);

  useEffect(() => {
    const timer = setTimeout(loadDashboard, 0);
    return () => clearTimeout(timer);
  }, [loadDashboard]);

  const counts = useMemo(() => getAdminDashboardCounts(posts), [posts]);
  const activeItems = useMemo(() => getAdminDashboardItems(posts, activeView), [activeView, posts]);
  const activeDefinition = ADMIN_DASHBOARD_VIEWS.find((view) => view.id === activeView);
  const approvalBehavior = describePostApprovalBehavior(account ?? {});

  async function beginEdit(post) {
    setError("");
    const result = await loadEditablePost(post.id);
    if (result.error || !result.data) {
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
    return (
      <PostComposer
        key={`${editingPost?.id ?? "new"}-${creationType}`}
        mode="chapter"
        creationType={creationType}
        initialPost={editingPost}
        counties={county ? [county] : []}
        capabilities={CHAPTER_CAPABILITIES}
        uploadAdapter={adminUploadAdapter}
        user={user}
        chapterCounty={county}
        chapterAccount={account}
        onComplete={finishComposer}
        onCancel={() => { setCreationType(null); setEditingPost(null); }}
      />
    );
  }

  return (
    <section className="admin-post-dashboard">
      <p className="chapter-posts-approval-note">
        Post publishing for {county?.name}: <strong>{approvalBehavior}</strong>
      </p>

      {loading && <p role="status">Loading your posts...</p>}
      {error && <p className="composer-error" role="alert">{error}</p>}

      {!loading && !error && <>
        <div className="admin-overview-grid" aria-label="Publishing queues">
          {ADMIN_DASHBOARD_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              className={`admin-dashboard-card ${activeView === view.id ? "is-active" : ""}`}
              aria-label={`${view.label}: ${counts[view.id]}`}
              aria-pressed={activeView === view.id}
              onClick={() => setActiveView(view.id)}
            >
              <span>{view.label}</span>
              <strong>{counts[view.id]}</strong>
              {activeView === view.id && <small>✓ Selected</small>}
            </button>
          ))}
        </div>
        <section className="admin-dashboard-content" aria-labelledby="chapter-active-view-heading">
          <header className="admin-dashboard-content__header">
            <div>
              <h2 id="chapter-active-view-heading">{activeDefinition.heading}</h2>
              <p>{counts[activeView]} {counts[activeView] === 1 ? "item" : "items"}.</p>
            </div>
            <div className="admin-dashboard-actions">
              <button type="button" onClick={() => setCreationType("post")}>Publish update</button>
              <span>
                <button type="button" className="is-secondary" onClick={() => setCreationType("meeting")}>Create meeting without post</button>
                <small>Add a meeting to the schedule without publishing a full county update.</small>
              </span>
            </div>
          </header>
          <ContentManagementTable
            key={activeView}
            records={activeItems}
            counties={county ? [county] : []}
            variant={activeView === "meetings" ? "meetings" : "posts"}
            context="chapter"
            activeView={activeView}
            sourceLookup={{}}
            onEdit={beginEdit}
            getPreviewPath={() => null}
          />
        </section>
      </>}
    </section>
  );
}
