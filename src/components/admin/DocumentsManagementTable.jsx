import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePortalAuth } from "../../auth/portalAuth";
import { classifyRpcError } from "../../features/portal-admin/rpcErrors";
import { clampPageSize, resetPageOnQueryChange } from "../../features/portal-admin/pagination";
import AdminStatePanel from "./AdminStatePanel";
import AdminPagination from "./AdminPagination";
import AdminPopout from "./AdminPopout";
import "./ContentManagementTable.css";
import "./DocumentsManagementTable.css";

const SORT_OPTIONS = [
  ["uploaded_at", "Uploaded date"],
  ["title", "Title"],
  ["county", "County"],
];

// Chapter masters see only documents associated with goals/entities in
// their own county (the RPC itself is server-authoritative about this —
// countyId here only narrows which county's records are requested, it is
// never trusted as the actual authorization boundary). Admins may browse
// every county, and additionally toggle an "orphaned records" view of
// evidence that was intended for the public archive but is no longer
// linked to any goal — flagged for later manual review, never a delete
// action offered from this table.
export default function DocumentsManagementTable() {
  const { account, assignedCounty } = usePortalAuth();
  const isAdmin = account?.role === "admin";

  const [view, setView] = useState("documents");
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadState, setLoadState] = useState("loading");
  const [errorKind, setErrorKind] = useState(null);
  const [criteria, setCriteria] = useState({
    search: "", countyId: isAdmin ? "" : String(assignedCounty?.id ?? ""),
    sort: "uploaded_at", sortDirection: "desc", page: 1, pageSize: 25,
  });
  const [editingLinkId, setEditingLinkId] = useState(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    setErrorKind(null);

    const rpcName = view === "orphaned" ? "rrg_admin_list_orphaned_documents" : "rrg_list_documents";
    const params = view === "orphaned"
      ? {
          p_county_id: criteria.countyId ? Number(criteria.countyId) : null,
          p_page: criteria.page,
          p_page_size: clampPageSize(criteria.pageSize),
        }
      : {
          p_search: criteria.search || null,
          p_county_id: criteria.countyId ? Number(criteria.countyId) : null,
          p_sort: criteria.sort,
          p_sort_direction: criteria.sortDirection,
          p_page: criteria.page,
          p_page_size: clampPageSize(criteria.pageSize),
        };

    const { data, error } = await supabase.rpc(rpcName, params);

    if (error) {
      console.error("Failed to load documents:", error);
      setErrorKind(classifyRpcError(error));
      setLoadState("error");
      return;
    }

    const loadedRows = data ?? [];
    setRows(loadedRows);
    setTotalCount(loadedRows[0]?.total_count ?? 0);
    if (loadedRows.length === 0) {
      setLoadState(criteria.search || criteria.countyId ? "no-matches" : "empty");
    } else {
      setLoadState("ready");
    }
  }, [view, criteria]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function updateCriteria(changes) {
    setCriteria((current) => resetPageOnQueryChange(current, changes));
  }

  const editingRow = rows.find((row) => row.link_id === editingLinkId) ?? null;

  return (
    <div className="content-management documents-management-table">
      <h2>County Documents</h2>

      {isAdmin && (
        <div className="management-toolbar documents-management-table__view-toggle">
          <button type="button" className={view === "documents" ? "is-active" : ""} onClick={() => setView("documents")}>
            Documents
          </button>
          <button type="button" className={view === "orphaned" ? "is-active" : ""} onClick={() => setView("orphaned")}>
            Orphaned records
          </button>
        </div>
      )}

      <div className="management-toolbar">
        {view === "documents" && (
          <label>
            Search
            <input
              type="search"
              value={criteria.search}
              onChange={(event) => updateCriteria({ search: event.target.value })}
              placeholder="Title, goal, or government entity"
            />
          </label>
        )}
        {isAdmin && (
          <label>
            County
            <input
              type="number"
              value={criteria.countyId}
              onChange={(event) => updateCriteria({ countyId: event.target.value })}
              placeholder="All counties"
            />
          </label>
        )}
        {view === "documents" && (
          <>
            <label>
              Sort by
              <select value={criteria.sort} onChange={(event) => updateCriteria({ sort: event.target.value })}>
                {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Direction
              <select value={criteria.sortDirection} onChange={(event) => updateCriteria({ sortDirection: event.target.value })}>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
          </>
        )}
      </div>

      {loadState === "loading" || loadState === "error" || loadState === "empty" || loadState === "no-matches" ? (
        <AdminStatePanel
          state={loadState}
          errorKind={errorKind}
          onRetry={load}
          emptyMessage={view === "orphaned" ? "No orphaned records." : "No documents yet."}
          noMatchesMessage="No documents match the current filters."
        />
      ) : (
        <>
          <table className="management-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Document type</th>
                <th>Associated goal</th>
                <th>Government entity</th>
                <th>Uploaded date</th>
                <th>Uploaded by</th>
                <th>Reviewed by</th>
                <th>Archive state</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.link_id ?? row.evidence_id} className={view === "orphaned" ? "documents-management-table__row--orphaned" : ""}>
                  <td>{row.title}</td>
                  <td>{row.document_type}</td>
                  <td>{row.associated_goal ?? "—"}</td>
                  <td>{row.government_entity ?? "—"}</td>
                  <td>{row.uploaded_at ? new Date(row.uploaded_at).toLocaleDateString() : "Not recorded"}</td>
                  <td>{row.uploaded_by ?? "Not recorded"}</td>
                  <td>{row.reviewed_by ?? "Not recorded"}</td>
                  <td>{view === "orphaned" ? "Orphaned" : (row.archive_state ?? "—")}</td>
                  <td className="management-actions">
                    {view === "documents" && (
                      <button type="button" onClick={() => setEditingLinkId(row.link_id)} aria-label={`Manage ${row.title}`}>
                        ✎ Manage
                      </button>
                    )}
                    {row.evidence_id && (
                      <a href={`/portal/documents/${row.evidence_id}`} target="_blank" rel="noopener noreferrer">
                        View
                      </a>
                    )}
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

      {editingRow && (
        <AdminPopout title={`Manage: ${editingRow.title}`} onClose={() => setEditingLinkId(null)}>
          <DocumentEditor row={editingRow} onChanged={() => { setEditingLinkId(null); load(); }} />
        </AdminPopout>
      )}
    </div>
  );
}

function DocumentEditor({ row, onChanged }) {
  const [title, setTitle] = useState(row.title ?? "");
  const [description, setDescription] = useState(row.public_description ?? "");
  const [targetGoalId, setTargetGoalId] = useState("");
  const [goalOptions, setGoalOptions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmingDisassociate, setConfirmingDisassociate] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadGoals() {
      if (!row.county_id) return;
      const { data } = await supabase
        .from("county_records_request_goals")
        .select("id, title")
        .eq("county_id", row.county_id)
        .order("title");
      if (active) setGoalOptions(data ?? []);
    }
    loadGoals();
    return () => { active = false; };
  }, [row.county_id]);

  async function handleSaveMetadata(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("rrg_update_document_metadata", {
      p_link_id: row.link_id,
      p_title: title,
      p_public_description: description || null,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    onChanged();
  }

  async function handleMove() {
    if (!targetGoalId) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("rrg_move_document_to_goal", {
      p_link_id: row.link_id,
      p_target_goal_id: Number(targetGoalId),
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    onChanged();
  }

  async function handleDisassociate() {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("rrg_disassociate_document", { p_link_id: row.link_id });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    onChanged();
  }

  return (
    <div className="documents-management-table__editor">
      <form onSubmit={handleSaveMetadata}>
        <label htmlFor="doc-editor-title">Public title</label>
        <input id="doc-editor-title" type="text" value={title} onChange={(event) => setTitle(event.target.value)} required />
        <label htmlFor="doc-editor-description">Public description</label>
        <textarea id="doc-editor-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
        <button type="submit" disabled={busy}>Save title/description</button>
      </form>

      <div className="documents-management-table__editor-section">
        <label htmlFor="doc-editor-move">Move to another goal in this county</label>
        <select id="doc-editor-move" value={targetGoalId} onChange={(event) => setTargetGoalId(event.target.value)}>
          <option value="">Select a goal…</option>
          {goalOptions.filter((goal) => String(goal.id) !== String(row.goal_id)).map((goal) => (
            <option key={goal.id} value={goal.id}>{goal.title}</option>
          ))}
        </select>
        <button type="button" disabled={busy || !targetGoalId} onClick={handleMove}>Move document</button>
      </div>

      <div className="documents-management-table__editor-section">
        {confirmingDisassociate ? (
          <div className="documents-management-table__confirm">
            <p>Remove this document from its goal? The stored file itself will not be deleted.</p>
            <button type="button" disabled={busy} onClick={handleDisassociate}>Confirm disassociate</button>
            <button type="button" disabled={busy} onClick={() => setConfirmingDisassociate(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="documents-management-table__danger" disabled={busy} onClick={() => setConfirmingDisassociate(true)}>
            Disassociate from goal
          </button>
        )}
      </div>

      {row.evidence_id && (
        <a href={`/portal/documents/${row.evidence_id}`} target="_blank" rel="noopener noreferrer">
          Open document viewer
        </a>
      )}

      {message && <p className="documents-management-table__error" role="alert">{message}</p>}
    </div>
  );
}
