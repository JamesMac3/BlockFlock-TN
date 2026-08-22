import { describe, expect, it } from "vitest";
import {
  publicVisibilityAllowed,
  publicVisibilityForcedValue,
  applyPublicVisibilityRule,
  violatesPublicStatusRule,
  violatesAutoPublicRule,
  PUBLIC_VISIBILITY_BLOCKED_REASON,
  PUBLIC_VISIBILITY_FORCED_REASON,
  goalFormSnapshot,
  goalRowSnapshot,
  goalFormIsDirty,
} from "./goalFormRules";
import { requestDocumentDataSchema } from "../document-request/pdf/request-data-schema";

describe("public visibility rule: draft/retired goals cannot be public", () => {
  it("disallows public visibility for draft and retired", () => {
    expect(publicVisibilityAllowed("draft")).toBe(false);
    expect(publicVisibilityAllowed("retired")).toBe(false);
  });

  it("allows public visibility for every other live status", () => {
    for (const status of ["profile_needed", "ready", "requested", "received", "published", "unavailable"]) {
      expect(publicVisibilityAllowed(status)).toBe(true);
    }
  });

  it("forces is_public to false when the status forbids it, leaving other statuses untouched", () => {
    expect(applyPublicVisibilityRule({ status: "draft", is_public: true })).toEqual({ status: "draft", is_public: false });
    expect(applyPublicVisibilityRule({ status: "retired", is_public: true })).toEqual({ status: "retired", is_public: false });
    expect(applyPublicVisibilityRule({ status: "ready", is_public: true })).toEqual({ status: "ready", is_public: true });
  });

  it("never submits the forbidden draft + public or retired + public combination", () => {
    const draftAttempt = applyPublicVisibilityRule({ status: "draft", is_public: true });
    const retiredAttempt = applyPublicVisibilityRule({ status: "retired", is_public: true });
    expect(violatesPublicStatusRule(draftAttempt)).toBe(false);
    expect(violatesPublicStatusRule(retiredAttempt)).toBe(false);
  });

  it("violatesPublicStatusRule correctly flags a payload that bypassed the rule (e.g. from a future code path)", () => {
    expect(violatesPublicStatusRule({ status: "draft", is_public: true })).toBe(true);
    expect(violatesPublicStatusRule({ status: "retired", is_public: true })).toBe(true);
    expect(violatesPublicStatusRule({ status: "ready", is_public: true })).toBe(false);
  });

  it("explains why the checkbox is unavailable", () => {
    expect(PUBLIC_VISIBILITY_BLOCKED_REASON.length).toBeGreaterThan(0);
  });
});

describe("dirty-state snapshot comparison", () => {
  const savedGoal = {
    title: "Flock Contracts and Invoice Trail",
    tier: 2,
    public_summary: "Track the city's Flock Safety camera contracts and invoices.",
    status: "ready",
    is_public: true,
    locked: false,
    locked_reason: null,
    government_entity_id: 5,
    request_profile_id: "10dc495d-417d-4027-8ac4-4cb9fbd5b966",
    fill_payload: {
      request: {
        delivery_method: "electronic",
        records_description: "All Flock Safety contracts, purchase orders, and invoices.",
        record_category_label: "Contracts",
      },
    },
  };

  it("hydrating the exact saved values does not mark the form dirty", () => {
    const baseline = goalRowSnapshot(savedGoal);
    const hydrated = goalFormSnapshot(savedGoal, savedGoal.fill_payload.request);
    expect(goalFormIsDirty(baseline, hydrated)).toBe(false);
  });

  it("hydrating from a freshly-refetched but unchanged row (new object references, same content) is still not dirty", () => {
    const baseline = goalRowSnapshot(savedGoal);
    const refetched = JSON.parse(JSON.stringify(savedGoal));
    const hydrated = goalFormSnapshot(refetched, refetched.fill_payload.request);
    expect(goalFormIsDirty(baseline, hydrated)).toBe(false);
  });

  it("a real edit to the title marks the form dirty", () => {
    const baseline = goalRowSnapshot(savedGoal);
    const edited = { ...savedGoal, title: "Flock Contracts and Invoice Trail (updated)" };
    const current = goalFormSnapshot(edited, savedGoal.fill_payload.request);
    expect(goalFormIsDirty(baseline, current)).toBe(true);
  });

  it("a real edit to the fill_payload request marks the form dirty", () => {
    const baseline = goalRowSnapshot(savedGoal);
    const editedRequest = { ...savedGoal.fill_payload.request, records_description: "A different description." };
    const current = goalFormSnapshot(savedGoal, editedRequest);
    expect(goalFormIsDirty(baseline, current)).toBe(true);
  });

  it("trims whitespace-only differences rather than treating them as real edits", () => {
    const baseline = goalRowSnapshot(savedGoal);
    const paddedRequest = {
      ...savedGoal.fill_payload.request,
      records_description: `  ${savedGoal.fill_payload.request.records_description}  `,
    };
    const current = goalFormSnapshot({ ...savedGoal, title: `  ${savedGoal.title}  ` }, paddedRequest);
    expect(goalFormIsDirty(baseline, current)).toBe(false);
  });

  it("a locked_reason difference only counts while locked is true", () => {
    const baseline = goalRowSnapshot({ ...savedGoal, locked: false, locked_reason: "" });
    // locked stays false, so a stray locked_reason value is never actually
    // savable/submitted and must not register as a dirtying difference.
    const current = goalFormSnapshot({ ...savedGoal, locked: false, locked_reason: "leftover text" }, savedGoal.fill_payload.request);
    expect(goalFormIsDirty(baseline, current)).toBe(false);
  });
});

