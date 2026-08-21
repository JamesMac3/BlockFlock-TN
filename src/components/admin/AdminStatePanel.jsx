import { RPC_ERROR_MESSAGES } from "../../features/portal-admin/rpcErrors";

// A readable dark-theme state panel distinguishing loading, empty results,
// no-matches-after-filtering, a missing/unapplied backend migration,
// authorization failure, and a retryable network failure — never a
// silently empty table. The full error is always logged to the developer
// console by the caller; this panel shows only the safe, explanatory text.
export default function AdminStatePanel({ state, errorKind, onRetry, emptyMessage, noMatchesMessage }) {
  if (state === "loading") {
    return <p className="management-state" role="status">Loading...</p>;
  }

  if (state === "error") {
    const message = RPC_ERROR_MESSAGES[errorKind] ?? RPC_ERROR_MESSAGES.network;
    const retryable = errorKind !== "not-authorized" && errorKind !== "missing-migration";
    return (
      <div className="management-state" role="alert">
        <p>{message}</p>
        {retryable && onRetry && (
          <button type="button" onClick={onRetry}>Retry</button>
        )}
      </div>
    );
  }

  if (state === "empty") {
    return <p className="management-state">{emptyMessage ?? "Nothing here yet."}</p>;
  }

  if (state === "no-matches") {
    return <p className="management-state">{noMatchesMessage ?? "No records match the current filters."}</p>;
  }

  return null;
}
