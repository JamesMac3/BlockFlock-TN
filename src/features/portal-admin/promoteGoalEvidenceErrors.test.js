import { describe, expect, it } from "vitest";
import { classifyPromoteGoalEvidenceError } from "./promoteGoalEvidenceErrors";

// Every literal string below is copied verbatim from
// supabase/functions/promote-goal-evidence/index.ts — if that file's
// wording ever changes, this test (and the classifier) must be updated to
// match, which is the intended tight coupling: the classifier only ever
// recognizes the function's *actual* current strings, never a guess.
describe("classifyPromoteGoalEvidenceError: distinguishes every known rejection reason — never inferred from a shared HTTP status", () => {
  it.each([
    ["Authentication required.", "AUTH_REQUIRED"],
    ["Not authorized to add a resource to this goal.", "NOT_AUTHORIZED"],
    ["Goal not found.", "GOAL_NOT_FOUND"],
    ["This goal is locked and cannot receive resources.", "GOAL_LOCKED"],
    ["This goal is not in a state that can receive resources.", "GOAL_NOT_ACTIVE"],
    ["This goal has no linked government entity.", "MISSING_GOVERNMENT_ENTITY"],
    ["The private upload path is not within this goal's county.", "COUNTY_PATH_MISMATCH"],
    ["The uploaded file could not be found or read.", "STAGED_FILE_NOT_FOUND"],
    ["The document size is outside the allowed range.", "SIZE_OUT_OF_RANGE"],
    ["The file's content does not match a supported, verifiable document type.", "UNSUPPORTED_FILE"],
    ["Unsupported document MIME type.", "UNSUPPORTED_FILE"],
  ])("%s -> %s", (message, code) => {
    expect(classifyPromoteGoalEvidenceError(message)).toBe(code);
  });

  it("distinguishes locked from draft/retired — both are 403s but must not collapse into the same code", () => {
    expect(classifyPromoteGoalEvidenceError("This goal is locked and cannot receive resources.")).toBe("GOAL_LOCKED");
    expect(classifyPromoteGoalEvidenceError("This goal is not in a state that can receive resources.")).toBe("GOAL_NOT_ACTIVE");
  });

  it("distinguishes missing government entity from insufficient permissions — both are also 403s", () => {
    expect(classifyPromoteGoalEvidenceError("This goal has no linked government entity.")).toBe("MISSING_GOVERNMENT_ENTITY");
    expect(classifyPromoteGoalEvidenceError("Not authorized to add a resource to this goal.")).toBe("NOT_AUTHORIZED");
  });

  it("recognizes the dynamic publish-failure message by its fixed prefix", () => {
    expect(classifyPromoteGoalEvidenceError("The document could not be published: some storage detail.")).toBe("PUBLISH_FAILED");
  });

  it("recognizes the rollback-failure message", () => {
    expect(classifyPromoteGoalEvidenceError(
      "The document could not be completed, and the uploaded copy could not be fully rolled back. Contact an administrator.",
    )).toBe("ROLLBACK_FAILED");
  });

  it("falls back to UNKNOWN for a dynamic completionError.message it has never seen, without throwing", () => {
    expect(classifyPromoteGoalEvidenceError("relation \"internal_table\" does not exist")).toBe("UNKNOWN");
  });

  it("falls back to UNKNOWN safely for a non-string input", () => {
    expect(classifyPromoteGoalEvidenceError(undefined)).toBe("UNKNOWN");
    expect(classifyPromoteGoalEvidenceError(null)).toBe("UNKNOWN");
  });
});
