// Every import of an error *class* below is type-only and erased at build
// time — acroform-renderer.ts, overlay-renderer.ts, and letter-renderer.tsx
// each pull in pdf-lib/fontkit/@react-pdf-renderer, which this app only
// ever loads via dynamic import once a visitor actually generates a
// document (see generate-request-document.ts's own module comment). A
// runtime (value) import of those classes here — this module is imported
// eagerly by always-mounted UI like OperatorDraftPreviewButton.jsx and
// RecordsRequestGoalsTiers.jsx — would drag all three libraries back into
// the initial bundle for every visitor. Errors are identified by their
// `.name` string instead of `instanceof`, exactly like this repo's
// existing classifyOperatorPreviewError already did for TemplateSourceError
// for the same reason.
import type { AcroformRendererError } from "./acroform-renderer";
import type { OverlayRendererError } from "./overlay-renderer";
import type { LetterRendererError } from "./letter-renderer";
import type { PlaceholderResolutionError } from "./placeholder-resolver";
import type { TemplateSourceError } from "./supabase-template-loader";
import type { OutputValidationError } from "./output-validator";
import type { TemplateResolverError } from "./template-resolver";
import { friendlyFieldName, friendlyFieldPhrase, isGovernmentEntityField } from "./field-labels";

/**
 * Turns whatever the document-generation pipeline actually threw into a
 * message an admin or chapter master can act on, instead of the single
 * catch-all "PDF rendering failed" that previously hid every distinct
 * failure — an explicit character-limit violation, a layout overflow that
 * has no configured character limit at all, a missing required field, an
 * unsupported PDF field type, an unavailable/corrupt template, or missing
 * continuation-page support all now get their own explanation.
 *
 * Confirmed regression this exists for: the utility profile for goal 24
 * failed with OverlayRendererError code TEXT_OVERFLOW on
 * request.records_description — a layout problem (the text doesn't fit the
 * verified overlay box at this font/width), not a character-count limit
 * (overlay fields have no max_length at all; only acroform text fields do).
 * The two must never be conflated: only an actual configured max_length
 * violation reports a character count and a maximum.
 *
 * Every renderer/resolver/validator in this pipeline wraps the real
 * underlying failure in its own `causeValue` (see each class's own file)
 * rather than using the native Error.cause — resolveAndRenderTemplate in
 * particular always re-wraps a renderer's own error as a generic
 * TemplateResolverError("RENDERER_FAILED", ...) before it reaches a caller.
 * This walks that whole causeValue chain looking for the deepest
 * recognized, specific error rather than only inspecting the outermost
 * wrapper — which is exactly what made every renderer failure
 * indistinguishable before this module existed.
 */

export type RenderFailureCategory =
  | "character_limit"
  | "layout_overflow"
  | "missing_required"
  | "unsupported_field"
  | "template_unavailable"
  | "file_integrity"
  | "continuation_unavailable"
  | "unexpected";

export type RenderFailureExplanation = Readonly<{
  category: RenderFailureCategory;
  /** Stable, safe-to-log diagnostic code — never a raw Postgres/storage message. */
  code: string;
  /** Safe to render to the user. */
  headline: string;
  /** Safe to render to the user; an additional, optional sentence. */
  detail?: string;
}>;

const MAX_CHAIN_DEPTH = 8;

function missingRequiredExplanation(source: string | undefined, code: string): RenderFailureExplanation {
  const name = source ? friendlyFieldName(source) : "A required field";
  const detail = source && isGovernmentEntityField(source)
    ? "Update the government entity's record with this information, then save and preview again."
    : "Add it to the goal's request details, then save and preview again.";
  return {
    category: "missing_required",
    code,
    headline: `${name} is required for this form but is currently missing.`,
    detail,
  };
}

function templateUnavailableExplanation(code: string): RenderFailureExplanation {
  return {
    category: "template_unavailable",
    code,
    headline: "This form's template could not be loaded right now.",
    detail: "Contact an administrator — the template file may be missing, unpublished, or temporarily unavailable.",
  };
}

