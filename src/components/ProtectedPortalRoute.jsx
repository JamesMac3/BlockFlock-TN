import { Navigate } from "react-router-dom";
import { usePortalAuth } from "../auth/portalAuth";

export default function ProtectedPortalRoute({ role, children }) {
  const { account, authenticated, loading, revoked } = usePortalAuth();

  if (loading) {
    return <p className="portal-route-status">Restoring secure session...</p>;
  }

  // Checked before the generic not-authenticated redirect: a suspended
  // account is also unauthenticated (its session was cleared), but it must
  // land on the access-revoked page, not the ordinary login screen.
  if (revoked) {
    return <Navigate to="/portal/access-revoked" replace />;
  }

  if (!authenticated || !account) {
    return <Navigate to="/portal/login" replace />;
  }

  if (account.role !== role) {
    const destination =
      account.role === "admin" ? "/portal/admin" : "/portal/chapter";
    return <Navigate to={destination} replace />;
  }

  return children;
}
