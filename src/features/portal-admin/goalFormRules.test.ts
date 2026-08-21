import { describe, expect, it } from "vitest";
import {
  publicVisibilityAllowed,
  applyPublicVisibilityRule,
  violatesPublicStatusRule,
  PUBLIC_VISIBILITY_BLOCKED_REASON,
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
