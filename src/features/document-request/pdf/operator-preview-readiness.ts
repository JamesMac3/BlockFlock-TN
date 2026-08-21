import { requestProfileSchema, type RequestProfile } from "./profile-schema";
import { requestDocumentDataSchema, type RequestDocumentData } from "./request-data-schema";
import { InvalidEntityIdError } from "./entity-id";
import {
  adaptGovernmentEntityRow,
  adaptRequestProfileRow,
  assertSameGovernmentEntity,
  ProfileAdapterError,
  type RawGovernmentEntityRow,
  type RawRequestProfileRow,
} from "./profile-adapter";
import { buildRequestDocumentDataInput, GoalAdapterError, type GoalAdapterReasonCode, type RawGoalRow } from "./goal-adapter";
import { runValidationSchema, type ValidationDiagnostic } from "./runtime-validation";

/**
 * Authorized-operator counterpart to readiness.ts, used only by the
 * draft-preview workflow (an authenticated administrator, or the assigned
 * chapter master for the goal's own county). It deliberately mirrors
 * evaluateGoalReadiness's gates EXCEPT the verified-status and
 * currently-effective checks, since previewing a draft profile is the
 * entire point of this path — the public readiness gate in readiness.ts is
 * untouched and still enforces those for the public site. Locked goals,
 * missing/mismatched relationships, continuation profiles (no loader is
 * wired yet), structural validation, and the profile's own
 * validation_schema rules are all still enforced, identically to the
 * public path.
 *
 * This module never talks to Supabase itself — callers must obtain
 * profileRow/entityRow from the authorized get_draft_request_preview_bundle
 * RPC (see operatorPreview.js), never from a public/unauthenticated query.
 */

export type OperatorPreviewReasonCode =
  | "LOCKED"
  | "MISSING_PROFILE_ID"
  | "PROFILE_NOT_AVAILABLE"
  | "ENTITY_NOT_AVAILABLE"
  | "ENTITY_MISMATCH"
  | "INVALID_ENTITY_ID"
  | "INVALID_PROFILE"
  | "PROFILE_NOT_DRAFT"
  | "CONTINUATION_NOT_SUPPORTED"
  | "INVALID_REQUEST_DATA"
  | "VALIDATION_FAILED"
  | "BROAD_SCOPE_UNRESOLVED"
  | GoalAdapterReasonCode;

export type OperatorPreviewResult =
  | Readonly<{
      ready: true;
      profile: RequestProfile;
      data: RequestDocumentData;
      warnings: readonly ValidationDiagnostic[];
    }>
  | Readonly<{ ready: false; code: OperatorPreviewReasonCode; message: string }>;

export type EvaluateOperatorPreviewInput = Readonly<{
  goal: RawGoalRow & Readonly<{ locked: unknown; request_profile_id: unknown }>;
  profileRow: RawRequestProfileRow | null;
  entityRow: RawGovernmentEntityRow | null;
}>;

export function evaluateOperatorPreviewReadiness(input: EvaluateOperatorPreviewInput): OperatorPreviewResult {
  const { goal, profileRow, entityRow } = input;

  if (goal.locked) {
    return { ready: false, code: "LOCKED", message: "This goal is locked and cannot be previewed." };
  }
  if (!goal.request_profile_id) {
    return { ready: false, code: "MISSING_PROFILE_ID", message: "This goal has no linked request profile." };
  }
  if (!profileRow) {
    return { ready: false, code: "PROFILE_NOT_AVAILABLE", message: "The linked request profile could not be loaded." };
  }
  if (!entityRow) {
    return { ready: false, code: "ENTITY_NOT_AVAILABLE", message: "The linked government entity could not be loaded." };
  }

  let normalizedProfile: Record<string, unknown>;
  let normalizedEntity: Record<string, unknown>;
  try {
    normalizedProfile = adaptRequestProfileRow(profileRow);
    normalizedEntity = adaptGovernmentEntityRow(entityRow);
    assertSameGovernmentEntity(
      goal.government_entity_id,
      normalizedProfile.government_entity_id,
      normalizedEntity.id,
    );
  } catch (error) {
    if (error instanceof ProfileAdapterError) {
      return { ready: false, code: error.code, message: "The goal, profile, and government entity do not agree on the same entity." };
    }
    if (error instanceof InvalidEntityIdError) {
      return { ready: false, code: "INVALID_ENTITY_ID", message: "A government-entity identifier is invalid." };
    }
    throw error;
  }

  const profileResult = requestProfileSchema.safeParse(normalizedProfile);
  if (!profileResult.success) {
    return { ready: false, code: "INVALID_PROFILE", message: "The request profile failed structural validation." };
  }
  const profile = profileResult.data;

  // This is specifically the draft-preview path: it deliberately skips the
  // verified-status and effective-date checks readiness.ts enforces, but
  // requires status === "draft" in their place — in_review, verified, and
  // retired profiles are all rejected here. A verified profile must go
  // through the ordinary public generator (readiness.ts) instead.
  if (profile.status !== "draft") {
    return {
      ready: false,
      code: "PROFILE_NOT_DRAFT",
      message: "Only draft request profiles are available through the operator preview path.",
    };
  }

  // No continuation-profile loader has been wired and verified yet (same
  // reasoning as readiness.ts): overlay profiles that declare one are not
  // previewable until that loader exists.
  if (profile.renderer_type === "overlay" && profile.continuation_profile_id !== null) {
    return { ready: false, code: "CONTINUATION_NOT_SUPPORTED", message: "No continuation-profile loader is wired yet." };
  }

  let requestDataInput: Record<string, unknown>;
  try {
    requestDataInput = buildRequestDocumentDataInput(
      goal,
      { id: profile.id, version: profile.version, government_entity_id: profile.government_entity_id },
      normalizedEntity,
    );
  } catch (error) {
    if (error instanceof GoalAdapterError) {
      return { ready: false, code: error.code, message: error.message };
    }
    throw error;
  }

  const dataResult = requestDocumentDataSchema.safeParse(requestDataInput);
  if (!dataResult.success) {
    return { ready: false, code: "INVALID_REQUEST_DATA", message: "The approved request data failed structural validation." };
  }
  const data = dataResult.data;

  const { errors, warnings } = runValidationSchema(profile.validation_schema, data);
  if (errors.length > 0) {
    return { ready: false, code: "VALIDATION_FAILED", message: errors[0].message };
  }
  if (warnings.some((warning) => warning.code === "BROAD_SCOPE_REQUIRES_CONFIRMATION")) {
    return {
      ready: false,
      code: "BROAD_SCOPE_UNRESOLVED",
      message: "This profile requires broad-scope confirmation, which has no input on this site.",
    };
  }

  return { ready: true, profile, data, warnings };
}
