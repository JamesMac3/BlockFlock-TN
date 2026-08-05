export const CONTENT_TYPE_LABELS = {
  announcement: "Announcement",
  investigation: "Investigation",
  records: "Records",
  meeting: "Meeting",
  action: "Action",
};

export const SORT_OPTIONS = [
  ["activity-desc", "Activity: newest first"],
  ["activity-asc", "Activity: oldest first"],
  ["title-asc", "Title: A–Z"],
  ["title-desc", "Title: Z–A"],
  ["county-asc", "County: A–Z"],
  ["county-desc", "County: Z–A"],
  ["type-asc", "Type: A–Z"],
];

export const DEFAULT_SORT_BY_VIEW = {
  pending: "activity-asc",
  drafts: "activity-desc",
  published: "activity-desc",
  returned: "activity-desc",
  meetings: "activity-asc",
};

export function shortCountyName(name) {
  return String(name ?? "").replace(/ County$/, "");
}

export function recordCountyLabel(record) {
  if (record.scope === "global" || !record.county_id) return "Statewide";
  return shortCountyName(record.counties?.name) || "County";
}

export function sourceLabel(record, sourceLookup = {}) {
  const source = sourceLookup[record.author_user_id];
  if (source?.role === "admin") return "Admin";
  if (source?.role === "chapter_master") {
    return shortCountyName(source.countyName ?? record.counties?.name) || "Chapter";
  }
  return "Contributor";
}

export function activityForView(record, viewId) {
  if (viewId === "pending") return { value: record.submitted_at ?? record.updated_at, label: "Submitted" };
  if (viewId === "drafts") return { value: record.updated_at, label: "Updated" };
  if (viewId === "published") return { value: record.approved_at ?? record.created_at, label: "Published" };
  if (viewId === "returned") return { value: record.rejected_at ?? record.updated_at, label: "Returned" };
  return { value: record.event_start, label: "Starts" };
}

function comparableDate(record, viewId) {
  return new Date(activityForView(record, viewId).value ?? 0).getTime();
}

export function filterManagementRecords(records, { search = "", county = "all", type = "all" }) {
  const query = search.trim().toLocaleLowerCase();
  return records.filter((record) => {
    const matchesSearch = !query || `${record.title ?? ""} ${record.summary ?? ""}`.toLocaleLowerCase().includes(query);
    const matchesCounty = county === "all" ||
      (county === "statewide" ? record.scope === "global" || !record.county_id : String(record.county_id) === String(county));
    const matchesType = type === "all" || record.content_type === type;
    return matchesSearch && matchesCounty && matchesType;
  });
}

export function sortManagementRecords(records, sort, viewId) {
  return [...records].sort((first, second) => {
    if (sort === "activity-asc") return comparableDate(first, viewId) - comparableDate(second, viewId);
    if (sort === "activity-desc") return comparableDate(second, viewId) - comparableDate(first, viewId);
    if (sort === "title-asc") return (first.title ?? "").localeCompare(second.title ?? "");
    if (sort === "title-desc") return (second.title ?? "").localeCompare(first.title ?? "");
    if (sort === "county-asc") return recordCountyLabel(first).localeCompare(recordCountyLabel(second));
    if (sort === "county-desc") return recordCountyLabel(second).localeCompare(recordCountyLabel(first));
    if (sort === "type-asc") return (CONTENT_TYPE_LABELS[first.content_type] ?? first.content_type).localeCompare(CONTENT_TYPE_LABELS[second.content_type] ?? second.content_type);
    return 0;
  });
}

export function updateTableCriteria(current, changes) {
  return { ...current, ...changes, page: 1 };
}
