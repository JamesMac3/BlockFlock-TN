import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePortalAuth } from "../../auth/portalAuth";
import { classifyRpcError } from "../../features/portal-admin/rpcErrors";
import { clampPageSize, resetPageOnQueryChange } from "../../features/portal-admin/pagination";
import { chicagoWallTimeToUtcIso, toChicagoDateTimeLocalValue, formatChicagoDateTime } from "../../features/portal-admin/chicagoTime";
import AdminStatePanel from "./AdminStatePanel";
import AdminPagination from "./AdminPagination";
import AdminPopout from "./AdminPopout";
import "./ContentManagementTable.css";
import "./MeetingsManagementTable.css";

const VIEW_STATUS = {
  upcoming: "scheduled",
  expired: "expired",
  cancelled: "cancelled",
};

const VIEWS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "expired", label: "Expired" },
  { id: "cancelled", label: "Cancelled" },
];

function locationSummary(row) {
  return [row.location_name, row.street_address, row.city, row.state, row.postal_code].filter(Boolean).join(", ");
}

export default function MeetingsManagementTable() {
  const { account, assignedCounty } = usePortalAuth();
  const isAdmin = account?.role === "admin";

  const [view, setView] = useState("upcoming");
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadState, setLoadState] = useState("loading");
  const [errorKind, setErrorKind] = useState(null);
  const [criteria, setCriteria] = useState({ countyId: "", page: 1, pageSize: 25 });
  const [counties, setCounties] = useState([]);
  const [editingMeeting, setEditingMeeting] = useState(undefined); // undefined = closed, null = creating, object = editing
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadCounties() {
      const { data } = await supabase.from("counties").select("id, name").order("name");
      if (active) setCounties(data ?? []);
    }
    loadCounties();
    return () => { active = false; };
  }, []);

  const load = useCallback(async () => {
    setLoadState("loading");
    setErrorKind(null);
    const { data, error } = await supabase.rpc("rrg_list_meetings", {
      p_status: VIEW_STATUS[view],
      p_county_id: criteria.countyId ? Number(criteria.countyId) : null,
      p_page: criteria.page,
      p_page_size: clampPageSize(criteria.pageSize),
    });

    if (error) {
      console.error("Failed to load meetings:", error);
      setErrorKind(classifyRpcError(error));
      setLoadState("error");
      return;
    }

    const loadedRows = data ?? [];
    setRows(loadedRows);
    setTotalCount(loadedRows[0]?.total_count ?? 0);
    setLoadState(loadedRows.length === 0 ? (criteria.countyId ? "no-matches" : "empty") : "ready");
  }, [view, criteria]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function updateCriteria(changes) {
    setCriteria((current) => resetPageOnQueryChange(current, changes));
  }

  function canManage(row) {
    if (isAdmin) return true;
    return row.county_id != null && String(row.county_id) === String(assignedCounty?.id);
  }

  async function handleRunCleanup() {
    setCleanupBusy(true);
    setCleanupMessage("");
    const { data, error } = await supabase.rpc("rrg_admin_expire_past_meetings");
    setCleanupBusy(false);
    if (error) {
      setCleanupMessage(error.message);
      return;
    }
    setCleanupMessage(`${data ?? 0} meeting(s) marked expired.`);
    load();
  }

  async function handleCancel(row) {
    if (!confirm(`Cancel "${row.title}"? This preserves the meeting and its audit history — it will not be deleted.`)) return;
    const { error } = await supabase.rpc("rrg_cancel_meeting", { p_meeting_id: row.id });
    if (error) {
      alert(error.message);
      return;
    }
    load();
  }

  return (
    <div className="content-management meetings-management-table">
      <h2>Meetings</h2>

      <div className="management-toolbar meetings-management-table__view-toggle">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? "is-active" : ""}
            onClick={() => { setView(item.id); updateCriteria({}); }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="management-toolbar">
        <label>
          County
          <select value={criteria.countyId} onChange={(event) => updateCriteria({ countyId: event.target.value })}>
            <option value="">All counties</option>
            {counties.map((county) => <option key={county.id} value={county.id}>{county.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setEditingMeeting(null)}>+ New meeting</button>
        {isAdmin && (
          <button type="button" disabled={cleanupBusy} onClick={handleRunCleanup}>
            {cleanupBusy ? "Running…" : "Run cleanup now"}
          </button>
        )}
      </div>
      {cleanupMessage && <p role="status" className="meetings-management-table__cleanup-message">{cleanupMessage}</p>}

      {loadState === "loading" || loadState === "error" || loadState === "empty" || loadState === "no-matches" ? (
        <AdminStatePanel
          state={loadState}
          errorKind={errorKind}
          onRetry={load}
          emptyMessage="No meetings in this view yet."
          noMatchesMessage="No meetings match the current filters."
        />
      ) : (
        <>
          <table className="management-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>County</th>
                <th>Date/time (Central)</th>
                <th>Location</th>
                <th>Source post</th>
                <th>Pinned</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{row.county_name ?? "Statewide"}</td>
                  <td>{formatChicagoDateTime(row.starts_at)}</td>
                  <td>{locationSummary(row)}</td>
                  <td>{row.source_post_id ? `Post #${row.source_post_id}` : "—"}</td>
                  <td>{row.is_pinned_statewide ? "Pinned statewide" : "—"}</td>
                  <td>{row.status}</td>
                  <td className="management-actions">
                    {row.status === "scheduled" && canManage(row) && !row.source_post_id && (
                      <button type="button" onClick={() => setEditingMeeting(row)} aria-label={`Edit ${row.title}`}>
                        ✎ Edit
                      </button>
                    )}
                    {row.status === "scheduled" && canManage(row) && (
                      <button type="button" onClick={() => handleCancel(row)} aria-label={`Cancel ${row.title}`}>
                        Cancel
                      </button>
                    )}
                    {row.status === "scheduled" && row.source_post_id && (
                      <span className="meetings-management-table__hint">Managed via post</span>
                    )}
                    {row.status === "scheduled" && !canManage(row) && (
                      <span className="meetings-management-table__hint">View only</span>
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

      {editingMeeting !== undefined && (
        <AdminPopout title={editingMeeting ? `Edit: ${editingMeeting.title}` : "New meeting"} onClose={() => setEditingMeeting(undefined)}>
          <MeetingEditor
            meeting={editingMeeting}
            isAdmin={isAdmin}
            counties={counties}
            assignedCounty={assignedCounty}
            onSaved={() => { setEditingMeeting(undefined); load(); }}
          />
        </AdminPopout>
      )}
    </div>
  );
}

function MeetingEditor({ meeting, isAdmin, counties, assignedCounty, onSaved }) {
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [pinned, setPinned] = useState(Boolean(meeting?.is_pinned_statewide));
  const [countyId, setCountyId] = useState(meeting?.county_id ? String(meeting.county_id) : (isAdmin ? "" : String(assignedCounty?.id ?? "")));
  const [startsAtLocal, setStartsAtLocal] = useState(toChicagoDateTimeLocalValue(meeting?.starts_at));
  const [locationName, setLocationName] = useState(meeting?.location_name ?? "");
  const [streetAddress, setStreetAddress] = useState(meeting?.street_address ?? "");
  const [city, setCity] = useState(meeting?.city ?? "");
  const [postalCode, setPostalCode] = useState(meeting?.postal_code ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const startsAtIso = chicagoWallTimeToUtcIso(startsAtLocal);
    if (!startsAtIso) {
      setError("A meeting date and time are required.");
      return;
    }
    if (!pinned && !countyId) {
      setError("A county is required unless this is a statewide pinned meeting.");
      return;
    }

    setBusy(true);
    const { error: rpcError } = await supabase.rpc("rrg_upsert_meeting", {
      p_meeting_id: meeting?.id ?? null,
      p_title: title,
      p_county_id: pinned ? null : Number(countyId),
      p_starts_at: startsAtIso,
      p_location_name: locationName,
      p_street_address: streetAddress,
      p_city: city,
      p_state: "TN",
      p_postal_code: postalCode || null,
      p_is_pinned_statewide: pinned,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onSaved();
  }

  return (
    <form className="meetings-management-table__editor" onSubmit={handleSubmit}>
      <label htmlFor="meeting-title">Title</label>
      <input id="meeting-title" type="text" value={title} onChange={(event) => setTitle(event.target.value)} required />

      {isAdmin && (
        <label className="meetings-management-table__checkbox">
          <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
          Statewide pinned meeting (no county)
        </label>
      )}

      {!pinned && (
        <>
          <label htmlFor="meeting-county">County</label>
          {isAdmin ? (
            <select id="meeting-county" value={countyId} onChange={(event) => setCountyId(event.target.value)} required>
              <option value="">Select a county…</option>
              {counties.map((county) => <option key={county.id} value={county.id}>{county.name}</option>)}
            </select>
          ) : (
            <input id="meeting-county" type="text" value={assignedCounty?.name ?? ""} disabled readOnly />
          )}
        </>
      )}

      <label htmlFor="meeting-starts-at">Date and time (Central)</label>
      <input
        id="meeting-starts-at"
        type="datetime-local"
        value={startsAtLocal}
        onChange={(event) => setStartsAtLocal(event.target.value)}
        required
      />

      <label htmlFor="meeting-location-name">Location / venue name</label>
      <input id="meeting-location-name" type="text" value={locationName} onChange={(event) => setLocationName(event.target.value)} required />

      <label htmlFor="meeting-street">Street address</label>
      <input id="meeting-street" type="text" value={streetAddress} onChange={(event) => setStreetAddress(event.target.value)} required />

      <label htmlFor="meeting-city">City</label>
      <input id="meeting-city" type="text" value={city} onChange={(event) => setCity(event.target.value)} required />

      <label htmlFor="meeting-state">State</label>
      <input id="meeting-state" type="text" value="TN" disabled readOnly />

      <label htmlFor="meeting-postal">ZIP code (optional)</label>
      <input id="meeting-postal" type="text" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} pattern="^[0-9]{5}(-[0-9]{4})?$" />

      {error && <p className="meetings-management-table__error" role="alert">{error}</p>}

      <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save meeting"}</button>
    </form>
  );
}