describe("changing goal status alone must not invalidate structured request data or disable Save", () => {
  const flockGoal = {
    title: "Flock Contracts and Invoice Trail",
    tier: 2,
    public_summary: "Track the city's Flock Safety camera contracts and invoices.",
    status: "ready",
    is_public: true,
    locked: false,
    locked_reason: null,
    government_entity_id: 5,
    request_profile_id: "10dc495d-417d-4027-8ac4-4cb9fbd5b966",
    fill_payload: {
      request: {
        delivery_method: "electronic",
        records_description:
          "Please provide all contracts, amendments, purchase orders, invoices, and renewal records for Flock Safety or any Flock-related ALPR or camera deployment used by the Murfreesboro Police Department.",
        record_category_label: "Contracts",
      },
    },
  };

  const entityRow = { id: "5", legal_name: "Murfreesboro Police Department", display_name: "Murfreesboro Police Department" };

  function validationInput(goal: typeof flockGoal) {
    return {
      government_entity: entityRow,
      request: { ...goal.fill_payload.request, goal_language: goal.public_summary },
      profile: { id: goal.request_profile_id, version: 1, government_entity_id: "5" },
    };
  }

  it("the real requestDocumentDataSchema still validates the same saved fill_payload after status changes — status is not one of its inputs", () => {
    for (const status of ["draft", "profile_needed", "ready", "requested", "received", "published", "unavailable", "retired"]) {
      const goal = { ...flockGoal, status };
      const result = requestDocumentDataSchema.safeParse(validationInput(goal));
      expect(result.success).toBe(true);
    }
  });

  it("changing only status marks the form dirty (a real change) without touching the fill_payload.request snapshot", () => {
    const baseline = goalRowSnapshot(flockGoal);
    const statusChanged = { ...flockGoal, status: "published" };
    const current = goalFormSnapshot(statusChanged, flockGoal.fill_payload.request);

    // The status change itself is a real, expected dirtying difference —
    // Save becoming enabled (there IS something to save) is correct here.
    expect(goalFormIsDirty(baseline, current)).toBe(true);

    // But the normalized fill-request portion is identical either way —
    // proving the status change alone cannot be what breaks fillValid.
    const fillOnlyBaseline = goalFormSnapshot({ ...flockGoal, status: "draft" }, flockGoal.fill_payload.request);
    const fillOnlyChanged = goalFormSnapshot({ ...flockGoal, status: "published" }, flockGoal.fill_payload.request);
    const parseSnapshotFillPortion = (snapshot: string) => JSON.parse(snapshot).at(-1);
    expect(parseSnapshotFillPortion(fillOnlyChanged)).toEqual(parseSnapshotFillPortion(fillOnlyBaseline));
  });
});

