// Pure decision of where a portal login attempt lands, given the profile
// returned by PortalAuthContext's acceptSession/loadPortalProfile. This is
// the single generic-failure surface for a nonexistent account, an invalid
// username alias, a wrong password (never reaches here — auth itself
// fails first), and an authenticated user with no valid admin/chapter_master
// portal profile — all resolve to "failed" and the same error message,
// never revealing which case occurred.
//
// profile is exactly what PortalAuthContext returns:
//   - null                                    -> no valid portal profile
//   - { revoked: true }                       -> suspended account
//   - { account, assignedCounty }              -> role decides the destination
export function resolvePostLoginDestination({ profile }) {
  if (!profile) {
    return "failed";
  }

  if (profile.revoked) {
    return "access-revoked";
  }

  const role = profile.account?.role;

  if (role === "admin") return "admin";
  if (role === "chapter_master") return "chapter";

  return "failed";
}
