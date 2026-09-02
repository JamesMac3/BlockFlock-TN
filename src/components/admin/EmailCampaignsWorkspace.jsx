import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { classifyRpcError } from "../../features/portal-admin/rpcErrors";
import { clampPageSize, resetPageOnQueryChange } from "../../features/portal-admin/pagination";
import AdminStatePanel from "./AdminStatePanel";
import AdminPagination from "./AdminPagination";
import AdminPopout from "./AdminPopout";
import StatusPostCard from "../status/StatusPostCard";
import "./ContentManagementTable.css";
import "./EmailCampaignsWorkspace.css";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "requested", label: "Requested" },
  { value: "approved", label: "Approved" },
  { value: "sending", label: "Sending" },
  { value: "sent", label: "Sent" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Failed" },
];

export default function EmailCampaignsWorkspace() {
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadState, setLoadState] = useState("loading");
  const [errorKind, setErrorKind] = useState(null);
  const [criteria, setCriteria] = useState({ status: "", page: 1, pageSize: 25 });
  const [reviewingCampaignId, setReviewingCampaignId] = useState(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    setErrorKind(null);
    const { data, error } = await supabase.rpc("rrg_list_email_campaigns", {
      p_status: criteria.status || null,
      p_page: criteria.page,
      p_page_size: clampPageSize(criteria.pageSize),
    });

    if (error) {
      console.error("Failed to load email campaigns:", error);
      setErrorKind(classifyRpcError(error));
      setLoadState("error");
      return;
    }

    const loadedRows = data ?? [];
    setRows(loadedRows);
    setTotalCount(loadedRows[0]?.total_count ?? 0);
    setLoadState(loadedRows.length === 0 ? (criteria.status ? "no-matches" : "empty") : "ready");
  }, [criteria]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function updateCriteria(changes) {
    setCriteria((current) => resetPageOnQueryChange(current, changes));
  }

  const reviewingRow = rows.find((row) => row.id === reviewingCampaignId) ?? null;

  return (
    <div className="content-management email-campaigns-workspace">
      <h2>Email Campaigns</h2>

      <div className="management-toolbar email-campaigns-workspace__toolbar">
        <label>
          Status
          <select value={criteria.status} onChange={(event) => updateCriteria({ status: event.target.value })}>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {/* A manual Refresh action, not an automatic polling loop — delivery
            totals update only when an admin asks for them. */}
        <button type="button" className="is-secondary email-campaigns-workspace__refresh" onClick={load}>
          Refresh
        </button>
      </div>

      {loadState !== "ready" ? (
        <AdminStatePanel
          state={loadState}
          errorKind={errorKind}
          onRetry={load}
          emptyMessage="No email campaigns have been requested yet."
          noMatchesMessage="No campaigns match the current filter."
        />
      ) : (
        <>
          <table className="management-table">
            <thead>
              <tr>
                <th>Post</th>
                <th>Audience</th>
                <th>Subject</th>
                <th>Requested</th>
                <th>Status</th>
                <th>Recipients</th>
                <th>Delivery totals</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.post_title}</td>
                  <td>
                    {row.target_scope === "global" ? (
                      <span className="email-campaigns-workspace__statewide-badge">Statewide</span>
                    ) : (row.county_name ?? "—")}
                  </td>
                  <td>{row.subject}</td>
                  <td>{row.requested_at ? new Date(row.requested_at).toLocaleString() : "—"}</td>
                  <td>
                    <span className={`email-campaigns-workspace__status email-campaigns-workspace__status--${row.status}`}>
                      {row.status}
                    </span>
                  </td>
                  <td>{row.recipient_count}</td>
                  <td className="email-campaigns-workspace__totals">
                    Sent {row.sent_count} · Delivered {row.delivered_count} · Bounced {row.bounced_count} · Complained {row.complained_count} · Failed {row.failed_count}
                  </td>
                  <td className="management-actions">
                    <button type="button" onClick={() => setReviewingCampaignId(row.id)}>
                      {row.status === "requested" ? "Review" : "View"}
                    </button>
                  </td>
                </tr>
              ))}
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

      {reviewingRow && (
        <AdminPopout title={`Email campaign: ${reviewingRow.post_title}`} onClose={() => setReviewingCampaignId(null)}>
          <CampaignReviewPanel row={reviewingRow} onChanged={() => { setReviewingCampaignId(null); load(); }} />
        </AdminPopout>
      )}
    </div>
  );
}

function CampaignReviewPanel({ row, onChanged }) {
  const [postPreview, setPostPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const actionLockRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadPreview() {
      const { data, error } = await supabase
        .from("posts")
        .select("*, counties(id, name, slug), post_media(*)")
        .eq("id", row.post_id)
        .single();
      if (!active) return;
      if (error || !data) {
        console.error("Post preview load failed:", error);
        setPreviewError("The post preview could not be loaded.");
        return;
      }
      setPostPreview(data);
    }
    loadPreview();
    return () => { active = false; };
  }, [row.post_id]);

  async function review(approve) {
    if (actionLockRef.current) return;
    if (approve && row.target_scope === "global") {
      const confirmed = window.confirm(
        "This is a STATEWIDE email campaign. Approving it sends the message to active subscribers in every county. Approve it?"
      );
      if (!confirmed) return;
    }
    actionLockRef.current = true;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("rrg_admin_review_email_campaign", {
      p_campaign_id: row.id,
      p_approve: approve,
      p_review_note: reviewNote.trim() || null,
    });
    setBusy(false);
    if (error) {
      console.error("Email campaign review failed:", error);
      setMessage("This action could not be completed. Please try again.");
      actionLockRef.current = false;
      return;
    }
    onChanged();
  }

  return (
    <div className="email-campaigns-workspace__review">
      <dl>
        <div>
          <dt>Audience</dt>
          <dd>{row.target_scope === "global" ? "Statewide — every active subscriber" : `${row.county_name} County only`}</dd>
        </div>
        <div><dt>Subject</dt><dd>{row.subject}</dd></div>
        <div><dt>Status</dt><dd>{row.status}</dd></div>
        <div><dt>Recipients</dt><dd>{row.recipient_count}</dd></div>
      </dl>

      {row.target_scope === "global" && (
        <p className="email-campaigns-workspace__statewide-warning" role="alert">
          This is a statewide campaign. Approving it sends to active subscribers in every county.
        </p>
      )}

      <div className="email-campaigns-workspace__preview">
        <h4>Post preview</h4>
        {previewError && <p className="composer-error" role="alert">{previewError}</p>}
        {postPreview
          ? <StatusPostCard post={postPreview} countyName={postPreview.counties?.name ?? "Tennessee"} />
          : !previewError && <p role="status">Loading preview…</p>}
      </div>

      {row.status === "requested" ? (
        <>
          <label>Review note (optional)<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} rows={3} /></label>
          {message && <p className="composer-error" role="alert">{message}</p>}
          <div className="email-campaigns-workspace__actions">
            <button type="button" disabled={busy} onClick={() => review(false)}>Reject</button>
            <button type="button" disabled={busy} onClick={() => review(true)}>Approve</button>
          </div>
        </>
      ) : (
        <p className="email-campaigns-workspace__reviewed-note">
          This campaign has already been reviewed (status: {row.status}); no further action is available here.
        </p>
      )}
    </div>
  );
}