function fileIntegrityExplanation(code: string): RenderFailureExplanation {
  return {
    category: "file_integrity",
    code,
    headline: "This form's template failed a file-integrity check and cannot be used safely.",
    detail: "Contact an administrator to re-verify or re-upload the template.",
  };
}

function unsupportedFieldExplanation(code: string, field: string | undefined, message: string | undefined): RenderFailureExplanation {
  return {
    category: "unsupported_field",
    code,
    headline: field
      ? `This template's "${field}" field does not accept the current request data.`
      : "This template has a field configuration that does not accept the current request data.",
    detail: message
      ? `${message} This is a request-profile configuration issue — contact an administrator.`
      : "This is a request-profile configuration issue — contact an administrator.",
  };
}

function explainAcroform(error: AcroformRendererError): RenderFailureExplanation {
  const primary = error.diagnostics[0];
  const code = primary?.code ?? error.code;
  const source = primary?.source;

  switch (code) {
    case "FIELD_VALUE_TOO_LONG": {
      const details = primary?.details as { currentLength?: number; maxLength?: number } | undefined;
      const name = source ? friendlyFieldName(source) : "This field";
      return {
        category: "character_limit",
        code,
        headline: `${name} is ${details?.currentLength ?? "too many"} characters, which exceeds this form's ${details?.maxLength ?? "configured"}-character limit.`,
        detail: "Shorten the text, save, and preview again.",
      };
    }
    case "FIELD_VALUE_MISSING":
      return missingRequiredExplanation(source, code);
    case "XFA_UNSUPPORTED":
      return {
        category: "unsupported_field",
        code,
        headline: "This form uses an unsupported PDF format (XFA) and cannot be filled automatically.",
        detail: "Contact an administrator — the template needs to be replaced with a standard AcroForm PDF.",
      };
    case "SOURCE_PDF_MISSING":
    case "SOURCE_PDF_TOO_LARGE":
      return templateUnavailableExplanation(code);
    case "SOURCE_PDF_INVALID":
      return fileIntegrityExplanation(code);
    case "FONT_INVALID":
      return {
        category: "file_integrity",
        code,
        headline: "This form's configured text style could not be used to fill the document.",
        detail: "Contact an administrator to review this request profile's font configuration.",
      };
    case "PDF_SAVE_FAILED":
      return {
        category: "file_integrity",
        code,
        headline: "The completed form could not be finalized.",
        detail: "Contact an administrator — this usually means the template or a configured font is damaged.",
      };
    case "DUPLICATE_FIELD_MAPPING":
    case "FIELD_NOT_FOUND_OR_WRONG_TYPE":
    case "FIELD_VALUE_INVALID":
    default:
      return unsupportedFieldExplanation(code, primary?.field, primary?.message);
  }
}

function explainOverlay(error: OverlayRendererError): RenderFailureExplanation {
  const phrase = error.field ? friendlyFieldPhrase(error.field) : "text";

  switch (error.code) {
    case "TEXT_OVERFLOW":
      // No character count or maximum here on purpose — an overlay field's
      // capacity depends on font, width, line breaks, and available space,
      // not a configured character limit (overlay fields have no
      // max_length at all). Inventing a number here would be a lie.
      return {
        category: "layout_overflow",
        code: error.code,
        headline: `The ${phrase} is too long for this form's available space. Shorten the text or remove extra line breaks, save, and preview again.`,
      };
    case "FIELD_VALUE_MISSING":
      return missingRequiredExplanation(error.field, error.code);
    case "CONTINUATION_REQUIRED":
    case "CONTINUATION_PROFILE_INVALID":
    case "CONTINUATION_LIMIT_EXCEEDED":
      return {
        category: "continuation_unavailable",
        code: error.code,
        headline: `The ${phrase} is too long for this form, and continuation pages are not available for it right now.`,
        detail: "Shorten the text, or contact an administrator to configure continuation-page support for this form.",
      };
    case "SOURCE_PDF_TOO_LARGE":
      return templateUnavailableExplanation(error.code);
    case "SOURCE_PDF_INVALID":
      return fileIntegrityExplanation(error.code);
    case "FONT_INVALID":
      return {
        category: "file_integrity",
        code: error.code,
        headline: "This form's configured text style could not be used to render the document.",
        detail: "Contact an administrator to review this request profile's font configuration.",
      };
    case "BOX_OUT_OF_BOUNDS":
      return {
        category: "unsupported_field",
        code: error.code,
        headline: "This form's layout configuration places a field outside the page.",
        detail: "Contact an administrator to review this request profile's layout.",
      };
    case "PDF_SAVE_FAILED":
      return {
        category: "file_integrity",
        code: error.code,
        headline: "The completed form could not be finalized.",
        detail: "Contact an administrator — this usually means the template or a configured font is damaged.",
      };
    case "FIELD_VALUE_INVALID":
    case "WRONG_RENDERER":
    default:
      return unsupportedFieldExplanation(error.code, error.field, error.message);
  }
}

