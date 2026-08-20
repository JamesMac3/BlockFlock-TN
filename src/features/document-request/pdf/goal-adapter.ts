import { normalizeMmDdYyyyToIsoDate, InvalidStoredDateError } from "./date-normalization";

/**
 * Builds the `request` portion of RequestDocumentData from a goal's own
 * approved fields. The website has no request-writing interface, so this
 * module never accepts requester-provided edits: every value here comes
 * verbatim from the goal's stored public_summary and fill_payload.
 *
 * goal.title is the short investigative-goal identifier (not used in the
 * generated document). goal.public_summary is the visible purpose and
 * becomes request.goal_language. fill_payload.request.records_description
 * is the exact, approved request language and is never substituted with
 * public_summary or any other field.
 */

export type GoalAdapterReasonCode =
  | "MISSING_GOAL_PURPOSE"
  | "MISSING_RECORDS_DESCRIPTION"
  | "MISSING_DELIVERY_METHOD"
  | "UNRECOGNIZED_DELIVERY_METHOD"
  | "INVALID_DATE";

export class GoalAdapterError extends Error {
  constructor(
    readonly code: GoalAdapterReasonCode,
    message: string,
  ) {
    super(message);
    this.name = "GoalAdapterError";
  }
}

export type RawGoalRow = Readonly<{
  title?: unknown;
  public_summary?: unknown;
  government_entity_id?: unknown;
  fill_payload?: unknown;
}>;

// The engine's allowlisted delivery methods. A stored value that is present
// but not one of these exact strings is treated as unrecognized rather than
// coerced, so materially different delivery methods are never collapsed
// into an ambiguous one.
const ALLOWED_DELIVERY_METHODS = new Set(["electronic", "inspection", "onsite_pickup", "usps_mail"]);

function readFillRequest(fillPayload: unknown): Record<string, unknown> {
  if (!fillPayload || typeof fillPayload !== "object" || Array.isArray(fillPayload)) {
    return {};
  }
  const request = (fillPayload as Record<string, unknown>).request;
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return {};
  }
  return request as Record<string, unknown>;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Builds the `request` object for RequestDocumentData from a goal's
 * approved public_summary and fill_payload. Throws GoalAdapterError when a
 * required stored value is missing, unrecognized, or malformed; callers
 * must treat that as "not generator-ready" rather than a bug, since the
 * fix is correcting approved goal/profile data, not user input.
 */
export function adaptGoalFillPayload(goal: RawGoalRow): Record<string, unknown> {
  const goalLanguage = readOptionalString(goal.public_summary);
  if (!goalLanguage) {
    throw new GoalAdapterError(
      "MISSING_GOAL_PURPOSE",
      "The goal has no approved public_summary to use as request context.",
    );
  }

  const request = readFillRequest(goal.fill_payload);

  const recordsDescription = readOptionalString(request.records_description);
  if (!recordsDescription) {
    throw new GoalAdapterError(
      "MISSING_RECORDS_DESCRIPTION",
      "The goal's approved fill_payload has no request.records_description.",
    );
  }

  const deliveryMethodRaw = readOptionalString(request.delivery_method);
  if (!deliveryMethodRaw) {
    throw new GoalAdapterError(
      "MISSING_DELIVERY_METHOD",
      "The goal's approved fill_payload has no request.delivery_method.",
    );
  }
  if (!ALLOWED_DELIVERY_METHODS.has(deliveryMethodRaw)) {
    throw new GoalAdapterError(
      "UNRECOGNIZED_DELIVERY_METHOD",
      `The goal's stored delivery method "${deliveryMethodRaw}" is not an approved value.`,
    );
  }

  const requestData: Record<string, unknown> = {
    goal_language: goalLanguage,
    records_description: recordsDescription,
    delivery_method: deliveryMethodRaw,
  };

  const departmentOrDivision = readOptionalString(request.department_or_division);
  if (departmentOrDivision) requestData.department_or_division = departmentOrDivision;

  const recordCategoryLabel = readOptionalString(request.record_category_label);
  if (recordCategoryLabel) requestData.record_category_label = recordCategoryLabel;

  const dateFromRaw = readOptionalString(request.date_from_mm_dd_yyyy);
  if (dateFromRaw) {
    try {
      requestData.date_from = normalizeMmDdYyyyToIsoDate(dateFromRaw);
    } catch (error) {
      if (error instanceof InvalidStoredDateError) {
        throw new GoalAdapterError("INVALID_DATE", error.message);
      }
      throw error;
    }
  }

  const dateToRaw = readOptionalString(request.date_to_mm_dd_yyyy);
  if (dateToRaw) {
    try {
      requestData.date_to = normalizeMmDdYyyyToIsoDate(dateToRaw);
    } catch (error) {
      if (error instanceof InvalidStoredDateError) {
        throw new GoalAdapterError("INVALID_DATE", error.message);
      }
      throw error;
    }
  }

  return requestData;
}

/**
 * Assembles the full (not yet Zod-validated) RequestDocumentData input from
 * a goal, its already-adapted request profile, and its already-adapted
 * government entity. Callers must run the result through
 * requestDocumentDataSchema.safeParse() before using it.
 */
export function buildRequestDocumentDataInput(
  goal: RawGoalRow,
  profile: Readonly<{ id: unknown; version: unknown; government_entity_id: unknown }>,
  entity: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    government_entity: entity,
    request: adaptGoalFillPayload(goal),
    profile: {
      id: profile.id,
      version: profile.version,
      government_entity_id: profile.government_entity_id,
    },
  };
}
