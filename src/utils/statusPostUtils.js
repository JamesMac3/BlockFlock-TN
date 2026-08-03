function postPriority(post, countyId) {
  if (post.is_pinned && post.scope === "global") return 0;
  if (post.is_pinned && Number(post.county_id) === Number(countyId)) return 1;
  return 2;
}

export function sortStatusPosts(posts, countyId) {
  return [...posts].sort((first, second) => {
    const priorityDifference =
      postPriority(first, countyId) - postPriority(second, countyId);

    if (priorityDifference !== 0) return priorityDifference;

    const firstDate = new Date(first.approved_at ?? first.created_at ?? 0).getTime();
    const secondDate = new Date(second.approved_at ?? second.created_at ?? 0).getTime();
    return secondDate - firstDate;
  });
}
