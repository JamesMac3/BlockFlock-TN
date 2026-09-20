// Mirrors get_public_archive_goal's own eligibility gate exactly
// (supabase/migrations/20260821234022_document_management_county_statistics_and_archive_gate.sql):
// a goal has a real, reachable public archive detail page only when it is
// public, unlocked, and in one of the three archive-eligible statuses.
// Kept here as the single place this rule lives on the frontend, so a
// "More details" link is never shown for a goal whose archive page would
// 404 (get_public_archive_goal returns null for anything outside this
// gate), and never silently drifts out of sync with the database rule.
const PUBLIC_ARCHIVE_STATUSES = new Set(["ready", "received", "published"]);

export function isGoalPubliclyArchived(goal) {
  return Boolean(goal)
    && goal.is_public === true
    && !goal.locked
    && PUBLIC_ARCHIVE_STATUSES.has(goal.status);
}
