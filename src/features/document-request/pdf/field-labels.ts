import type { AllowedPlaceholderPath } from "./request-data-schema";

/**
 * The single source of truth for turning a placeholder path (e.g.
 * "request.records_description") into a phrase a non-technical admin or
 * chapter master can read in an error message, without ever showing them
 * the raw path itself or an internal PDF field name. Values are natural,
 * lowercase noun phrases so they read correctly both mid-sentence ("The
 * records description is too long...") and capitalized at the start of a
 * sentence (via capitalize() below).
 *
 * Kept deliberately separate from FillPayloadFields.jsx's own FIELD_LABELS
 * map: that one is keyed by short fill_payload keys for editor UI copy
 * ("Records description (request language)"); this one is keyed by the
 * full placeholder path and covers every path a request profile can
 * reference (including government_entity.* fields FillPayloadFields never
 * renders), for explaining renderer failures.
 */
const PLACEHOLDER_PHRASES: Record<AllowedPlaceholderPath, string> = {
  "government_entity.legal_name": "government entity's legal name",
  "government_entity.display_name": "government entity's display name",
  "government_entity.coordinator_name": "coordinator name",
  "government_entity.coordinator_title": "coordinator title",
  "government_entity.submission_email": "submission email address",
  "government_entity.mailing_address": "mailing address",
  "request.goal_language": "investigative purpose summary",
  "request.records_description": "records description",
  "request.vendor_or_system": "vendor or system name",
  "request.department_or_division": "department or division",
  "request.record_category_label": "record category",
  "request.date_from": "date from",
  "request.date_to": "date to",
  "request.date_from_mm_dd_yyyy": "date from",
  "request.date_to_mm_dd_yyyy": "date to",
  "request.delivery_method": "delivery method",
};

/**
 * A safe, human-readable noun phrase for a placeholder path. Falls back to
 * a de-prefixed, underscore-stripped version of an unrecognized path
 * rather than throwing or ever surfacing a raw dotted path verbatim.
 */
export function friendlyFieldPhrase(source: string): string {
  const known = (PLACEHOLDER_PHRASES as Record<string, string | undefined>)[source];
  if (known) return known;
  return source.replace(/^request\.|^government_entity\./, "").replace(/_/g, " ");
}

export function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

/** A capitalized, sentence-ready field name for a placeholder path. */
export function friendlyFieldName(source: string): string {
  return capitalize(friendlyFieldPhrase(source));
}

export function isGovernmentEntityField(source: string): boolean {
  return source.startsWith("government_entity.");
}
