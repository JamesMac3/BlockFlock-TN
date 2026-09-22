import { requestProfileSchema, type OnlinePortalRequestProfile } from "./profile-schema";
import { InvalidEntityIdError } from "./entity-id";
import {
  adaptGovernmentEntityRow,
  adaptRequestProfileRow,
  assertSameGovernmentEntity,
  ProfileAdapterError,
  type RawGovernmentEntityRow,
  type RawRequestProfileRow,
} from "./profile-adapter";

/**
 * Lightweight counterpart to readiness.ts for online_portal profiles — a
 * goal is a candidate for the copy/paste flow once its profile is linked,
 * verified, currently effective, and refers to the same government entity
 * as the goal. Deliberately does NOT build a RequestDocumentData, run
 * validation_schema, or check for a continuation profile — none of that
 * applies to a plain-text portal profile, and rrg_prepare_online_request
 * (the actual authority for the copy/paste popup) re-derives everything
 * itself server-side anyway. This module exists only to drive the
 * "Prepare Request Form" button's enabled/disabled state and an accurate
 * "not ready yet" message; it never itself decides what text is shown.
 */

export type OnlinePortalGoalReadinessReasonCode =
  | "LOCKED"
  | "MISSING_PROFILE_ID"
  | "PROFILE_NOT_AVAILABLE"
  | "ENTITY_NOT_AVAILABLE"
  | "ENTITY_MISMATCH"
  | "INVALID_ENTITY_ID"
  | "INVALID_PROFILE"
  | "NOT_AN_ONLINE_PORTAL_PROFILE"
  | "PROFILE_NOT_VERIFIED"
  | "PROFILE_NOT_EFFECTIVE"
  | "MISSING_REQUEST_TEXT";

export type OnlinePortalGoalReadinessResult =
  | Readonly<{ ready: true; profile: OnlinePortalRequestProfile }>
  | Readonly<{ ready: false; code: OnlinePortalGoalReadinessReasonCode; message: string }>;

export type EvaluateOnlinePortalGoalReadinessInput = Readonly<{
  goal: Readonly<{
    locked: unknown;
    request_profile_id: unknown;
    government_entity_id: unknown;
    fill_payload?: unknown;
  }>;
  profileRow: RawRequestProfileRow | null;
  entityRow: RawGovernmentEntityRow | null;
  today?: string;
}>;

const NOT_AVAILABLE_MESSAGE = "This request form is being verified and is not available yet.";
// Verbatim match of rrg_prepare_online_request's own raise-exception text
// (supabase/migrations/20260922170741_online_portal_request_profiles.sql)
// for the identical failure — same message whether this client-side check
// or the RPC itself is what catches an empty result.
const MISSING_REQUEST_TEXT_MESSAGE =
  "Add records request language to the goal or the portal profile before preparing this request.";

// Non-whitespace check, mirroring the RPC's own `v_text !~ '[^[:space:]]'`
// test exactly — a records_description of only spaces/newlines counts as
// absent, same as a genuinely empty string or null.
function hasUsableText(value: unknown): value is string {
  return typeof value === "string" && /\S/.test(value);
}

export function evaluateOnlinePortalGoalReadiness(
  input: EvaluateOnlinePortalGoalReadinessInput,
): OnlinePortalGoalReadinessResult {
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
      return { ready: false, code: "ENTITY_MISMATCH", message: NOT_AVAILABLE_MESSAGE };
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

  if (profile.renderer_type !== "online_portal") {
    return {
      ready: false,
      code: "NOT_AN_ONLINE_PORTAL_PROFILE",
      message: "This request is prepared through the PDF flow, not the online portal.",
    };
  }

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

  // Same precedence rrg_prepare_online_request applies server-side: the
  // goal's own saved records_description first, otherwise the profile's
  // default request_text. Never public_summary. Checked here too (not
  // only server-side) so the button itself can explain "missing request
  // text" instead of only enabling and then failing on click.
  const goalPayload = goal.fill_payload as { request?: { records_description?: unknown } } | null | undefined;
  const goalText = goalPayload?.request?.records_description;
  const usableText = hasUsableText(goalText) ? goalText : hasUsableText(profile.template_schema.request_text) ? profile.template_schema.request_text : null;
  if (usableText === null) {
    return { ready: false, code: "MISSING_REQUEST_TEXT", message: MISSING_REQUEST_TEXT_MESSAGE };
  }

  return { ready: true, profile };
}
