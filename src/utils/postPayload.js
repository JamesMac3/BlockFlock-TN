const SESSION_ERROR = "Your session could not be verified. Please sign in again.";

export async function runWithVerifiedUser({ auth, expectedUser, operation }) {
  const { data, error } = await auth.getUser();
  const authenticatedUser = data?.user;

  if (
    error ||
    !authenticatedUser?.id ||
    (expectedUser?.id && expectedUser.id !== authenticatedUser.id)
  ) {
    throw new Error(SESSION_ERROR);
  }

  return operation(authenticatedUser);
}

export function buildDraftPostPayload({ form, meetingOnly, authenticatedUser, existingPost }) {
  if (!authenticatedUser?.id) throw new Error(SESSION_ERROR);

  const originalAuthorId = existingPost?.author_user_id;
  if (existingPost?.id && !originalAuthorId) {
    throw new Error("The original post author could not be verified.");
  }

  const plainBody = meetingOnly
    ? form.summary.trim() || "Meeting details and schedule."
    : form.body.trim();

  return {
    author_user_id: originalAuthorId ?? authenticatedUser.id,
    title: form.title.trim(),
    scope: form.scope,
    county_id: form.scope === "county" ? Number(form.countyId) : null,
    content_type: meetingOnly ? "meeting" : form.contentType,
    summary: form.summary.trim() || null,
    body: plainBody,
    body_rich: meetingOnly ? null : form.bodyRich,
    event_start: form.eventStart ? new Date(form.eventStart).toISOString() : null,
    event_location: form.eventLocation.trim() || null,
    event_address: form.eventAddress.trim() || null,
    is_pinned: meetingOnly ? false : form.isPinned,
    show_in_status_feed: !meetingOnly,
    status: "draft",
    approved_at: null,
    approved_by: null,
    rejected_at: null,
  };
}

