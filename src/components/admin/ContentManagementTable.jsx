import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CONTENT_TYPE_LABELS,
  DEFAULT_SORT_BY_VIEW,
  SORT_OPTIONS,
  activityForView,
  filterManagementRecords,
  recordCountyLabel,
  shortCountyName,
  sortManagementRecords,
  sourceLabel,
  updateTableCriteria,
} from "../../utils/contentManagementUtils";
import "./ContentManagementTable.css";

const PAGE_SIZE = 25;

function formatActivity(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function relatedPostLabel(record) {
  if (record.content_type === "meeting" && record.show_in_status_feed === false) return "Meeting-only";
  return record.show_in_status_feed ? "Attached to public post" : "Attached to hidden post";
}

function Badges({ record }) {
  const badges = [
    record.is_pinned && "Pinned",
    record.admin_edited && "Admin edited",
    record.show_in_status_feed === false && "Hidden from feed",
    record.mass_email_requested && "Email requested",
    record.event_start && "Meeting details",
  ].filter(Boolean);
  return badges.length ? <span className="management-badges">{badges.map((badge) => <small key={badge} title={badge}>{badge}</small>)}</span> : null;
}

function ManagementActions({ record, context, onEdit, getPreviewPath }) {
  const previewPath = getPreviewPath?.(record);
  return <div className="management-actions">
    {previewPath && <Link to={previewPath}>Preview</Link>}
    {onEdit && <button type="button" onClick={() => onEdit(record)}>{context === "admin" && record.status === "pending" ? "Review" : "Edit"}</button>}
  </div>;
}

export default function ContentManagementTable({
  records,
  counties,
  variant = "posts",
  context = "admin",
  activeView,
  sourceLookup = {},
  loading = false,
  error = "",
  showStatus = false,
  onEdit,
  getPreviewPath,
}) {
  const [criteria, setCriteria] = useState({ search: "", county: "all", type: "all", sort: DEFAULT_SORT_BY_VIEW[activeView], page: 1 });
  const updateCriteria = (changes) => setCriteria((current) => updateTableCriteria(current, changes));
  const types = useMemo(() => [...new Set(records.map((record) => record.content_type).filter(Boolean))].sort(), [records]);
  const filtered = useMemo(() => filterManagementRecords(records, criteria), [criteria, records]);
  const sorted = useMemo(() => sortManagementRecords(filtered, criteria.sort, activeView), [activeView, criteria.sort, filtered]);
  const totalPages = Math.max(Math.ceil(sorted.length / PAGE_SIZE), 1);
  const pageRecords = sorted.slice((criteria.page - 1) * PAGE_SIZE, criteria.page * PAGE_SIZE);
  const filtersActive = Boolean(criteria.search || criteria.county !== "all" || criteria.type !== "all");

  if (loading) return <p className="management-state" role="status">Loading records...</p>;
  if (error) return <p className="management-state composer-error" role="alert">{error}</p>;

  return <div className="content-management">
    <div className="management-toolbar">
      <label className="management-search">Search<input type="search" value={criteria.search} onChange={(event) => updateCriteria({ search: event.target.value })} placeholder="Title or summary" /></label>
      {criteria.search && <button type="button" className="management-clear-search" onClick={() => updateCriteria({ search: "" })}>Clear search</button>}
      {context === "admin" && <label>County<select value={criteria.county} onChange={(event) => updateCriteria({ county: event.target.value })}><option value="all">All counties</option><option value="statewide">Statewide</option>{counties.map((county) => <option key={county.id} value={county.id}>{shortCountyName(county.name)}</option>)}</select></label>}
      <label>Type<select value={criteria.type} onChange={(event) => updateCriteria({ type: event.target.value })}><option value="all">All types</option>{types.map((type) => <option key={type} value={type}>{CONTENT_TYPE_LABELS[type] ?? type}</option>)}</select></label>
      <label>Sort<select value={criteria.sort} onChange={(event) => updateCriteria({ sort: event.target.value })}>{SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>

    {!pageRecords.length ? <div className="management-state"><p>{records.length && filtersActive ? "No records match the current filters." : "No records are currently in this workflow."}</p>{filtersActive && <button type="button" onClick={() => setCriteria({ search: "", county: "all", type: "all", sort: DEFAULT_SORT_BY_VIEW[activeView], page: 1 })}>Clear filters</button>}</div> : <>
      <table className="management-table">
        <thead><tr>{variant === "posts" ? <><th>Title</th>{context === "admin" && <th>County</th>}<th>Type</th><th>Source</th><th>Activity</th><th>Media</th>{showStatus && <th>Status</th>}<th>Actions</th></> : <><th>Meeting</th>{context === "admin" && <th>County</th>}<th>Starts</th><th>Location</th><th>Source</th><th>Related post</th>{showStatus && <th>Status</th>}<th>Actions</th></>}</tr></thead>
        <tbody>{pageRecords.map((record) => <ManagementTableRow key={record.id} record={record} variant={variant} context={context} activeView={activeView} sourceLookup={sourceLookup} showStatus={showStatus} onEdit={onEdit} getPreviewPath={getPreviewPath} />)}</tbody>
      </table>
      <div className="management-mobile-list">{pageRecords.map((record) => <ManagementMobileRecord key={record.id} record={record} variant={variant} context={context} activeView={activeView} sourceLookup={sourceLookup} showStatus={showStatus} onEdit={onEdit} getPreviewPath={getPreviewPath} />)}</div>
      {totalPages > 1 && <nav className="management-pagination" aria-label="Publishing queue pages"><button type="button" disabled={criteria.page === 1} onClick={() => setCriteria((current) => ({ ...current, page: current.page - 1 }))}>Previous</button><span>Page {criteria.page} of {totalPages}</span><button type="button" disabled={criteria.page === totalPages} onClick={() => setCriteria((current) => ({ ...current, page: current.page + 1 }))}>Next</button></nav>}
    </>}
  </div>;
}

function ManagementTableRow({ record, variant, context, activeView, sourceLookup, showStatus, onEdit, getPreviewPath }) {
  const activity = activityForView(record, activeView);
  const county = recordCountyLabel(record);
  const related = relatedPostLabel(record);
  return <tr>{variant === "posts" ? <><td className="management-title"><strong>{record.title}</strong>{record.summary && <span>{record.summary}</span>}<Badges record={record} /></td>{context === "admin" && <td title={record.counties?.name ?? "Statewide"}>{county}</td>}<td>{CONTENT_TYPE_LABELS[record.content_type] ?? record.content_type}</td><td>{sourceLabel(record, sourceLookup)}</td><td><time dateTime={activity.value ?? undefined}>{formatActivity(activity.value)}</time><small>{activity.label}</small></td><td>{record.post_media?.length ?? 0}</td>{showStatus && <td>{record.status}</td>}<td><ManagementActions record={record} context={context} onEdit={onEdit} getPreviewPath={getPreviewPath} /></td></> : <><td className="management-title"><strong>{record.title}</strong></td>{context === "admin" && <td title={record.counties?.name ?? "Statewide"}>{county}</td>}<td><time dateTime={record.event_start}>{formatActivity(record.event_start)}</time></td><td>{record.event_location ?? "Not set"}</td><td>{sourceLabel(record, sourceLookup)}</td><td>{related}</td>{showStatus && <td>{record.status}</td>}<td><ManagementActions record={record} context={context} onEdit={onEdit} getPreviewPath={getPreviewPath} /></td></>}</tr>;
}

function ManagementMobileRecord({ record, variant, context, activeView, sourceLookup, showStatus, onEdit, getPreviewPath }) {
  const activity = activityForView(record, activeView);
  return <article className="management-mobile-record"><strong>{record.title}</strong><span>{recordCountyLabel(record)} · {CONTENT_TYPE_LABELS[record.content_type] ?? record.content_type}</span><time dateTime={activity.value ?? undefined}>{activity.label}: {formatActivity(activity.value)}</time><span>Media: {record.post_media?.length ?? 0}</span><Badges record={record} /><details><summary>Details</summary><dl><div><dt>Source</dt><dd>{sourceLabel(record, sourceLookup)}</dd></div>{showStatus && <div><dt>Status</dt><dd>{record.status}</dd></div>}{variant === "meetings" && <><div><dt>Location</dt><dd>{record.event_location ?? "Not set"}</dd></div><div><dt>Related post</dt><dd>{relatedPostLabel(record)}</dd></div></>}</dl></details><ManagementActions record={record} context={context} onEdit={onEdit} getPreviewPath={getPreviewPath} /></article>;
}
