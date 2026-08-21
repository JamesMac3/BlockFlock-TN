// Pure mirror of rrg_can_manage_profile_entity /
// rrg_can_manage_county's logic from
// 20260821090000_decentralize_request_profile_authority.sql and
// 20260814_records_request_goals.sql. This is NOT the source of truth —
// the RPCs are, and re-derive everything server-side — but it lets the
// admin/chapter-master/cross-county/suspended decision logic be exercised
// quickly by node:test without a live database.
//
// review_required (trusted/restricted) is a posts-only concept and is
// deliberately never read here — it must never gate profile authority.
export function canManageProfileEntity({ account, entity }) {
  if (!account || account.status !== "active") return false;
  if (!entity) return false;
  if (account.role === "admin") return true;
  if (account.role === "chapter_master") return account.county_id === entity.county_id;
  return false;
}
