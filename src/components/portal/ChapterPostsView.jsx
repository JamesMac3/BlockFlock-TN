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
import { describeAccountState, describePostApprovalBehavior } from "../../features/portal-admin/chapterAccounts";
import "../admin/AdminPostDashboard.css";

const CHAPTER_CAPABILITIES = { canPin: false, canMassEmail: false, canManageMedia: true };

// "Admin Drafts" is renamed to "Drafts" on every chapter-master dashboard —
// admin's own dashboard (AdminPostDashboard.jsx) keeps ADMIN_DASHBOARD_VIEWS
// untouched, so this override only ever applies here.
const CHAPTER_VIEW_TEXT_OVERRIDES = { drafts: { label: "Drafts", heading: "Drafts" } };

// Trust is derived from the live portal_accounts row (see describeAccountState
// — status === "active" && review_required === false/true), never from any
// displayed label. A trusted chapter master's posts publish immediately and
// never pass through Pending Review/Returned for Revision, so those queues
// are hidden for them; a restricted chapter master sees the full review
// lifecycle. Suspended accounts never reach this component (already denied
// access upstream), so no separate case is needed for them.
const CHAPTER_VIEW_IDS_BY_TRUST = {
  trusted: ["drafts", "published", "meetings"],
  restricted: ["drafts", "pending", "published", "returned", "meetings"],
};

function getChapterDashboardViews(trustState) {
  const allowedIds = CHAPTER_VIEW_IDS_BY_TRUST[trustState] ?? CHAPTER_VIEW_IDS_BY_TRUST.trusted;
  return ADMIN_DASHBOARD_VIEWS
    .filter((view) => allowedIds.includes(view.id))
    .map((view) => ({ ...view, ...CHAPTER_VIEW_TEXT_OVERRIDES[view.id] }));
}

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
  const [rawActiveView, setActiveView] = useState("drafts");
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

  const trustState = describeAccountState(account ?? {}).state;
  const chapterViews = useMemo(() => getChapterDashboardViews(trustState), [trustState]);
  // If the account's trust state resolves (or changes) after a view was
  // already selected — e.g. Pending Review was active and the account turns
  // out to be trusted — fall back to a view that's actually visible. This is
  // derived directly during render (never via a corrective effect calling
  // setActiveView), so it takes effect on the very next render with no extra
  // render pass and no page refresh; the underlying activeView state is only
  // ever changed by an explicit click.
  const activeView = chapterViews.some((view) => view.id === rawActiveView) ? rawActiveView : (chapterViews[0]?.id ?? "drafts");
  const counts = useMemo(() => getAdminDashboardCounts(posts), [posts]);
  const activeItems = useMemo(() => getAdminDashboardItems(posts, activeView), [activeView, posts]);
  const activeDefinition = chapterViews.find((view) => view.id === activeView) ?? chapterViews[0];
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

  // Deletion is offered only to trusted chapter masters (server-enforced —
  // rrg_delete_post independently checks role/trust/county ownership; this
  // is a UX gate, not the authorization boundary). mass_email_requested is
  // already present in every loaded row, so a post with campaign history is
  // disabled client-side without any extra query; the RPC's own rejection
  // (errcode 23503) is still handled for any race/edge case.
  async function handleDeletePost(post) {
    if (post.mass_email_requested) return;
    const confirmed = window.confirm(`Delete "${post.title}"? This post will be permanently removed from the public feed.`);
    if (!confirmed) return;
    setError("");
    const { error: rpcError } = await supabase.rpc("rrg_delete_post", { p_post_id: post.id });
    if (rpcError) {
      console.error("Post deletion failed:", rpcError);
      setError(
        rpcError.code === "23503" || /email campaign/i.test(rpcError.message ?? "")
          ? "This post has an email campaign and must be retained for delivery records."
          : "This post could not be deleted. Please try again."
      );
      return;
    }
    setPosts((current) => current.filter((item) => item.id !== post.id));
    if (editingPost?.id === post.id) {
      setCreationType(null);
      setEditingPost(null);
    }
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
          {chapterViews.map((view) => (
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
            onDelete={trustState === "trusted" ? handleDeletePost : undefined}
            getPreviewPath={() => null}
          />
        </section>
      </>}
    </section>
  );
}