function explainLetter(error: LetterRendererError): RenderFailureExplanation | null {
  switch (error.code) {
    // Wraps a PlaceholderResolutionError with the real reason — let the
    // chain walk continue into causeValue rather than reporting a vague
    // "a letter block could not be resolved" here.
    case "BLOCK_INVALID":
      return null;
    case "EMPTY_TEMPLATE":
      return {
        category: "template_unavailable",
        code: error.code,
        headline: "This form's template has no content configured.",
        detail: "Contact an administrator to review this request profile's template.",
      };
    case "LETTER_TOO_LARGE":
      return {
        category: "file_integrity",
        code: error.code,
        headline: "The generated document exceeds the maximum allowed size.",
        detail: "Contact an administrator.",
      };
    case "PDF_RENDER_FAILED":
      return {
        category: "file_integrity",
        code: error.code,
        headline: "The document could not be rendered.",
        detail: "Contact an administrator.",
      };
    case "WRONG_RENDERER":
    default:
      return null;
  }
}

function explainPlaceholder(error: PlaceholderResolutionError): RenderFailureExplanation {
  const primary = error.diagnostics[0];
  if (primary?.code === "MISSING_VALUE" && primary.token) {
    return missingRequiredExplanation(primary.token, primary.code);
  }
  return {
    category: "unsupported_field",
    code: primary?.code ?? "TEMPLATE_INVALID",
    headline: "This form's template contains a configuration problem.",
    detail: "Contact an administrator to review this request profile's template.",
  };
}

const TEMPLATE_SOURCE_UNAVAILABLE_CODES = new Set(["SOURCE_NOT_PUBLISHED", "SOURCE_DOWNLOAD_FAILED"]);

function explainTemplateSource(error: TemplateSourceError): RenderFailureExplanation {
  if (TEMPLATE_SOURCE_UNAVAILABLE_CODES.has(error.code)) return templateUnavailableExplanation(error.code);
  return fileIntegrityExplanation(error.code);
}

function explainOutputValidation(error: OutputValidationError): RenderFailureExplanation {
  switch (error.code) {
    case "OUTPUT_TOO_LARGE":
      return {
        category: "file_integrity",
        code: error.code,
        headline: "The generated document exceeds the maximum allowed size.",
        detail: "Contact an administrator.",
      };
    case "RENDER_DIAGNOSTICS_PRESENT":
      return {
        category: "unsupported_field",
        code: error.code,
        headline: "This form's configuration produced issues that block generation.",
        detail: "Contact an administrator to review this request profile.",
      };
    case "OUTPUT_EMPTY":
    case "OUTPUT_NOT_PDF":
    case "PDF_REOPEN_FAILED":
    case "PAGE_COUNT_INVALID":
    case "UNRESOLVED_PLACEHOLDER":
      return fileIntegrityExplanation(error.code);
    case "INVALID_PROFILE":
    case "INVALID_REQUEST_DATA":
    case "PROFILE_REQUEST_MISMATCH":
    default:
      return {
        category: "unexpected",
        code: error.code,
        headline: "The document could not be verified after generation.",
        detail: "Contact an administrator.",
      };
  }
}

