// Classifies promote-goal-evidence's own known, safe error message strings
// (supabase/functions/promote-goal-evidence/index.ts) into a stable code, so
// the upload UI can distinguish *why* a request was rejected — never by
// guessing from the HTTP status code alone (several entirely different
// reasons all return 403) — and can offer a specific action (e.g. "Edit
// goal") for the cases that have one. The message text itself is always
// shown verbatim; this only decides which extra UI, if any, to layer on
// top of it. Kept in exact sync with that function's literal strings —
// an unrecognized message (including any future addition there) safely
// falls back to "unknown", which still displays correctly on its own.

export const PROMOTE_GOAL_EVIDENCE_ERROR_CODES = {
  "Authentication required.": "AUTH_REQUIRED",
  "Not authorized to add a resource to this goal.": "NOT_AUTHORIZED",
  "Goal not found.": "GOAL_NOT_FOUND",
  "This goal is locked and cannot receive resources.": "GOAL_LOCKED",
  "This goal is not in a state that can receive resources.": "GOAL_NOT_ACTIVE",
  "This goal has no linked government entity.": "MISSING_GOVERNMENT_ENTITY",
  "The private upload path is not within this goal's county.": "COUNTY_PATH_MISMATCH",
  "The uploaded file could not be found or read.": "STAGED_FILE_NOT_FOUND",
  "The document size is outside the allowed range.": "SIZE_OUT_OF_RANGE",
  "The file's content does not match a supported, verifiable document type.": "UNSUPPORTED_FILE",
  "Unsupported document MIME type.": "UNSUPPORTED_FILE",
};

export function classifyPromoteGoalEvidenceError(message) {
  if (typeof message !== "string") return "UNKNOWN";
  if (PROMOTE_GOAL_EVIDENCE_ERROR_CODES[message]) return PROMOTE_GOAL_EVIDENCE_ERROR_CODES[message];
  if (message.startsWith("The document could not be published:")) return "PUBLISH_FAILED";
  if (message.includes("could not be fully rolled back")) return "ROLLBACK_FAILED";
  return "UNKNOWN";
}
