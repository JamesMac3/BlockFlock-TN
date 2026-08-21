// Pure mirror of the rrg_submit_post SQL RPC's transition rules (see
// supabase/migrations/20260821060801_chapter_master_accounts_and_posts.sql).
// This is NOT the source of truth — the RPC is, and re-derives everything
// server-side — but it lets the trusted/restricted decision logic be
// exercised quickly by node:test without a live database, and lets the
// frontend preview a post's likely outcome before submitting.

// Live posts_status_check permits exactly draft/pending/approved/rejected.
// A chapter master may resubmit a 'rejected' post; the UI may label that
// status "Returned for revision" for chapter masters, but the stored value
// is always 'rejected' — there is no separate 'returned'/'revision_requested'
// status live.
const CHAPTER_STARTABLE_STATUSES = new Set(["draft", "rejected"]);
const ADMIN_STARTABLE_STATUSES = new Set(["draft", "pending", "rejected"]);

export function resolvePostSubmission({ actor, post }) {
  if (!actor || actor.status !== "active") {
    return { allowed: false, reason: "NOT_AUTHORIZED" };
  }

  if (actor.role === "admin") {
    if (!ADMIN_STARTABLE_STATUSES.has(post?.status)) {
      return { allowed: false, reason: "INVALID_CURRENT_STATUS" };
    }
    return { allowed: true, targetStatus: "approved" };
  }

  if (actor.role === "chapter_master") {
    if (post?.author_user_id !== actor.user_id) {
      return { allowed: false, reason: "NOT_AUTHOR" };
    }
    if (!post?.county_id || post.county_id !== actor.county_id) {
      return { allowed: false, reason: "COUNTY_MISMATCH" };
    }
    if (!CHAPTER_STARTABLE_STATUSES.has(post?.status)) {
      return { allowed: false, reason: "INVALID_CURRENT_STATUS" };
    }
    return { allowed: true, targetStatus: actor.review_required ? "pending" : "approved" };
  }

  return { allowed: false, reason: "NOT_AUTHORIZED" };
}

// Restricted status affects post publication only — never goal management,
// request-profile preview, or document uploads. This predicate exists so
// that invariant is testable in one place; goal/document authorization
// never consults review_required at all.
export function canManageGoalsRegardlessOfTrust({ status }) {
  return status === "active";
}
