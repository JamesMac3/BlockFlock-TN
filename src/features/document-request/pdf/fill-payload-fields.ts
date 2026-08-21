import type { RequestProfile } from "./profile-schema";

/**
 * Derives which `request.*` fill_payload keys a goal-edit UI should expose
 * for a given (already-validated) request profile, and how to render each
 * one — reusing the profile's own field_schema/template_schema rather than
 * inventing a parallel description of "what this profile needs." This is
 * the single source of truth for the profile-aware fill-data editor; it
 * does not itself read or write fill_payload.
 *
 * records_description and delivery_method are always supported — the
 * goal-adapter (goal-adapter.ts) unconditionally requires both regardless
 * of whether a given profile's rendered document happens to reference
 * them. Every other key is only supported when the selected profile
 * actually declares it (as an AcroForm/overlay field_schema entry, or as a
 * `{{request.xxx}}` placeholder token inside a generated_letter's
 * template_schema blocks).
 */

export const BASELINE_REQUEST_KEYS = ["records_description", "delivery_method"] as const;
export const OPTIONAL_REQUEST_KEYS = [
  "department_or_division",
  "record_category_label",
  "date_from_mm_dd_yyyy",
  "date_to_mm_dd_yyyy",
] as const;

export type OptionalRequestKey = (typeof OPTIONAL_REQUEST_KEYS)[number];
export type SupportedRequestKey = (typeof BASELINE_REQUEST_KEYS)[number] | OptionalRequestKey;

const DELIVERY_METHODS = ["electronic", "inspection", "onsite_pickup", "usps_mail"] as const;

// Optional-key placeholder sources use a `_mm_dd_yyyy`-suffixed source
// name for dates but an unsuffixed fill_payload key — this maps each
// OPTIONAL_REQUEST_KEY to the literal placeholder-path source it appears
// as in field_schema/template_schema (identical for every key here, but
// kept as an explicit table rather than a string transform so a future
// naming mismatch fails loudly instead of silently).
const OPTIONAL_KEY_SOURCE: Record<OptionalRequestKey, string> = {
  department_or_division: "request.department_or_division",
  record_category_label: "request.record_category_label",
  date_from_mm_dd_yyyy: "request.date_from_mm_dd_yyyy",
  date_to_mm_dd_yyyy: "request.date_to_mm_dd_yyyy",
};

const TEMPLATE_PLACEHOLDER_PATTERN = /\{\{(request\.[a-zA-Z_]+)\}\}/g;

function templateSources(profile: RequestProfile): Set<string> {
  const sources = new Set<string>();
  for (const block of profile.template_schema.blocks) {
    const texts = [block.text, ...(block.lines ?? []), ...(block.items ?? [])].filter(
      (value): value is string => typeof value === "string",
    );
    for (const text of texts) {
      for (const match of text.matchAll(TEMPLATE_PLACEHOLDER_PATTERN)) {
        sources.add(match[1]);
      }
    }
  }
  return sources;
}

function fieldSchemaSources(profile: RequestProfile): Set<string> {
  if (profile.field_schema.renderer_type === "generated_letter") return new Set();
  return new Set(profile.field_schema.fields.map((field) => field.source));
}

/** Every placeholder source (field_schema entries, or template tokens for a generated_letter) this profile actually uses. */
export function declaredSources(profile: RequestProfile): Set<string> {
  const sources = fieldSchemaSources(profile);
  for (const source of templateSources(profile)) sources.add(source);
  return sources;
}

/** The ordered list of request.* keys the fill-data editor should render for this profile: baseline keys always, optional keys only when declared. */
export function deriveSupportedRequestFieldKeys(profile: RequestProfile): SupportedRequestKey[] {
  const sources = declaredSources(profile);
  const keys: SupportedRequestKey[] = [...BASELINE_REQUEST_KEYS];
  for (const key of OPTIONAL_REQUEST_KEYS) {
    if (sources.has(OPTIONAL_KEY_SOURCE[key])) keys.push(key);
  }
  return keys;
}

export type FillFieldDescriptor =
  | { key: SupportedRequestKey; kind: "textarea"; required: true; maxLength: number }
  | { key: "delivery_method"; kind: "choice"; required: true; choices: readonly string[]; allowOther: false }
  | { key: OptionalRequestKey; kind: "choice"; required: false; choices: readonly string[]; allowOther: boolean }
  | { key: OptionalRequestKey; kind: "text"; required: false; maxLength?: number }
  | { key: OptionalRequestKey; kind: "date"; required: false };

function acroformOrOverlayFieldsFor(profile: RequestProfile, source: string) {
  if (profile.field_schema.renderer_type === "generated_letter") return [];
  return profile.field_schema.fields.filter((field) => field.source === source);
}

/** Builds the full render descriptor for one supported key, deriving choice/free-text/date shape from the profile's own declared fields rather than a hardcoded per-key assumption. */
export function describeField(profile: RequestProfile, key: SupportedRequestKey): FillFieldDescriptor {
  if (key === "records_description") {
    const textField = acroformOrOverlayFieldsFor(profile, "request.records_description").find(
      (field) => "kind" in field && field.kind === "text",
    ) as { max_length?: number } | undefined;
    return { key, kind: "textarea", required: true, maxLength: textField?.max_length ?? 12_000 };
  }

  if (key === "delivery_method") {
    const optionFields = acroformOrOverlayFieldsFor(profile, "request.delivery_method").filter(
      (field) => "option_value" in field && field.option_value,
    ) as { option_value?: string }[];
    const choices = optionFields.length > 0
      ? [...new Set(optionFields.map((field) => field.option_value as string))]
      : [...DELIVERY_METHODS];
    return { key, kind: "choice", required: true, choices, allowOther: false };
  }

  if (key === "date_from_mm_dd_yyyy" || key === "date_to_mm_dd_yyyy") {
    return { key, kind: "date", required: false };
  }

  // department_or_division / record_category_label
  const source = OPTIONAL_KEY_SOURCE[key];
  const declared = acroformOrOverlayFieldsFor(profile, source);
  const optionFields = declared.filter((field) => "option_value" in field && field.option_value) as { option_value?: string }[];
  const hasFreeTextField = declared.some((field) => "kind" in field && field.kind === "text" && !("option_value" in field && field.option_value));

  if (optionFields.length > 0) {
    return {
      key,
      kind: "choice",
      required: false,
      choices: [...new Set(optionFields.map((field) => field.option_value as string))],
      allowOther: hasFreeTextField,
    };
  }

  const textField = declared.find((field) => "kind" in field && field.kind === "text") as { max_length?: number } | undefined;
  return { key, kind: "text", required: false, maxLength: textField?.max_length };
}

export function deriveFieldDescriptors(profile: RequestProfile): FillFieldDescriptor[] {
  return deriveSupportedRequestFieldKeys(profile).map((key) => describeField(profile, key));
}

/**
 * Strips any request.* keys from a stored fill_payload that the newly
 * selected profile no longer supports — called when an operator changes
 * the goal's government_entity/request_profile selection, so a value left
 * over from a previous profile is never silently carried forward into a
 * profile that doesn't use it.
 */
export function pruneUnsupportedFillPayloadKeys(
  request: Record<string, unknown>,
  profile: RequestProfile,
): Record<string, unknown> {
  const supported = new Set<string>(deriveSupportedRequestFieldKeys(profile));
  const pruned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(request)) {
    if (supported.has(key)) pruned[key] = value;
  }
  return pruned;
}
