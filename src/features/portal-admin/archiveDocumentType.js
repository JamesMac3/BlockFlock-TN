// Pure helpers for the unified public archive table: merging the static
// blank-form manifest with the get_public_archive_documents() RPC rows into
// one consistent row shape, deciding whether a document renders inline or
// as a download-only card, and building a friendly download filename.
// Mirrors the MIME allowlist enforced server-side in
// rrg_complete_goal_with_evidence and the promote-goal-evidence Edge
// Function — kept in sync deliberately, not derived from them, since this
// module has no access to the database at build time.

export const NOT_RECORDED = "Not recorded";

const MIME_EXTENSIONS = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/tiff": "tiff",
  "message/rfc822": "eml",
  "text/csv": "csv",
  "text/plain": "txt",
};

export const ALLOWED_UPLOAD_MIME_TYPES = Object.keys(MIME_EXTENSIONS);
export const MAX_UPLOAD_SIZE_BYTES = 52428800; // 50 MiB, matches the live public-records-archive bucket limit.

export function extensionForMimeType(mimeType) {
  return MIME_EXTENSIONS[mimeType] ?? null;
}

export function isInlineViewable(mimeType) {
  return mimeType === "application/pdf" || (typeof mimeType === "string" && mimeType.startsWith("image/"));
}

export function friendlyDownloadFilename(title, mimeType) {
  const extension = MIME_EXTENSIONS[mimeType];
  const safeTitle = (title || "document").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return extension ? `${safeTitle}.${extension}` : safeTitle;
}

// Manifest entries (src/config/documentManifest.js) become archive rows
// with document_type "Template" and route to /documents/:slug — they have
// no upload/uploader/reviewer metadata, so those fields are explicitly
// "Not recorded" rather than blank, matching every other row's convention.
export function manifestEntryToArchiveRow(slug, entry) {
  return {
    key: `manifest-${slug}`,
    evidenceId: null,
    slug,
    title: entry.title,
    documentType: "Template",
    county: entry.county ?? NOT_RECORDED,
    governmentEntity: entry.governmentEntity ?? NOT_RECORDED,
    goalTitles: [],
    uploadDate: null,
    uploadedBy: NOT_RECORDED,
    reviewedBy: NOT_RECORDED,
    href: `/documents/${slug}`,
  };
}

export function rpcRowToArchiveRow(row) {
  return {
    key: `evidence-${row.evidence_id}`,
    evidenceId: row.evidence_id,
    slug: null,
    title: row.title,
    documentType: row.document_type,
    county: row.county ?? NOT_RECORDED,
    governmentEntity: row.government_entity ?? NOT_RECORDED,
    goalTitles: row.goal_titles ?? [],
    uploadDate: row.upload_date ?? null,
    uploadedBy: row.uploaded_by ?? NOT_RECORDED,
    reviewedBy: row.reviewed_by ?? NOT_RECORDED,
    href: `/archive/documents/${row.evidence_id}`,
  };
}

export function mergeArchiveRows(manifestEntries, rpcRows) {
  const manifestRows = Object.entries(manifestEntries ?? {}).map(([slug, entry]) => manifestEntryToArchiveRow(slug, entry));
  const documentRows = (rpcRows ?? []).map(rpcRowToArchiveRow);
  return [...manifestRows, ...documentRows];
}

export function matchesArchiveSearch(row, rawSearch) {
  const search = (rawSearch ?? "").trim().toLowerCase();
  if (!search) return true;
  const haystacks = [
    row.title,
    row.county,
    row.governmentEntity,
    row.uploadedBy,
    row.reviewedBy,
    ...(row.goalTitles ?? []),
  ];
  return haystacks.some((value) => typeof value === "string" && value.toLowerCase().includes(search));
}

export function sortArchiveRows(rows, sortKey, direction = "desc") {
  const factor = direction === "asc" ? 1 : -1;
  const compareText = (a, b) => (a ?? "").localeCompare(b ?? "");
  const comparators = {
    title: (a, b) => compareText(a.title, b.title),
    document_type: (a, b) => compareText(a.documentType, b.documentType),
    county: (a, b) => compareText(a.county, b.county),
    upload_date: (a, b) => (a.uploadDate ?? "").localeCompare(b.uploadDate ?? ""),
    uploaded_by: (a, b) => compareText(a.uploadedBy, b.uploadedBy),
    reviewed_by: (a, b) => compareText(a.reviewedBy, b.reviewedBy),
  };
  const comparator = comparators[sortKey] ?? comparators.upload_date;
  return [...rows].sort((a, b) => factor * comparator(a, b));
}