function explainTemplateResolverOwnCode(error: TemplateResolverError): RenderFailureExplanation | null {
  switch (error.code) {
    // Both wrap the real underlying failure — let the chain walk continue.
    case "RENDERER_FAILED":
    case "TEMPLATE_PREFLIGHT_FAILED":
      return null;
    case "INVALID_TEMPLATE_LAYOUT":
      return {
        category: "template_unavailable",
        code: error.code,
        headline: "This request profile's template layout does not match its renderer type.",
        detail: "Contact an administrator to review this request profile.",
      };
    case "INVALID_RENDERER_OUTPUT":
      return fileIntegrityExplanation(error.code);
    case "INVALID_PROFILE":
    case "INVALID_REQUEST_DATA":
    case "PROFILE_REQUEST_MISMATCH":
    case "PROFILE_NOT_VERIFIED":
    case "PROFILE_NOT_EFFECTIVE":
    case "PROFILE_NOT_DRAFT":
    default:
      return {
        category: "unexpected",
        code: error.code,
        headline: "The document could not be generated because the request profile or request data is not currently valid for generation.",
        detail: "Contact an administrator.",
      };
  }
}

function errorName(item: unknown): string | undefined {
  return item instanceof Error ? item.name : (item as { name?: string } | null)?.name;
}

function explainOne(item: unknown): RenderFailureExplanation | null {
  switch (errorName(item)) {
    case "AcroformRendererError":
      return explainAcroform(item as AcroformRendererError);
    case "OverlayRendererError":
      return explainOverlay(item as OverlayRendererError);
    case "LetterRendererError":
      return explainLetter(item as LetterRendererError);
    case "PlaceholderResolutionError":
      return explainPlaceholder(item as PlaceholderResolutionError);
    case "TemplateSourceError":
      return explainTemplateSource(item as TemplateSourceError);
    case "OutputValidationError":
      return explainOutputValidation(item as OutputValidationError);
    case "TemplateResolverError":
      return explainTemplateResolverOwnCode(item as TemplateResolverError);
    default:
      return null;
  }
}

function stableUnknownCode(error: unknown): string {
  if (error instanceof Error && error.name) return `UNEXPECTED_${error.name.toUpperCase()}`;
  return "UNEXPECTED_ERROR";
}

/**
 * Classifies whatever the document-generation pipeline threw into a safe,
 * actionable explanation. Never exposes request contents, credentials, or
 * internal file paths — every branch above returns only curated text. An
 * error type this module doesn't recognize falls back to a generic message
 * (task requirement: unexpected errors stay generic for users) while still
 * returning a stable code the caller can log to the developer console
 * alongside the full error via logRenderFailureChain below.
 */
export function explainRenderFailure(error: unknown): RenderFailureExplanation {
  const chain: unknown[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CHAIN_DEPTH && current; depth += 1) {
    chain.push(current);
    current = (current as { causeValue?: unknown } | null)?.causeValue;
  }

  for (const item of chain) {
    const explanation = explainOne(item);
    if (explanation) return explanation;
  }

  const code = stableUnknownCode(error);
  return {
    category: "unexpected",
    code,
    headline: "The document could not be generated because of an unexpected problem.",
    detail: `Contact an administrator with diagnostic code ${code} and the details from the browser console.`,
  };
}

/**
 * Logs the full causeValue chain to the console — never rendered to the
 * user — so a developer can see the original, specific error (an
 * OverlayRendererError's exact code/field, an AcroformRendererError's full
 * diagnostics list, etc.) instead of only the generic TemplateResolverError
 * wrapper that resolveAndRenderTemplate re-throws for every renderer
 * failure.
 */
export function logRenderFailureChain(label: string, error: unknown): void {
  console.error(label, error);
  let current: unknown = error;
  let depth = 0;
  while ((current as { causeValue?: unknown } | null)?.causeValue && depth < MAX_CHAIN_DEPTH) {
    const next = (current as { causeValue: unknown }).causeValue;
    console.error(`${label} — underlying cause (level ${depth + 1}):`, next);
    current = next;
    depth += 1;
  }
}
