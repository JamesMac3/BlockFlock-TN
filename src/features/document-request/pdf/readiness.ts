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
 * A goal is generator-ready only when every stored precondition holds:
 * unlocked, a linked profile that is actually returned by the public
 * verified-profile query, an entity match across goal/profile/entity, and
 * both structural and runtime-executed validation passing. This function
 * never enables a button merely because a goal contains a profile UUID —
 * every step below must succeed.
 */

export type GoalReadinessReasonCode =
  | "LOCKED"
  | "MISSING_PROFILE_ID"
  | "PROFILE_NOT_AVAILABLE"
  | "ENTITY_NOT_AVAILABLE"
  | "ENTITY_MISMATCH"
  | "INVALID_ENTITY_ID"
  | "INVALID_PROFILE"
  | "PROFILE_NOT_VERIFIED"
  | "PROFILE_NOT_EFFECTIVE"
  | "CONTINUATION_NOT_SUPPORTED"
  | "INVALID_REQUEST_DATA"
  | "VALIDATION_FAILED"
  | "BROAD_SCOPE_UNRESOLVED"
  | "READINESS_CHECK_FAILED"
  | GoalAdapterReasonCode;

export type GoalReadinessResult =
  | Readonly<{
      ready: true;
      profile: RequestProfile;
      data: RequestDocumentData;
      warnings: readonly ValidationDiagnostic[];
    }>
  | Readonly<{ ready: false; code: GoalReadinessReasonCode; message: string }>;

export type EvaluateGoalReadinessInput = Readonly<{
  goal: RawGoalRow & Readonly<{ locked: unknown; request_profile_id: unknown }>;
  profileRow: RawRequestProfileRow | null;
  entityRow: RawGovernmentEntityRow | null;
  today?: string;
}>;

const NOT_AVAILABLE_MESSAGE = "This request form is being verified and is not available for download yet.";

export function evaluateGoalReadiness(input: EvaluateGoalReadinessInput): GoalReadinessResult {
  const { goal, profileRow, entityRow } = input;

  if (goal.locked) {
    return { ready: false, code: "LOCKED", message: "This goal is currently locked." };
  }
  if (!goal.request_profile_id) {
    return { ready: false, code: "MISSING_PROFILE_ID", message: "This goal has no linked request profile." };
  }
  if (!profileRow) {
    return { ready: false, code: "PROFILE_NOT_AVAILABLE", message: NOT_AVAILABLE_MESSAGE };
  }
  if (!entityRow) {
    return { ready: false, code: "ENTITY_NOT_AVAILABLE", message: NOT_AVAILABLE_MESSAGE };
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
      return { ready: false, code: error.code, message: NOT_AVAILABLE_MESSAGE };
    }
    if (error instanceof InvalidEntityIdError) {
      return { ready: false, code: "INVALID_ENTITY_ID", message: NOT_AVAILABLE_MESSAGE };
    }
    throw error;
  }

  const profileResult = requestProfileSchema.safeParse(normalizedProfile);
  if (!profileResult.success) {
    return { ready: false, code: "INVALID_PROFILE", message: NOT_AVAILABLE_MESSAGE };
  }
  const profile = profileResult.data;

  if (profile.status !== "verified") {
    return { ready: false, code: "PROFILE_NOT_VERIFIED", message: NOT_AVAILABLE_MESSAGE };
  }

  const today = input.today ?? new Date().toISOString().slice(0, 10);
  if (
    (profile.effective_from !== null && today < profile.effective_from) ||
    (profile.effective_to !== null && today > profile.effective_to)
  ) {
    return { ready: false, code: "PROFILE_NOT_EFFECTIVE", message: NOT_AVAILABLE_MESSAGE };
  }

  // No continuation-profile loader has been wired and verified yet (it
  // would need its own verified/effective/entity checks against a second
  // live profile). Rather than risk an unsafe or partially-verified
  // continuation render, overlay profiles that declare one are treated as
  // not generator-ready until that loader exists.
  if (profile.renderer_type === "overlay" && profile.continuation_profile_id !== null) {
    return { ready: false, code: "CONTINUATION_NOT_SUPPORTED", message: NOT_AVAILABLE_MESSAGE };
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
      return { ready: false, code: error.code, message: NOT_AVAILABLE_MESSAGE };
    }
    throw error;
  }

  const dataResult = requestDocumentDataSchema.safeParse(requestDataInput);
  if (!dataResult.success) {
    return { ready: false, code: "INVALID_REQUEST_DATA", message: NOT_AVAILABLE_MESSAGE };
  }
  const data = dataResult.data;

  const { errors, warnings } = runValidationSchema(profile.validation_schema, data);
  if (errors.length > 0) {
    return { ready: false, code: "VALIDATION_FAILED", message: NOT_AVAILABLE_MESSAGE };
  }

  // The site collects no request-scope inputs beyond email/reminder
  // consent, so there is no UI that could ever supply the confirmation a
  // broad-scope request requires. Treat it as blocking rather than a mere
  // warning: an administrator or chapter master must narrow the approved
  // fill_payload (e.g. add a date range) or turn off broad_mode_confirmation
  // on the profile before this goal can be generator-ready.
  if (warnings.some((warning) => warning.code === "BROAD_SCOPE_REQUIRES_CONFIRMATION")) {
    return { ready: false, code: "BROAD_SCOPE_UNRESOLVED", message: NOT_AVAILABLE_MESSAGE };
  }

  return { ready: true, profile, data, warnings };
}
