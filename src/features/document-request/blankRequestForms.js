import { friendlyDownloadFilename } from "../portal-admin/archiveDocumentType";

// Public blank request forms (docs/public-blank-request-forms.md) are
// independent templates — they are not goal-linked evidence, so they are
// read through get_public_blank_request_forms, never
// get_public_archive_document (which requires goal links). File URLs are
// only ever built from the bucket/path the RPC returned, never from the
// page URL.

export const BLANK_FORMS_RPC = "get_public_blank_request_forms";
export const BLANK_FORMS_BUCKET = "request-templates";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isEvidenceId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

// A malformed id makes Postgres reject the uuid parameter (22P02) — that is
// "no such document", not a transient failure worth a retry button.
export function classifyBlankFormLookupError(error) {
  if (!error) return null;
  if (error.code === "22P02") return "not-found";
  return "error";
}

// Defense in depth on top of the RPC's own filter: the viewer only ever
// builds a URL for a PDF in the request-templates bucket with a plain
// relative object path.
export function isUsableBlankForm(row) {
  return Boolean(
    row
      && row.storage_bucket === BLANK_FORMS_BUCKET
      && row.mime_type === "application/pdf"
      && typeof row.storage_path === "string"
      && row.storage_path.length > 0
      && !row.storage_path.startsWith("/")
      && !row.storage_path.split("/").includes(".."),
  );
}

export function blankFormDownloadFilename(row) {
  return friendlyDownloadFilename(row?.title, row?.mime_type ?? "application/pdf");
}

export function blankFormPath(evidenceId) {
  return `/archive/forms/${evidenceId}`;
}

// Returns { viewUrl, downloadUrl } or null when the row is unusable.
// `storage` is supabase.storage (injected so this stays testable).
export function blankFormUrls(storage, row) {
  if (!isUsableBlankForm(row)) return null;
  const bucket = storage.from(BLANK_FORMS_BUCKET);
  const viewUrl = bucket.getPublicUrl(row.storage_path)?.data?.publicUrl ?? null;
  const downloadUrl = bucket.getPublicUrl(row.storage_path, { download: blankFormDownloadFilename(row) })?.data?.publicUrl ?? null;
  if (!viewUrl || !downloadUrl) return null;
  return { viewUrl, downloadUrl };
}
