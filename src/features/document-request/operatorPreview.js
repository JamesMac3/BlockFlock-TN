/**
 * Client-side wrapper for the authorized-operator draft-request preview.
 *
 * Authorization is enforced entirely server-side (the
 * get_draft_request_preview_bundle SECURITY DEFINER function reuses the
 * existing rrg_can_manage_goal helper). This module never re-implements
 * authorization — it only calls the RPC and reports whether it succeeded.
 * A denied call fails safely: the RPC raises a Postgres exception, which
 * arrives here as `error` with no `data`.
 */

/**
 * Fetches the preview bundle (goal, request profile, government entity,
 * and base-PDF evidence metadata) for one goal. Returns
 * { bundle, error }: `bundle` is the parsed JSON object on success, or
 * null if the call was denied or failed for any reason. Never throws.
 */
export async function fetchDraftPreviewBundle({ supabase, goalId }) {
  const { data, error } = await supabase.rpc("get_draft_request_preview_bundle", {
    p_goal_id: goalId,
  });

  if (error || !data) {
    if (error) console.error("get_draft_request_preview_bundle failed:", error);
    return { bundle: null, error: error?.message ?? "The preview bundle could not be loaded." };
  }

  return { bundle: data, error: null };
}

/**
 * Client-side UX gate only — mirrors the database's rrg_can_manage_county
 * logic (active account; admin manages every county; chapter_master
 * manages only their own assigned county) so the preview control isn't
 * shown to someone the server would refuse anyway. This is never the
 * source of truth: get_draft_request_preview_bundle re-checks
 * authorization itself on every call regardless of what this returns.
 */
export function canOperatorPreviewGoalCounty({ account, goalCountyId }) {
  if (!account || account.status !== "active") return false;
  if (account.role === "admin") return true;
  if (account.role === "chapter_master") return account.county_id === goalCountyId;
  return false;
}
