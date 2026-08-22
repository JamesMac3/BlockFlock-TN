/**
 * Pure rules shared by the create-goal form, the edit-goal form, and their
 * tests. Nothing here touches Supabase, React, or the DOM — the forms
 * import these so the create and edit paths cannot drift apart, and so the
 * rules can be proven without rendering anything.
 */

/**
 * The live database constraint is `is_public = false when status is draft
 * or retired`. The UI must never submit the forbidden combination in the
 * first place, so this list is the single source of truth for both the
 * forced value and the disabled/explained checkbox.
 */
export const PRIVATE_ONLY_GOAL_STATUSES = ["draft", "retired"] as const;

export type PrivateOnlyGoalStatus = (typeof PRIVATE_ONLY_GOAL_STATUSES)[number];

/**
 * A goal moved to "ready" is automatically made public — there is no
 * separate operator decision to make. This is a UI/product rule, not a
 * live database constraint (the constraint only forbids draft/retired +
 * public; it does not require ready + public), so it lives here exactly
 * like the draft/retired rule: forced on every status change AND reapplied
 * defensively on the submitted payload.
 */
export const AUTO_PUBLIC_GOAL_STATUS = "ready" as const;

export const PUBLIC_VISIBILITY_BLOCKED_REASON =
  "Draft and retired goals are always private. Move the goal to another status before making it public.";

export const PUBLIC_VISIBILITY_FORCED_REASON =
  "Ready goals are automatically public so visitors can prepare the request form.";

export function publicVisibilityAllowed(status: unknown): boolean {
  return !PRIVATE_ONLY_GOAL_STATUSES.includes(status as PrivateOnlyGoalStatus);
}

/**
 * Returns the value is_public is locked to for the given status, or `null`
 * if the operator is free to choose. Single source of truth for both the
 * forced value applied to form state / the submitted payload, and for
 * whether the Public checkbox should render disabled.
 */
export function publicVisibilityForcedValue(status: unknown): boolean | null {
  if (PRIVATE_ONLY_GOAL_STATUSES.includes(status as PrivateOnlyGoalStatus)) return false;
  if (status === AUTO_PUBLIC_GOAL_STATUS) return true;
  return null;
}

/**
 * Forces is_public to whatever the current status requires (false for
 * draft/retired, true for ready), leaving it to the operator's choice for
 * every other status. Applied to form state on every status change AND
 * again to the object actually submitted, so a stale checkbox value can
 * never reach the database even if a future edit path forgets to re-run
 * the first check.
 */
export function applyPublicVisibilityRule<T extends { status?: unknown; is_public?: unknown }>(
  form: T,
): T {
  const forced = publicVisibilityForcedValue(form.status);
  if (forced === null) return form;
  if (form.is_public === forced) return form;
  return { ...form, is_public: forced };
}

/**
 * True only for the exact combination the live constraint rejects. Used by
 * the regression tests to assert that no submitted payload ever carries it.
 */
export function violatesPublicStatusRule(payload: { status?: unknown; is_public?: unknown }): boolean {
  return Boolean(payload.is_public) && !publicVisibilityAllowed(payload.status);
}

/**
 * True whenever a goal is "ready" but was submitted without is_public
 * forced true. Used by the regression tests to assert the auto-public rule
 * is actually applied, not merely available.
 */
export function violatesAutoPublicRule(payload: { status?: unknown; is_public?: unknown }): boolean {
  return payload.status === AUTO_PUBLIC_GOAL_STATUS && payload.is_public !== true;
}

// ---------------------------------------------------------------------------
// Dirty-state comparison
// ---------------------------------------------------------------------------

/**
 * Normalizes one stored/edited `fill_payload.request` object for comparison
 * and for saving: string values are trimmed, and blank or non-string values
 * are dropped entirely. This is what makes hydration non-dirtying — a
 * saved payload and the freshly hydrated form values normalize to the same
 * object even though one arrived as JSON from Postgres and the other from
 * React input state.
 */
export function normalizeFillRequest(request: unknown): Record<string, string> {
  if (!request || typeof request !== "object" || Array.isArray(request)) return {};
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(request as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "") continue;
    normalized[key] = trimmed;
  }
  return normalized;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeId(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

export type GoalFormValues = Readonly<{
  title?: unknown;
  tier?: unknown;
  public_summary?: unknown;
  status?: unknown;
  is_public?: unknown;
  locked?: unknown;
  locked_reason?: unknown;
  government_entity_id?: unknown;
  request_profile_id?: unknown;
}>;

/**
 * A stable, order-independent string form of everything the goal editor can
 * change. Dirty state is `snapshot(baseline) !== snapshot(current)` — an
 * actual value comparison, never "some effect fired", so initial hydration
 * and revalidation cannot mark a untouched form dirty.
 */
export function goalFormSnapshot(values: GoalFormValues, fillRequest: unknown): string {
  const normalizedFill = normalizeFillRequest(fillRequest);
  const fillEntries = Object.keys(normalizedFill)
    .sort()
    .map((key) => [key, normalizedFill[key]]);

  return JSON.stringify([
    normalizeText(values.title),
    values.tier === null || values.tier === undefined ? "" : String(values.tier),
    normalizeText(values.public_summary),
    normalizeText(values.status),
    Boolean(values.is_public),
    Boolean(values.locked),
    Boolean(values.locked) ? normalizeText(values.locked_reason) : "",
    normalizeId(values.government_entity_id),
    normalizeId(values.request_profile_id),
    fillEntries,
  ]);
}

/** Reads the saved baseline snapshot straight off a goal row. */
export function goalRowSnapshot(goal: GoalFormValues & { fill_payload?: unknown }): string {
  const fillPayload = goal.fill_payload;
  const request =
    fillPayload && typeof fillPayload === "object" && !Array.isArray(fillPayload)
      ? (fillPayload as Record<string, unknown>).request
      : undefined;
  return goalFormSnapshot(goal, request);
}

export function goalFormIsDirty(baselineSnapshot: string, currentSnapshot: string): boolean {
  return baselineSnapshot !== currentSnapshot;
}
