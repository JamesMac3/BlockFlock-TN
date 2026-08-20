import { normalizeEntityId } from "./entity-id";

/**
 * Adapts raw public.request_profiles / public.government_entities rows
 * (as returned by supabase-js) into the plain objects the generator's Zod
 * schemas expect. This is the only place a live Supabase row is allowed to
 * touch the generator: callers must never pass a raw row into
 * requestProfileSchema or requestDocumentDataSchema directly.
 *
 * Only the exact fields the generator supports are copied across — no other
 * column from either table reaches the generator, and government_entity_id
 * is normalized from a live bigint into the string representation the
 * generator's schemas use.
 */

export class ProfileAdapterError extends Error {
  constructor(
    readonly code: "ENTITY_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "ProfileAdapterError";
  }
}

// Loosely typed on purpose: these describe an untrusted Supabase row, not a
// validated shape. Structural validation happens downstream via
// requestProfileSchema.safeParse().
export type RawRequestProfileRow = Record<string, unknown>;
export type RawGovernmentEntityRow = Record<string, unknown>;

const PROFILE_FIELDS = [
  "id",
  "version",
  "schema_version",
  "status",
  "effective_from",
  "effective_to",
  "policy_source_url",
  "archived_policy_object_id",
  "policy_summary",
  "eligibility_mode",
  "eligibility_jurisdiction",
  "eligibility_explanation",
  "form_mode",
  "form_explanation",
  "fee_rule",
  "aggregation_rule",
  "submission_instructions",
  "template_family",
  "renderer_type",
  "base_pdf_object_id",
  "continuation_profile_id",
  "field_schema",
  "template_schema",
  "validation_schema",
  "output_options",
  "verified_by",
  "verified_at",
] as const;

const ENTITY_FIELDS = [
  "legal_name",
  "display_name",
  "coordinator_name",
  "coordinator_title",
  "submission_email",
  "mailing_address",
  "portal_url",
] as const;

/**
 * Copies only the supported request_profiles columns into a plain object
 * with government_entity_id normalized to a string. The result is not yet
 * Zod-validated: callers pass it to requestProfileSchema.safeParse().
 */
export function adaptRequestProfileRow(row: RawRequestProfileRow): Record<string, unknown> {
  const adapted: Record<string, unknown> = {};
  for (const field of PROFILE_FIELDS) {
    adapted[field] = row[field];
  }
  adapted.government_entity_id = normalizeEntityId(row.government_entity_id);
  return adapted;
}

/**
 * Copies only the supported government_entities columns into a plain
 * object with id normalized to a string. Optional coordinator/submission
 * fields that are null in the database are dropped (undefined) rather than
 * passed through as null, matching the optional-string shape the generator
 * schema expects.
 */
export function adaptGovernmentEntityRow(row: RawGovernmentEntityRow): Record<string, unknown> {
  const adapted: Record<string, unknown> = {
    id: normalizeEntityId(row.id),
    legal_name: row.legal_name,
    display_name: row.display_name,
  };
  for (const field of ENTITY_FIELDS) {
    const value = row[field];
    if (value !== null && value !== undefined) {
      adapted[field] = value;
    }
  }
  return adapted;
}

/**
 * Confirms a goal, a request profile, and a government entity all
 * reference the same live government entity before any of them are used
 * together to build a document. Throws ProfileAdapterError rather than
 * silently proceeding on a mismatch.
 */
export function assertSameGovernmentEntity(
  goalGovernmentEntityId: unknown,
  profileGovernmentEntityId: unknown,
  entityId: unknown,
): string {
  const normalizedGoal = normalizeEntityId(goalGovernmentEntityId);
  const normalizedProfile = normalizeEntityId(profileGovernmentEntityId);
  const normalizedEntity = normalizeEntityId(entityId);

  if (normalizedGoal !== normalizedProfile || normalizedProfile !== normalizedEntity) {
    throw new ProfileAdapterError(
      "ENTITY_MISMATCH",
      "The goal, request profile, and government entity do not reference the same government entity.",
    );
  }

  return normalizedGoal;
}
