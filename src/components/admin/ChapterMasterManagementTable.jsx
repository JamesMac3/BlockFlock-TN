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

async function invokeAccountAction(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke("admin-account-action", {
    body: { action, ...payload },
  });
  if (error) {
    let message = error.message;
    if (error.context instanceof Response) {
      try {
        const errorBody = await error.context.clone().json();
        message = errorBody?.error ?? message;
      } catch {
        // Keep the generic client error when the response is not JSON.
      }
    }
    throw new Error(message);
  }
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
  const [creatingAccount, setCreatingAccount] = useState(false);

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
      <div className="chapter-master-table__heading">
        <div>
          <h2>Chapter Master Management</h2>
          <p>Create county logins, control access, and manage private forwarding destinations.</p>
        </div>
        <button type="button" onClick={() => setCreatingAccount(true)}>Create chapter account</button>
      </div>

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

      {creatingAccount && (
        <AdminPopout title="Create Chapter Account" onClose={() => setCreatingAccount(false)}>
          <CreateChapterAccountForm
            onCreated={() => { setCreatingAccount(false); load(); }}
          />
        </AdminPopout>
      )}
    </div>
  );
}

function CreateChapterAccountForm({ onCreated }) {
  const [counties, setCounties] = useState([]);
  const [countyId, setCountyId] = useState("");
  const [forwardingEmail, setForwardingEmail] = useState("");
  const [initialState, setInitialState] = useState("restricted");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadCounties() {
      const { data, error } = await supabase.rpc("rrg_admin_list_available_chapter_counties");
      if (!active) return;
      if (error) setMessage(error.message);
      else setCounties(data ?? []);
      setLoading(false);
    }
    loadCounties();
    return () => { active = false; };
  }, []);

  const selectedCounty = counties.find((county) => String(county.county_id) === countyId);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await invokeAccountAction("invite", {
        county_id: Number(countyId),
        forwarding_email: forwardingEmail,
        initial_state: initialState,
      });
      if (!result?.accountCreated) {
        setMessage(result?.error ?? "The account could not be created.");
        return;
      }
      onCreated();
    } catch (error) {
      setMessage(error.message ?? "The account could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="chapter-master-table__create" onSubmit={handleSubmit}>
      <label htmlFor="new-chapter-county">County</label>
      <select
        id="new-chapter-county"
        value={countyId}
        onChange={(event) => setCountyId(event.target.value)}
        disabled={loading || busy}
        required
      >
        <option value="">Select a county</option>
        {counties.map((county) => (
          <option key={county.county_id} value={county.county_id}>{county.county_name}</option>
        ))}
      </select>

      {selectedCounty && (
        <p className="chapter-master-table__login-preview">
          Login: <strong>{selectedCounty.login_email}</strong>
        </p>
      )}

      <label htmlFor="new-chapter-forwarding">Recipient / forwarding email</label>
      <input
        id="new-chapter-forwarding"
        type="email"
        value={forwardingEmail}
        onChange={(event) => setForwardingEmail(event.target.value)}
        maxLength={320}
        disabled={busy}
        required
      />
      <p>This private address receives the setup link and becomes the account's initial forwarding destination.</p>

      <label htmlFor="new-chapter-state">Initial state</label>
      <select
        id="new-chapter-state"
        value={initialState}
        onChange={(event) => setInitialState(event.target.value)}
        disabled={busy}
      >
        <option value="restricted">Restricted</option>
        <option value="trusted">Trusted</option>
        <option value="suspended">Suspended</option>
      </select>
      {initialState === "suspended" && (
        <p>A suspended test account is created and blocked immediately. No setup email is sent until it is restored.</p>
      )}

      {message && <p className="chapter-master-table__error" role="alert">{message}</p>}
      <button type="submit" disabled={busy || loading || !countyId}>
        {busy ? "Creating..." : initialState === "suspended" ? "Create suspended account" : "Create and send setup link"}
      </button>
    </form>
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
      const result = await invokeAccountAction(action, { user_id: row.user_id });
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

  async function handleSendSetupLink() {
    setBusy(true);
    setMessage("");
    try {
      const result = await invokeAccountAction("send_setup_link", { user_id: row.user_id });
      setMessage(result?.invitationSent ? "A new setup link was sent." : result?.error ?? "The setup link could not be sent.");
    } catch (error) {
      setMessage(error.message ?? "The setup link could not be sent.");
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
          maxLength={320}
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
            <button type="button" disabled={busy} onClick={handleSendSetupLink}>Send setup link</button>
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
