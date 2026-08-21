export const PAGE_SIZE_CHOICES = [25, 50, 100];
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export function clampPageSize(pageSize) {
  const parsed = Number(pageSize);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.round(parsed), MAX_PAGE_SIZE);
}

export function totalPagesFor(totalCount, pageSize) {
  return Math.max(1, Math.ceil(totalCount / clampPageSize(pageSize)));
}

// Any change to search/filter/sort/page-size must reset the current page
// back to 1 — otherwise a narrower result set can leave the view on a page
// past the end, or a stale page number can silently apply to a completely
// different filtered set.
export function resetPageOnQueryChange(criteria, changes) {
  return { ...criteria, ...changes, page: 1 };
}
