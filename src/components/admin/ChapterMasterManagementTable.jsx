import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { describeAccountState, describePostApprovalBehavior } from "../../features/portal-admin/chapterAccounts";
import { classifyRpcError } from "../../features/portal-admin/rpcErrors";
import { clampPageSize, resetPageOnQueryChange } from "../../features/portal-admin/pagination";
import AdminStatePanel from "./AdminStatePanel";
import AdminPagination from "./AdminPagination";
import AdminPopout from "./AdminPopout";
import "../admin/ContentManagementTable.css";
import "./ChapterMasterManagementTable.css";

const STATE_OPTIONS = [
  { value: "", label: "All states" },
  { value: "trusted", label: "Trusted" },
  { value: "restricted", label: "Restricted" },
  { value: "suspended", label: "Suspended" },
];

const SORT_OPTIONS = [
  ["county", "County"],
  ["login_alias", "Login alias"],
  ["state", "Account state"],
  ["created_at", "Created date"],
];

async function invokeAccountAction(action, userId) {
  const { data, error } = await supabase.functions.invoke("admin-account-action", {
    body: { action, user_id: userId },
  });
  if (error) throw error;
  return data;
}

export default function ChapterMasterManagementTable() {
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadState, setLoadState] = useState("loading");
  const [errorKind, setErrorKind] = useState(null);
  const [criteria, setCriteria] = useState({
    search: "", countyId: "", accountState: "", sort: "county", sortDirection: "asc", page: 1, pageSize: 25,
  });
  const [editingUserId, setEditingUserId] = useState(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    setErrorKind(null);
    const { data, error } = await supabase.rpc("rrg_admin_list_chapter_accounts", {
      p_search: criteria.search || null,
      p_county_id: criteria.countyId ? Number(criteria.countyId) : null,
      p_state: criteria.accountState || null,
      p_sort: criteria.sort,
      p_sort_direction: criteria.sortDirection,
      p_page: criteria.page,
      p_page_size: clampPageSize(criteria.pageSize),
    });

    if (error) {
      console.error("Failed to load chapter accounts:", error);
      setErrorKind(classifyRpcError(error));
      setLoadState("error");
      return;
    }

    const loadedRows = data ?? [];
    setRows(loadedRows);
    setTotalCount(loadedRows[0]?.total_count ?? 0);
    if (loadedRows.length === 0) {
      setLoadState(criteria.search || criteria.countyId || criteria.accountState ? "no-matches" : "empty");
    } else {
      setLoadState("ready");
    }
  }, [criteria]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function updateCriteria(changes) {
    setCriteria((current) => resetPageOnQueryChange(current, changes));
  }

  const editingRow = rows.find((row) => row.user_id === editingUserId) ?? null;

  return (
    <div className="content-management chapter-master-table">
      <h2>Chapter Master Management</h2>

      <div className="management-toolbar">
        <label>
          Search
          <input
            type="search"
            value={criteria.search}
            onChange={(event) => updateCriteria({ search: event.target.value })}
            placeholder="County, login alias, or forwarding email"
          />
        </label>
        <label>
          State
          <select value={criteria.accountState} onChange={(event) => updateCriteria({ accountState: event.target.value })}>
            {STATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Sort by
          <select value={criteria.sort} onChange={(event) => updateCriteria({ sort: event.target.value })}>
            {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Direction
          <select value={criteria.sortDirection} onChange={(event) => updateCriteria({ sortDirection: event.target.value })}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </div>

      {loadState === "loading" || loadState === "error" || loadState === "empty" || loadState === "no-matches" ? (
        <AdminStatePanel
          state={loadState}
          errorKind={errorKind}
          onRetry={load}
          emptyMessage="No chapter-master accounts yet."
          noMatchesMessage="No chapter-master accounts match the current filters."
        />
      ) : (
        <>
          <table className="management-table">
            <thead>
              <tr>
                <th>County</th>
                <th>Login / forwarding alias</th>
                <th>Forwarding destination</th>
                <th>Account state</th>
                <th>Created</th>
                <th>Last password rotation</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const { state, label } = describeAccountState(row);
                return (
                  <tr key={row.user_id}>
                    <td>{row.county_name}</td>
                    <td>{row.login_email}</td>
                    <td>{row.forwarding_email || "Not set"}</td>
                    <td><span className={`chapter-master-table__badge chapter-master-table__badge--${state}`}>{label}</span></td>
                    <td>{row.created_at ? new Date(row.created_at).toLocaleDateString() : "Not recorded"}</td>
                    <td>{row.password_rotated_at ? new Date(row.password_rotated_at).toLocaleDateString() : "Not recorded"}</td>
                    <td className="management-actions">
                      <button type="button" onClick={() => setEditingUserId(row.user_id)} aria-label={`Edit ${row.county_name} chapter master account`}>
                        ✎ Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <AdminPagination
            page={criteria.page}
            pageSize={clampPageSize(criteria.pageSize)}
            totalCount={totalCount}
            onPageChange={(page) => setCriteria((current) => ({ ...current, page }))}
            onPageSizeChange={(pageSize) => updateCriteria({ pageSize })}
          />
        </>
      )}

      {editingRow && (
        <AdminPopout title={`${editingRow.county_name} Chapter Master`} onClose={() => setEditingUserId(null)}>
          <ChapterAccountEditor
            row={editingRow}
            onChanged={() => { setEditingUserId(null); load(); }}
          />
        </AdminPopout>
      )}
    </div>
  );
}

function ChapterAccountEditor({ row, onChanged }) {
  const [emailValue, setEmailValue] = useState(row.forwarding_email ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [retryable, setRetryable] = useState(false);
  const [retryAction, setRetryAction] = useState(null);
  const { state } = describeAccountState(row);
  const approvalBehavior = describePostApprovalBehavior(row);

  async function handleSaveEmail(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("rrg_admin_set_forwarding_email", { p_user_id: row.user_id, p_email: emailValue });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    onChanged();
  }

  async function handleSetReviewRequired(reviewRequired) {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("rrg_admin_set_review_required", { p_user_id: row.user_id, p_review_required: reviewRequired });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    onChanged();
  }

  async function handleSuspendOrRestore(action) {
    setBusy(true);
    setMessage("");
    setRetryable(false);
    try {
      const result = await invokeAccountAction(action, row.user_id);
      if (!result?.dbUpdated) {
        setMessage(result?.error ?? "The action could not be completed.");
        setRetryable(Boolean(result?.retryable));
        setRetryAction(action);
        return;
      }
      if (result.retryable) {
        setMessage(
          action === "suspend"
            ? "Access is already blocked, but the login lock could not be applied."
            : "The account is unbanned, but the database restore could not complete."
        );
        setRetryable(true);
        setRetryAction(action);
        return;
      }
      onChanged();
    } catch (err) {
      setMessage(err.message);
      setRetryable(true);
      setRetryAction(action);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chapter-master-table__editor">
      <dl>
        <div><dt>Login alias</dt><dd>{row.login_email}</dd></div>
        <div><dt>Post publishing</dt><dd>{approvalBehavior}</dd></div>
      </dl>

      <form onSubmit={handleSaveEmail}>
        <label htmlFor="editor-forwarding-email">Forwarding destination</label>
        <input
          id="editor-forwarding-email"
          type="email"
          value={emailValue}
          onChange={(event) => setEmailValue(event.target.value)}
          required
        />
        <button type="submit" disabled={busy}>Save forwarding email</button>
      </form>

      {message && <p className="chapter-master-table__error" role="alert">{message}</p>}

      <div className="chapter-master-table__actions">
        {state !== "suspended" ? (
          <>
            <button type="button" disabled={busy || state === "trusted"} onClick={() => handleSetReviewRequired(false)}>Mark Trusted</button>
            <button type="button" disabled={busy || state === "restricted"} onClick={() => handleSetReviewRequired(true)}>Mark Restricted</button>
            <button type="button" disabled={busy} onClick={() => handleSuspendOrRestore("suspend")}>Suspend</button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => handleSuspendOrRestore("restore")}>Restore</button>
        )}
        {retryable && (
          <button type="button" onClick={() => handleSuspendOrRestore(retryAction)}>Retry</button>
        )}
      </div>
    </div>
  );
}
