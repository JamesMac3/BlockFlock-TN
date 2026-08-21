import { requestProfileSchema, type RequestProfile } from "./profile-schema";
import {
  requestDocumentDataSchema,
  type RequestDocumentData,
} from "./request-data-schema";
import { resolvePlaceholders } from "./placeholder-resolver";

export type RendererType = RequestProfile["renderer_type"];

export type RenderWarning = {
  code: string;
  message: string;
  field?: string;
};

export type RenderDiagnostic = {
  code: string;
  message: string;
  field?: string;
};

export type RenderedPdf = {
  pdfBytes: Uint8Array;
  warnings: readonly RenderWarning[];
  diagnostics: readonly RenderDiagnostic[];
};

export type RendererContext = Readonly<{
  profile: RequestProfile;
  data: RequestDocumentData;
}>;

export type PdfRenderer = (context: RendererContext) => Promise<RenderedPdf>;

export type RendererRegistry = Readonly<Record<RendererType, PdfRenderer>>;

export type TemplateResolverOptions = Readonly<{
  today?: string;
  /**
   * Off by default. When true, replaces the verified-status and
   * currently-effective checks below with a narrower requirement that the
   * profile's status is exactly "draft" — never in_review, verified, or
   * retired. This exists solely for the authenticated operator
   * draft-preview path (see generate-operator-preview-document.ts), which
   * is explicitly meant to preview draft profiles only; verified profiles
   * are still served through the ordinary path below (with this option
   * off), and in_review/retired profiles are rejected either way. The
   * public/production path (generate-request-document.ts) never sets this,
   * so its behavior is unchanged. Every other check in this module —
   * structural validation, profile/request identity, template preflight,
   * renderer dispatch, and output validation — still applies
   * unconditionally.
   */
  allowDraftProfile?: boolean;
}>;

export type TemplateResolverErrorCode =
  | "INVALID_PROFILE"
  | "INVALID_REQUEST_DATA"
  | "PROFILE_NOT_VERIFIED"
  | "PROFILE_NOT_EFFECTIVE"
  | "PROFILE_NOT_DRAFT"
  | "PROFILE_REQUEST_MISMATCH"
  | "INVALID_TEMPLATE_LAYOUT"
  | "TEMPLATE_PREFLIGHT_FAILED"
  | "RENDERER_FAILED"
  | "INVALID_RENDERER_OUTPUT";

export class TemplateResolverError extends Error {
  readonly code: TemplateResolverErrorCode;
  readonly details: readonly string[];
  readonly causeValue?: unknown;

  constructor(
    code: TemplateResolverErrorCode,
    message: string,
    details: readonly string[] = [],
    causeValue?: unknown,
  ) {
    super(message);
    this.name = "TemplateResolverError";
    this.code = code;
    this.details = details;
    this.causeValue = causeValue;
  }
}

function issuePaths(error: { issues: readonly { path: PropertyKey[]; message: string }[] }): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });
}

function currentIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new TemplateResolverError("PROFILE_NOT_EFFECTIVE", "The effective-date check received an invalid date.");
  }
}

function preflightTemplate(profile: RequestProfile, data: RequestDocumentData): void {
  const blocks = profile.template_schema.blocks;

  if (profile.renderer_type === "generated_letter" && blocks.length === 0) {
    throw new TemplateResolverError(
      "INVALID_TEMPLATE_LAYOUT",
      "A generated-letter profile must contain at least one structured block.",
    );
  }
  if (profile.renderer_type !== "generated_letter" && blocks.length > 0) {
    throw new TemplateResolverError(
      "INVALID_TEMPLATE_LAYOUT",
      "AcroForm and overlay profiles may not contain generated-letter blocks.",
    );
  }

  try {
    resolvePlaceholders(profile.output_options.pdf_title_pattern, data);
    resolvePlaceholders(profile.output_options.filename_pattern, data);

    for (const block of blocks) {
      if (block.text !== undefined) resolvePlaceholders(block.text, data);
      for (const line of block.lines ?? []) {
        resolvePlaceholders(line, data, { missing: block.omit_empty_lines ? "empty" : "error" });
      }
      for (const item of block.items ?? []) resolvePlaceholders(item, data);
    }
  } catch (error) {
    throw new TemplateResolverError(
      "TEMPLATE_PREFLIGHT_FAILED",
      "The verified template could not be resolved safely.",
      [],
      error,
    );
  }
}

function assertPdfBytes(result: RenderedPdf): void {
  if (!(result.pdfBytes instanceof Uint8Array) || result.pdfBytes.length < 5) {
    throw new TemplateResolverError("INVALID_RENDERER_OUTPUT", "The renderer returned no usable PDF bytes.");
  }
  const signature = String.fromCharCode(...result.pdfBytes.slice(0, 5));
  if (signature !== "%PDF-") {
    throw new TemplateResolverError("INVALID_RENDERER_OUTPUT", "The renderer output does not begin with a PDF signature.");
  }
}

export async function resolveAndRenderTemplate(
  profileInput: unknown,
  requestInput: unknown,
  renderers: RendererRegistry,
  options: TemplateResolverOptions = {},
): Promise<RenderedPdf> {
  const profileResult = requestProfileSchema.safeParse(profileInput);
  if (!profileResult.success) {
    throw new TemplateResolverError(
      "INVALID_PROFILE",
      "The request profile failed structural validation.",
      issuePaths(profileResult.error),
    );
  }

  const requestResult = requestDocumentDataSchema.safeParse(requestInput);
  if (!requestResult.success) {
    throw new TemplateResolverError(
      "INVALID_REQUEST_DATA",
      "The request data failed structural validation.",
      issuePaths(requestResult.error),
    );
  }

  const profile = profileResult.data;
  const data = requestResult.data;

  if (options.allowDraftProfile) {
    if (profile.status !== "draft") {
      throw new TemplateResolverError(
        "PROFILE_NOT_DRAFT",
        "Only draft request profiles may be previewed through the operator preview path.",
      );
    }
  } else {
    if (profile.status !== "verified") {
      throw new TemplateResolverError("PROFILE_NOT_VERIFIED", "Only verified request profiles may generate documents.");
    }

    const today = options.today ?? currentIsoDate();
    assertIsoDate(today);
    if (
      (profile.effective_from !== null && today < profile.effective_from)
      || (profile.effective_to !== null && today > profile.effective_to)
    ) {
      throw new TemplateResolverError("PROFILE_NOT_EFFECTIVE", "The request profile is not effective on the generation date.");
    }
  }

  if (
    profile.id !== data.profile.id
    || profile.version !== data.profile.version
    || profile.government_entity_id !== data.profile.government_entity_id
    || profile.government_entity_id !== data.government_entity.id
  ) {
    throw new TemplateResolverError(
      "PROFILE_REQUEST_MISMATCH",
      "The profile identity, version, or government entity does not match the request.",
    );
  }

  preflightTemplate(profile, data);

  const renderer = renderers[profile.renderer_type];
  let result: RenderedPdf;
  try {
    result = await renderer(Object.freeze({ profile, data }));
  } catch (error) {
    throw new TemplateResolverError(
      "RENDERER_FAILED",
      `${profile.renderer_type} rendering failed; no fallback renderer was attempted.`,
      [],
      error,
    );
  }

  assertPdfBytes(result);
  return result;
}
