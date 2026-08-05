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
  if (viewId === "returned") return ["returned", "revision_requested"].includes(post.status);
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
