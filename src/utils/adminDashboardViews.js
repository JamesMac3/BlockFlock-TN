export const ADMIN_DASHBOARD_VIEWS = [
  { id: "pending", label: "Pending Review", heading: "Pending Review", listType: "posts" },
  { id: "drafts", label: "Admin Drafts", heading: "Admin Drafts", listType: "posts" },
  { id: "published", label: "Published", heading: "Published Posts", listType: "posts" },
  { id: "returned", label: "Returned for Revision", heading: "Returned for Revision", listType: "posts" },
  { id: "meetings", label: "Upcoming Meetings", heading: "Upcoming Meetings", listType: "meetings" },
];

export function postMatchesAdminView(post, viewId, now = new Date()) {
  if (viewId === "pending") return post.status === "pending";
  if (viewId === "drafts") return post.status === "draft";
  if (viewId === "published") return post.status === "approved";
  // The live posts_status_check permits only draft/pending/approved/rejected
  // — this view labels 'rejected' as "Returned for Revision" but the stored
  // status column is always 'rejected'.
  if (viewId === "returned") return post.status === "rejected";
  if (viewId === "meetings") {
    return post.content_type === "meeting" &&
      Boolean(post.event_start) &&
      new Date(post.event_start) >= now;
  }
  return false;
}

export function getAdminDashboardCounts(posts, now = new Date()) {
  return Object.fromEntries(
    ADMIN_DASHBOARD_VIEWS.map((view) => [
      view.id,
      posts.filter((post) => postMatchesAdminView(post, view.id, now)).length,
    ])
  );
}

export function getAdminDashboardItems(posts, viewId, now = new Date()) {
  const matches = posts.filter((post) => postMatchesAdminView(post, viewId, now));
  return viewId === "meetings"
    ? matches.sort((first, second) => new Date(first.event_start) - new Date(second.event_start))
    : matches;
}
