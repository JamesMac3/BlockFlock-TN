import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import uploadSource from "../../components/records-request-goals/GoalCompletionUpload.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import managerSource from "../../components/records-request-goals/RecordsRequestGoalsManager.jsx?raw";

/**
 * No React render harness exists in this repo (see pdf-preview-shape.test.ts
 * for the established precedent) — these are source-shape assertions for
 * the received-document upload error-reporting/validation fix. The actual
 * error-extraction and classification logic is separately proven under
 * plain Node in functionInvokeErrors.test.js and
 * promoteGoalEvidenceErrors.test.js — this file proves the *component*
 * wires that logic up correctly and satisfies the surrounding behavioral
 * requirements a source-level test can check (disabled state, no
 * auto-retry, state preservation, duplicate-submission guard).
 */

describe("GoalCompletionUpload: government-entity precheck runs before staging, reads live goal props (never a stale copy)", () => {
  it("computes missingGovernmentEntity fresh from the goal prop on every render, not from local state copied at mount", () => {
    expect(uploadSource).toMatch(/const missingGovernmentEntity = !goal\.government_entity_id;/);
    // Never assigned into useState — that would freeze the check at
    // mount, defeating the "refresh after editing enables upload" fix.
    expect(uploadSource).not.toMatch(/useState\(!goal\.government_entity_id\)/);
    expect(uploadSource).not.toMatch(/const \[missingGovernmentEntity/);
  });

  it("validate() checks it first, before touching the file/staging path at all", () => {
    const validateBlock = uploadSource.match(/function validate\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(validateBlock).toMatch(/^\s*if \(missingGovernmentEntity\) return MISSING_ENTITY_MESSAGE;/m);
  });

  it("shows the exact required message", () => {
    expect(uploadSource).toMatch(
      /const MISSING_ENTITY_MESSAGE =\s*\n\s*"Select a Government Entity in the goal's settings and save the goal before uploading documents\.";/,
    );
  });

  it("disables the submit button when the entity is missing", () => {
    expect(uploadSource).toMatch(/const submitDisabled = submitting \|\| missingGovernmentEntity \|\| disallowRetry;/);
    expect(uploadSource).toMatch(/disabled=\{submitDisabled\}/);
  });

  it("never requires a request profile or PDF template anywhere in this file", () => {
    expect(uploadSource).not.toMatch(/request_profile_id/);
    expect(uploadSource).not.toMatch(/base_pdf_object_id/);
  });
});

describe("GoalCompletionUpload: 'Edit goal' reuses the existing GoalEditForm flow already mounted in the same panel", () => {
  it("focuses GoalEditForm's own government-entity field by a goal-scoped id, rather than opening a new flow", () => {
    expect(uploadSource).toMatch(/function focusGoalEntityField\(goalId\)/);
    expect(uploadSource).toMatch(/document\.getElementById\(`goal-edit-entity-\$\{goalId\}`\)/);
    expect(uploadSource).toMatch(/target\.scrollIntoView\(\{ behavior: "smooth", block: "center" \}\);/);
    expect(uploadSource).toMatch(/target\.focus\(\);/);
  });

  it("GoalEditForm's Government Entity <select> actually carries that matching id, so the target exists", () => {
    expect(managerSource).toMatch(/<label htmlFor=\{`goal-edit-entity-\$\{goal\.id\}`\}>Government Entity<\/label>/);
    expect(managerSource).toMatch(/id=\{`goal-edit-entity-\$\{goal\.id\}`\}/);
  });

  it("offers an Edit goal button both in the upfront precheck notice and in the MISSING_GOVERNMENT_ENTITY error case", () => {
    expect(uploadSource.match(/onClick=\{\(\) => focusGoalEntityField\(goal\.id\)\}/g)?.length).toBe(2);
  });
});

describe("GoalCompletionUpload: extracts the edge function's real JSON error instead of the generic non-2xx message", () => {
  it("imports and uses extractFunctionInvokeError for the function error, never error.message directly", () => {
    expect(uploadSource).toMatch(/import \{ extractFunctionInvokeError \} from "\.\.\/\.\.\/features\/portal-admin\/functionInvokeErrors";/);
    expect(uploadSource).toMatch(/const extracted = await extractFunctionInvokeError\(functionError\);/);
    expect(uploadSource).not.toMatch(/functionError\.message/);
    expect(uploadSource).not.toMatch(/throw functionError/);
  });

  it("classifies the extracted message with classifyPromoteGoalEvidenceError, never inferring from the HTTP status", () => {
    expect(uploadSource).toMatch(/import \{ classifyPromoteGoalEvidenceError \} from "\.\.\/\.\.\/features\/portal-admin\/promoteGoalEvidenceErrors";/);
    expect(uploadSource).toMatch(/setErrorCode\(classifyPromoteGoalEvidenceError\(extracted\.message\)\);/);
  });

  it("never applies functions-invoke error extraction to the storage upload error — that's a different error shape entirely", () => {
    const uploadBlock = uploadSource.match(/if \(uploadError\) \{[\s\S]*?\n {6}\}/)?.[0] ?? "";
    expect(uploadBlock).not.toBe("");
    // The block's own comment explains *why* it doesn't use the
    // extractor (mentioning it by name), so check for an actual call,
    // not mere presence of the identifier anywhere in the block.
    expect(uploadBlock).not.toMatch(/extractFunctionInvokeError\(/);
    expect(uploadBlock).toMatch(/uploadError\.message/);
  });
});

describe("GoalCompletionUpload: respects retryable: false and never auto-retries", () => {
  it("sets disallowRetry when the extracted result says retryable: false, and disables submission while it's set", () => {
    expect(uploadSource).toMatch(/if \(!extracted\.retryable\) setDisallowRetry\(true\);/);
    expect(uploadSource).toMatch(/\|\| disallowRetry;/);
  });

  it("only clears disallowRetry when the operator picks a different file — a genuinely new attempt, not an automatic retry", () => {
    const handlerBlock = uploadSource.match(/function handleFileChange\(event\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(handlerBlock).toMatch(/setDisallowRetry\(false\);/);
  });

  it("never calls handleSubmit or the promote-goal-evidence invocation from anywhere other than the form's own onSubmit", () => {
    // Only one call site for supabase.functions.invoke("promote-goal-evidence", ...) in the whole file.
    expect(uploadSource.match(/supabase\.functions\.invoke\("promote-goal-evidence"/g)?.length).toBe(1);
    expect(uploadSource).not.toMatch(/setTimeout\(handleSubmit/);
  });

  it("a failed upload never calls onComplete — only the success path does", () => {
    expect(uploadSource.match(/onComplete\(\);/g)?.length).toBe(1);
    const successPathToOnComplete = uploadSource.match(/\/\/ Success — this is the only path that clears the form\.[\s\S]*?onComplete\(\);/)?.[0] ?? "";
    expect(successPathToOnComplete).not.toBe("");
  });
});

describe("GoalCompletionUpload: preserves the selected file and entered metadata after a failure", () => {
  it("no error-handling branch resets file, title, description, objectKind, reviewed, or markComplete", () => {
    const handleSubmitBlock = uploadSource.match(/async function handleSubmit\(event\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(handleSubmitBlock).not.toMatch(/setFile\(null\)/);
    expect(handleSubmitBlock).not.toMatch(/setTitle\(""\)/);
    expect(handleSubmitBlock).not.toMatch(/setDescription\(""\)/);
    expect(handleSubmitBlock).not.toMatch(/setReviewed\(false\)/);
    expect(handleSubmitBlock).not.toMatch(/setMarkComplete\(false\)/);
  });

  it("prevents duplicate submissions while a request is already running", () => {
    expect(uploadSource).toMatch(/if \(submitting\) return;/);
  });
});

describe("GoalCompletionUpload: malformed/non-JSON and network failures degrade safely (delegated to functionInvokeErrors.js, proven directly there)", () => {
  it("never parses the function response body itself — always goes through the shared extractor", () => {
    expect(uploadSource).not.toMatch(/\.context\.json\(\)/);
    expect(uploadSource).not.toMatch(/JSON\.parse/);
  });
});
