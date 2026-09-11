// Single source of truth for "does this county have a publicly active
// chapter?" — driven entirely by the county's own chapter_status column
// (values: 'claimed' | 'unclaimed'), never by portal sign-in, account
// status, or review permissions. Public chapter status and portal-account
// access are intentionally separate concerns; this helper only ever
// answers the public one.
export function isChapterClaimed(county) {
  return county?.chapter_status === "claimed";
}
