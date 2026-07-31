import { Navigate } from "react-router-dom";
import { usePortalAuth } from "../auth/portalAuth";

export default function ProtectedPortalRoute({ role, children }) {
  const { account, authenticated, loading } = usePortalAuth();

  if (loading) {
    return <p className="portal-route-status">Restoring secure session...</p>;
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