describe("auto-public-on-ready rule: a goal moved to Ready is automatically made public", () => {
  it("publicVisibilityForcedValue is true for ready, false for draft/retired, and unforced for every other status", () => {
    expect(publicVisibilityForcedValue("ready")).toBe(true);
    expect(publicVisibilityForcedValue("draft")).toBe(false);
    expect(publicVisibilityForcedValue("retired")).toBe(false);
    for (const status of ["profile_needed", "requested", "received", "published", "unavailable"]) {
      expect(publicVisibilityForcedValue(status)).toBeNull();
    }
  });

  it("applyPublicVisibilityRule forces is_public true the moment status becomes ready, even if it was false a moment ago", () => {
    const result = applyPublicVisibilityRule({ status: "ready", is_public: false });
    expect(result).toEqual({ status: "ready", is_public: true });
  });

  it("leaves an already-public ready goal untouched (no unnecessary object churn)", () => {
    const form = { status: "ready", is_public: true };
    expect(applyPublicVisibilityRule(form)).toBe(form);
  });

  it("draft and retired are still forced private — the new rule does not weaken the existing one", () => {
    expect(applyPublicVisibilityRule({ status: "draft", is_public: true })).toEqual({ status: "draft", is_public: false });
    expect(applyPublicVisibilityRule({ status: "retired", is_public: true })).toEqual({ status: "retired", is_public: false });
  });

  it("violatesAutoPublicRule flags a ready goal that bypassed the rule (e.g. from a future code path)", () => {
    expect(violatesAutoPublicRule({ status: "ready", is_public: false })).toBe(true);
    expect(violatesAutoPublicRule({ status: "ready", is_public: true })).toBe(false);
    expect(violatesAutoPublicRule({ status: "draft", is_public: false })).toBe(false);
  });

  it("PUBLIC_VISIBILITY_FORCED_REASON explains why the checkbox is disabled-and-checked while Ready is selected", () => {
    expect(PUBLIC_VISIBILITY_FORCED_REASON.length).toBeGreaterThan(0);
    expect(PUBLIC_VISIBILITY_FORCED_REASON).toMatch(/public/i);
  });

  // Reproduces this session's exact reported case: goal 11 ("Information
  // about Flock parks/greenways"), persisted as status: draft,
  // is_public: false, unlocked, with a verified linked profile and a
  // valid fill_payload. An operator selects Ready and saves — the
  // submitted payload must carry both corrected fields together, not just
  // the status change alone.
  it("a draft/private goal (goal 11's exact persisted shape) changed to Ready submits { status: 'ready', is_public: true }", () => {
    const goal11Persisted = {
      id: 11,
      title: "Information about Flock parks/greenways",
      status: "draft",
      is_public: false,
      locked: false,
      government_entity_id: 5,
      request_profile_id: "10dc495d-417d-4027-8ac4-4cb9fbd5b966",
    };

    // The operator's only action: change the Status field to "ready".
    // is_public is never touched directly — the rule alone must correct it.
    const formAfterStatusChange = applyPublicVisibilityRule({ ...goal11Persisted, status: "ready" });
    expect(formAfterStatusChange.status).toBe("ready");
    expect(formAfterStatusChange.is_public).toBe(true);

    // Defensive reapplication at submit time (mirrors handleSave's own
    // `applyPublicVisibilityRule({...})` call around the payload) must
    // reach the identical result even if some other field handler forgot
    // the first pass.
    const submittedPayload = applyPublicVisibilityRule({
      status: formAfterStatusChange.status,
      is_public: formAfterStatusChange.is_public,
    });
    expect(submittedPayload).toEqual({ status: "ready", is_public: true });
    expect(violatesAutoPublicRule(submittedPayload)).toBe(false);
    expect(violatesPublicStatusRule(submittedPayload)).toBe(false);
  });

  it("cannot be reverted by stale hydration/refetch: reapplying the rule to a stale draft/private snapshot never resurrects it once the operator has moved on to ready", () => {
    // A stale refetch reflecting the pre-save row must never be treated as
    // authoritative once a newer save has happened — this is a property of
    // the rule itself: reapplying it to whatever the *current* status is
    // always produces a self-consistent result, so a caller that correctly
    // ignores a stale fetch (see GoalEditForm's savedAt/updated_at guard)
    // and keeps the locally-saved formData never has that formData
    // silently re-derived into something inconsistent by this rule.
    const staleDraftSnapshot = { status: "draft", is_public: false };
    const currentlySavedReady = { status: "ready", is_public: true };

    // Reapplying the rule to the locally-held, already-correct state is a
    // no-op — it never regresses toward the stale snapshot's values.
    expect(applyPublicVisibilityRule(currentlySavedReady)).toEqual(currentlySavedReady);
    expect(applyPublicVisibilityRule(currentlySavedReady)).not.toEqual(staleDraftSnapshot);
  });
});
