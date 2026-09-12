// Shared between the public chapter-link buttons and the portal editor's
// live preview, so both always agree on the same three allowed colors —
// this list must stay in sync with the `color` check constraint in
// supabase/migrations/20260912003222_county_chapter_social_links.sql.
export const CHAPTER_LINK_COLORS = [
  { value: "light_blue", label: "Light blue" },
  { value: "navy", label: "Navy" },
  { value: "red", label: "Red" },
];

export const DEFAULT_CHAPTER_LINK_COLOR = "light_blue";

export function isKnownChapterLinkColor(value) {
  return CHAPTER_LINK_COLORS.some((option) => option.value === value);
}
