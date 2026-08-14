import {
  allowedPlaceholderPaths,
  type AllowedPlaceholderPath,
  type RequestDocumentData,
} from "./request-data-schema";

const MAX_TEMPLATE_LENGTH = 50_000;
const MAX_TOKENS = 250;
const TOKEN_PATTERN = /\{\{([^{}]*)\}\}/g;
const TOKEN_LIKE_PATTERN = /\{\{|\}\}/;
const STRAY_BRACE_PATTERN = /[{}]/;
const allowedPaths = new Set<string>(allowedPlaceholderPaths);

export type PlaceholderErrorCode =
  | "TEMPLATE_TOO_LONG"
  | "TOO_MANY_TOKENS"
  | "MALFORMED_TOKEN"
  | "UNKNOWN_TOKEN"
  | "MISSING_VALUE"
  | "UNSAFE_VALUE";

export type PlaceholderDiagnostic = {
  code: PlaceholderErrorCode;
  message: string;
  token?: string;
  offset?: number;
};

export class PlaceholderResolutionError extends Error {
  readonly diagnostics: readonly PlaceholderDiagnostic[];

  constructor(diagnostics: readonly PlaceholderDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join(" "));
    this.name = "PlaceholderResolutionError";
    this.diagnostics = diagnostics;
  }
}

export type ResolvePlaceholderOptions = {
  missing?: "error" | "empty";
};

export type ResolvedPlaceholderTemplate = {
  text: string;
  tokens: readonly AllowedPlaceholderPath[];
};

const accessors: Record<AllowedPlaceholderPath, (data: RequestDocumentData) => unknown> = {
  "government_entity.legal_name": (data) => data.government_entity.legal_name,
  "government_entity.display_name": (data) => data.government_entity.display_name,
  "government_entity.coordinator_name": (data) => data.government_entity.coordinator_name,
  "government_entity.coordinator_title": (data) => data.government_entity.coordinator_title,
  "government_entity.submission_email": (data) => data.government_entity.submission_email,
  "government_entity.mailing_address": (data) => data.government_entity.mailing_address,
  "request.goal_language": (data) => data.request.goal_language,
  "request.records_description": (data) => data.request.records_description,
  "request.vendor_or_system": (data) => data.request.vendor_or_system,
  "request.department_or_division": (data) => data.request.department_or_division,
  "request.record_category_label": (data) => data.request.record_category_label,
  "request.date_from": (data) => data.request.date_from,
  "request.date_to": (data) => data.request.date_to,
  "request.date_from_mm_dd_yyyy": (data) => formatUsDate(data.request.date_from),
  "request.date_to_mm_dd_yyyy": (data) => formatUsDate(data.request.date_to),
  "request.delivery_method": (data) => data.request.delivery_method,
};

function formatUsDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

export function readPlaceholderValue(
  path: AllowedPlaceholderPath,
  data: RequestDocumentData,
): unknown {
  return accessors[path](data);
}

function formatValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return "";
}

/**
 * Resolves one template pass. It has no expression language and never walks an
 * object by user-provided property names. Callers must validate data first.
 */
export function resolvePlaceholders(
  template: string,
  data: RequestDocumentData,
  options: ResolvePlaceholderOptions = {},
): ResolvedPlaceholderTemplate {
  if (template.length > MAX_TEMPLATE_LENGTH) {
    throw new PlaceholderResolutionError([
      { code: "TEMPLATE_TOO_LONG", message: `Template exceeds ${MAX_TEMPLATE_LENGTH} characters.` },
    ]);
  }

  const diagnostics: PlaceholderDiagnostic[] = [];
  const matches = [...template.matchAll(TOKEN_PATTERN)];

  if (matches.length > MAX_TOKENS) {
    throw new PlaceholderResolutionError([
      { code: "TOO_MANY_TOKENS", message: `Template exceeds ${MAX_TOKENS} placeholders.` },
    ]);
  }

  const textOutsideTokens = template.replace(TOKEN_PATTERN, "");
  if (STRAY_BRACE_PATTERN.test(textOutsideTokens)) {
    diagnostics.push({
      code: "MALFORMED_TOKEN",
      message: "Template contains unmatched, nested, or malformed placeholder braces.",
    });
  }

  for (const match of matches) {
    const token = match[1];
    if (!allowedPaths.has(token)) {
      diagnostics.push({
        code: "UNKNOWN_TOKEN",
        token,
        offset: match.index,
        message: `Placeholder is not allowed: {{${token}}}.`,
      });
    }
  }

  if (diagnostics.length > 0) throw new PlaceholderResolutionError(diagnostics);

  const usedTokens: AllowedPlaceholderPath[] = [];
  const missingMode = options.missing ?? "error";

  const text = template.replace(TOKEN_PATTERN, (fullToken, rawToken: string, offset: number) => {
    const token = rawToken as AllowedPlaceholderPath;
    const value = readPlaceholderValue(token, data);

    if (value === undefined || value === null || value === "") {
      if (missingMode === "error") {
        diagnostics.push({
          code: "MISSING_VALUE",
          token,
          offset,
          message: `No value was supplied for ${fullToken}.`,
        });
      }
      usedTokens.push(token);
      return "";
    }

    const formatted = formatValue(value);
    if (TOKEN_LIKE_PATTERN.test(formatted)) {
      diagnostics.push({
        code: "UNSAFE_VALUE",
        token,
        offset,
        message: `Value for ${fullToken} contains reserved placeholder braces.`,
      });
      usedTokens.push(token);
      return "";
    }

    usedTokens.push(token);
    return formatted;
  });

  if (diagnostics.length > 0) throw new PlaceholderResolutionError(diagnostics);
  return { text, tokens: usedTokens };
}
