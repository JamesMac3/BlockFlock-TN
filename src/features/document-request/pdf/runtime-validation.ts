import type { RequestProfile } from "./profile-schema";
import type { AllowedPlaceholderPath, RequestDocumentData } from "./request-data-schema";
import { readPlaceholderValue } from "./placeholder-resolver";

/**
 * Executes a verified profile's validation_schema against a built
 * RequestDocumentData, rather than only checking the schema's own JSON
 * structure. Every rule reads its value through readPlaceholderValue(),
 * which only understands the same allowlisted placeholder paths the
 * template resolver uses — there is no arbitrary property traversal,
 * profile-provided regular expressions, or executable expressions here.
 *
 * Because the public site never lets a requester edit request content, a
 * blocking (error-severity) problem means the request is unavailable until
 * an administrator or chapter master corrects the approved goal or profile
 * data — it is never surfaced as something the visitor can fix.
 */

export type ValidationSeverity = "warning" | "error";

export type ValidationDiagnostic = Readonly<{
  path?: AllowedPlaceholderPath;
  severity: ValidationSeverity;
  code: string;
  message: string;
}>;

export type ValidationRunResult = Readonly<{
  errors: readonly ValidationDiagnostic[];
  warnings: readonly ValidationDiagnostic[];
}>;

type ValidationSchema = RequestProfile["validation_schema"];
type ValidationRule = ValidationSchema["rules"][number];

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function pushDiagnostic(
  errors: ValidationDiagnostic[],
  warnings: ValidationDiagnostic[],
  diagnostic: ValidationDiagnostic,
): void {
  if (diagnostic.severity === "error") errors.push(diagnostic);
  else warnings.push(diagnostic);
}

function evaluateRule(
  rule: ValidationRule,
  data: RequestDocumentData,
): ValidationDiagnostic | null {
  const value = readPlaceholderValue(rule.path, data);

  switch (rule.type) {
    case "required": {
      if (!isPresent(value)) {
        return { path: rule.path, severity: rule.severity, code: "REQUIRED", message: rule.message };
      }
      return null;
    }
    case "string_length": {
      if (!isPresent(value)) return null;
      const length = String(value).length;
      if (rule.min !== undefined && length < rule.min) {
        return { path: rule.path, severity: rule.severity, code: "STRING_TOO_SHORT", message: rule.message };
      }
      if (rule.max !== undefined && length > rule.max) {
        return { path: rule.path, severity: rule.severity, code: "STRING_TOO_LONG", message: rule.message };
      }
      return null;
    }
    case "email": {
      if (!isPresent(value)) return null;
      if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return { path: rule.path, severity: rule.severity, code: "INVALID_EMAIL", message: rule.message };
      }
      return null;
    }
    case "date": {
      if (!isPresent(value)) return null;
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { path: rule.path, severity: rule.severity, code: "INVALID_DATE", message: rule.message };
      }
      return null;
    }
    case "date_order": {
      if (!rule.other_path) return null;
      const otherValue = readPlaceholderValue(rule.other_path, data);
      if (!isPresent(value) || !isPresent(otherValue)) return null;
      if (typeof value === "string" && typeof otherValue === "string" && value > otherValue) {
        return { path: rule.path, severity: rule.severity, code: "DATE_OUT_OF_ORDER", message: rule.message };
      }
      return null;
    }
    case "number_range": {
      if (!isPresent(value)) return null;
      const numeric = Number(value);
      if (Number.isNaN(numeric)) {
        return { path: rule.path, severity: rule.severity, code: "NOT_A_NUMBER", message: rule.message };
      }
      if (rule.min !== undefined && numeric < rule.min) {
        return { path: rule.path, severity: rule.severity, code: "NUMBER_TOO_LOW", message: rule.message };
      }
      if (rule.max !== undefined && numeric > rule.max) {
        return { path: rule.path, severity: rule.severity, code: "NUMBER_TOO_HIGH", message: rule.message };
      }
      return null;
    }
    case "boolean_true": {
      if (value !== true) {
        return { path: rule.path, severity: rule.severity, code: "NOT_CONFIRMED", message: rule.message };
      }
      return null;
    }
    default:
      return null;
  }
}

function evaluateScopeWarnings(
  scopeWarnings: ValidationSchema["scope_warnings"],
  data: RequestDocumentData,
): ValidationDiagnostic[] {
  const warnings: ValidationDiagnostic[] = [];
  const dateFrom = data.request.date_from;
  const dateTo = data.request.date_to;

  if (scopeWarnings.maximum_date_span_days !== undefined && dateFrom && dateTo) {
    const spanMs = Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`);
    const spanDays = spanMs / (24 * 60 * 60 * 1000);
    if (Number.isFinite(spanDays) && spanDays > scopeWarnings.maximum_date_span_days) {
      warnings.push({
        path: "request.date_to",
        severity: "warning",
        code: "DATE_SPAN_TOO_BROAD",
        message: `The requested date range exceeds ${scopeWarnings.maximum_date_span_days} days.`,
      });
    }
  }

  if (scopeWarnings.broad_mode_confirmation && !dateFrom && !dateTo) {
    warnings.push({
      severity: "warning",
      code: "BROAD_SCOPE_REQUIRES_CONFIRMATION",
      message: "This request has no date range and is broad in scope; it requires confirmation before submission.",
    });
  }

  return warnings;
}

export function runValidationSchema(
  validationSchema: ValidationSchema,
  data: RequestDocumentData,
): ValidationRunResult {
  const errors: ValidationDiagnostic[] = [];
  const warnings: ValidationDiagnostic[] = [];

  for (const path of validationSchema.required_paths) {
    const value = readPlaceholderValue(path, data);
    if (!isPresent(value)) {
      errors.push({
        path,
        severity: "error",
        code: "REQUIRED_PATH_MISSING",
        message: `A required value is missing: ${path}.`,
      });
    }
  }

  for (const rule of validationSchema.rules) {
    const diagnostic = evaluateRule(rule, data);
    if (diagnostic) pushDiagnostic(errors, warnings, diagnostic);
  }

  warnings.push(...evaluateScopeWarnings(validationSchema.scope_warnings, data));

  return { errors, warnings };
}
