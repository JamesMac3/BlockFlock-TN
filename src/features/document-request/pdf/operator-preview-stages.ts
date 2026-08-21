import { TemplateSourceError } from "./supabase-template-loader";
import type { OperatorPreviewReasonCode } from "./operator-preview-readiness";

/**
 * Stage-specific, operator-safe failure reporting for the draft-request
 * preview. The preview runs five distinct stages, and a single catch-all
 * "the preview could not be generated" message made every one of them
 * indistinguishable — an operator could not tell an unapplied migration
 * from a bad template hash from a genuinely incomplete goal.
 *
 * Every message here is safe to render: none of them embeds a Postgres
 * error, a storage path, a URL, a hash, or any part of the request data.
 * The underlying developer error is logged separately by the caller.
 */

export const OPERATOR_PREVIEW_STAGES = [
  "bundle",
  "request_data",
  "template_download",
  "template_integrity",
  "render",
] as const;

export type OperatorPreviewStage = (typeof OPERATOR_PREVIEW_STAGES)[number];

export const OPERATOR_PREVIEW_STAGE_MESSAGES: Record<OperatorPreviewStage, string> = {
  bundle: "Could not load preview data",
  request_data: "Request data is incomplete",
  template_download: "Template could not be downloaded",
  template_integrity: "Template integrity check failed",
  render: "PDF rendering failed",
};

export function operatorPreviewStageMessage(stage: OperatorPreviewStage): string {
  return OPERATOR_PREVIEW_STAGE_MESSAGES[stage];
}

/**
 * Readiness failures are all "the saved goal/profile/entity data is not in a
 * state that can produce a document" — one stage. The readiness result's own
 * message is a curated, already-safe sentence (see
 * operator-preview-readiness.ts) and is shown as the detail line beneath the
 * stage headline rather than replacing it.
 */
export function stageForReadinessCode(_code: OperatorPreviewReasonCode): OperatorPreviewStage {
  return "request_data";
}

const DOWNLOAD_CODES = new Set(["SOURCE_NOT_PUBLISHED", "SOURCE_DOWNLOAD_FAILED"]);
const INTEGRITY_CODES = new Set([
  "SOURCE_METADATA_INVALID",
  "SOURCE_SIZE_MISMATCH",
  "SOURCE_HASH_MISMATCH",
]);

/**
 * Classifies an error thrown while generating the preview document.
 * TemplateSourceError already distinguishes "could not fetch the bytes" from
 * "the bytes are not the verified template"; anything else is a rendering
 * failure. Integrity classification is reporting only — it never relaxes a
 * check, and an integrity failure still aborts the preview.
 */
export function classifyOperatorPreviewError(error: unknown): OperatorPreviewStage {
  const code =
    error instanceof TemplateSourceError
      ? error.code
      : (error as { name?: string; code?: string } | null)?.name === "TemplateSourceError"
        ? (error as { code?: string }).code
        : undefined;

  if (code && DOWNLOAD_CODES.has(code)) return "template_download";
  if (code && INTEGRITY_CODES.has(code)) return "template_integrity";
  return "render";
}
