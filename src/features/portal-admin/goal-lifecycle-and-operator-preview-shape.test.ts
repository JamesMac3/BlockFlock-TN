import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import goalsManagerSource from "../../components/records-request-goals/RecordsRequestGoalsManager.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import operatorPreviewSource from "../../components/records-request-goals/OperatorDraftPreviewButton.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import tiersSource from "../../components/records-request-goals/RecordsRequestGoalsTiers.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import goalsPageSource from "../../pages/RecordsRequestGoalsPage.jsx?raw";

/**
 * This project has no React component-render test harness, so these are
 * source-shape assertions proving the real components implement the
 * intended behavior (not merely describing it) — the pure-logic rule
 * itself is separately proven in goalFormRules.test.ts.
 */

describe("GoalEditForm: Ready persistence — payload, checkbox wiring, and post-save state", () => {
  const editFormBlock = goalsManagerSource.match(/function GoalEditForm\([\s\S]*?\n^}/m)?.[0] ?? "";

  it("GoalEditForm is present in this file (sanity check that the extraction regex still matches)", () => {
    expect(editFormBlock).not.toBe("");
  });

  it("the status <select>'s onChange routes through updateField, which applies applyPublicVisibilityRule to every field change", () => {
    expect(editFormBlock).toMatch(/onChange=\{\(e\) => updateField\(\{ status: e\.target\.value \}\)\}/);
    expect(goalsManagerSource).toMatch(
      /function updateField\(changes\) \{\s*\n\s*setFormData\(\(current\) => applyPublicVisibilityRule\(\{ \.\.\.current, \.\.\.changes \}\)\);/,
    );
  });

  it("the submitted payload reapplies applyPublicVisibilityRule defensively, not just the field handler", () => {
    expect(editFormBlock).toMatch(/const payload = applyPublicVisibilityRule\(\{/);
  });

  it("the Public checkbox is disabled whenever a value is forced (draft/retired -> false, ready -> true), not just for the blocked case", () => {
    expect(editFormBlock).toMatch(/disabled=\{publicVisibilityForcedValue\(formData\.status\) !== null\}/);
  });

  it("shows the forced-public explanation exactly while Ready is selected", () => {
    expect(editFormBlock).toMatch(/publicVisibilityForcedValue\(formData\.status\) === true &&/);
    expect(editFormBlock).toMatch(/\{PUBLIC_VISIBILITY_FORCED_REASON\}/);
  });

  it("after a successful save, formData is updated to exactly match the persisted payload — not left showing pre-correction values", () => {
    const saveBlock = editFormBlock.match(/async function handleSave\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(saveBlock).toMatch(/const savedFormData = \{ \.\.\.formData, \.\.\.payload \};/);
    expect(saveBlock).toMatch(/setFormData\(savedFormData\);/);
    expect(saveBlock).toMatch(/setBaselineSnapshot\(goalFormSnapshot\(savedFormData, fillRequest\)\);/);
  });

  it("the re-hydration effect refuses to apply a fetched goal row that is older than the last local save (the stale-restore guard)", () => {
    const effectBlock = editFormBlock.match(/useEffect\(\(\) => \{\s*\n\s*if \(dirty\) return undefined;[\s\S]*?\n {2}\}, \[goal\]\);/)?.[0] ?? "";
    expect(effectBlock).not.toBe("");
    expect(effectBlock).toMatch(/const fetchedUpdatedAt = goal\.updated_at \? new Date\(goal\.updated_at\)\.getTime\(\) : 0;/);
    expect(effectBlock).toMatch(/if \(savedAt && fetchedUpdatedAt < savedAt\) return;/);
  });

  it("editing keeps the panel open — onSave/onUpdate is called, never onClose, from inside handleSave", () => {
    const saveBlock = editFormBlock.match(/async function handleSave\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(saveBlock).toMatch(/onSave\(\);/);
    expect(saveBlock).not.toMatch(/onCancel\(\);/);
  });
});

describe("GoalForm (create): the same auto-public-on-ready rule applies to goal creation", () => {
  const createFormBlock = goalsManagerSource.match(/function GoalForm\([\s\S]*?\n^}/m)?.[0] ?? "";

  it("the create form's status <select> applies applyPublicVisibilityRule on every change", () => {
    expect(createFormBlock).toMatch(
      /onChange=\{\(e\) => setFormData\(\(current\) => applyPublicVisibilityRule\(\{ \.\.\.current, status: e\.target\.value \}\)\)\}/,
    );
  });

  it("the create form's submitted payload reapplies the rule defensively", () => {
    expect(createFormBlock).toMatch(/const goalData = applyPublicVisibilityRule\(\{/);
  });

  it("the create form's Public checkbox is disabled for every forced status, not just the blocked one", () => {
    expect(createFormBlock).toMatch(/disabled=\{publicVisibilityForcedValue\(formData\.status\) !== null\}/);
    expect(createFormBlock).toMatch(/\{PUBLIC_VISIBILITY_FORCED_REASON\}/);
  });
});

describe("OperatorDraftPreviewButton: profile-aware, dual-pipeline preview", () => {
  it("never calls get_draft_request_preview_bundle for a verified profile — the draft RPC path is only reachable in draft mode", () => {
    const verifiedHandlerBlock = operatorPreviewSource.match(/async function handleVerifiedPreview\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(verifiedHandlerBlock).not.toMatch(/get_draft_request_preview_bundle/);
    expect(verifiedHandlerBlock).not.toMatch(/fetchDraftPreviewBundle/);
  });

  it("fetches the linked profile's own status before deciding which pipeline (or neither) to offer", () => {
    expect(operatorPreviewSource).toMatch(/\.from\("request_profiles"\)\s*\n\s*\.select\("status"\)/);
  });

  it("renders nothing unless the profile is exactly draft or verified", () => {
    expect(operatorPreviewSource).toMatch(/if \(!baseEligible \|\| \(!isDraftMode && !isVerifiedMode\)\) return null;/);
  });

  it("draft mode retains the exact original RPC + operator-preview-readiness + generateOperatorPreviewDocument workflow", () => {
    const draftHandlerBlock = operatorPreviewSource.match(/async function handleDraftPreview\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(draftHandlerBlock).toMatch(/fetchDraftPreviewBundle\(\{ supabase, goalId: goal\.id \}\)/);
    expect(draftHandlerBlock).toMatch(/evaluateOperatorPreviewReadiness\(/);
    expect(draftHandlerBlock).toMatch(/generateOperatorPreviewDocument\(/);
  });

  it("verified mode uses the exact same evaluateGoalReadiness + generateRequestDocument pipeline the public generator uses", () => {
    const verifiedHandlerBlock = operatorPreviewSource.match(/async function handleVerifiedPreview\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(verifiedHandlerBlock).toMatch(/import\("\.\.\/\.\.\/features\/document-request\/pdf\/readiness"\)/);
    expect(verifiedHandlerBlock).toMatch(/evaluateGoalReadiness\(\{/);
    expect(verifiedHandlerBlock).toMatch(/import\("\.\.\/\.\.\/features\/document-request\/pdf\/generate-request-document"\)/);
    expect(verifiedHandlerBlock).toMatch(/generateRequestDocument\(readiness\.profile, readiness\.data, \{ supabase \}\)/);
  });

  it("a verified-mode readiness failure shows readiness.message directly — never a raw database/storage error", () => {
    const verifiedHandlerBlock = operatorPreviewSource.match(/async function handleVerifiedPreview\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(verifiedHandlerBlock).toMatch(/headline: readiness\.message/);
  });

  it("button label and helper text switch between Draft and Verified wording based on the resolved profile status", () => {
    expect(operatorPreviewSource).toMatch(/isDraftMode\s*\n\s*\? "Preview Draft Request Form"\s*\n\s*: "Preview Verified Request Form"/);
  });

  it("RequestDeliveryPanel's draftPreview flag is only set true in draft mode — a verified preview shows as a real prefilled request, not a draft banner", () => {
    expect(operatorPreviewSource).toMatch(/draftPreview=\{isDraftMode\}/);
  });

  it("both catch blocks log the full causeValue chain, not just the generic top-level wrapper error", () => {
    // template-resolver.ts re-wraps whatever a renderer throws into one
    // generic RENDERER_FAILED TemplateResolverError — logging only that
    // top-level error hides the actual, specific underlying failure
    // (e.g. a well-formed AcroformRendererError with its own diagnostics)
    // one or two .causeValue levels down.
    expect(operatorPreviewSource).toMatch(/function logGenerationErrorChain\(label, error\) \{/);
    expect(operatorPreviewSource).toMatch(/while \(current\?\.causeValue && depth < 5\) \{/);
    const draftCatchBlock = operatorPreviewSource.match(/async function handleDraftPreview\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    const verifiedCatchBlock = operatorPreviewSource.match(/async function handleVerifiedPreview\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(draftCatchBlock).toMatch(/logGenerationErrorChain\("Operator draft preview failed:", previewError\);/);
    expect(verifiedCatchBlock).toMatch(/logGenerationErrorChain\("Verified operator preview failed:", previewError\);/);
  });
});

describe("RecordsRequestGoalsTiers (public roadmap): the operator preview button decides for itself, and the public generator is untouched", () => {
  it("no longer gates OperatorDraftPreviewButton on profile.status === 'draft' — the button now handles every profile state internally", () => {
    expect(tiersSource).not.toMatch(/profile\?\.status === "draft" &&/);
    expect(tiersSource).toMatch(/<OperatorDraftPreviewButton goal=\{goal\} county=\{county\} \/>/);
  });

  it("the public 'Prepare Request Form' path is unchanged: evaluateGoalReadiness feeds generateRequestDocument directly", () => {
    expect(tiersSource).toMatch(/evaluateGoalReadiness\(\{ goal, profileRow, entityRow \}\)/);
    expect(tiersSource).toMatch(/generateRequestDocument\(readiness\.result\.profile, readiness\.result\.data, \{ supabase \}\)/);
  });
});

describe("Public roadmap query: is_public=true and status not in (draft, retired) — unchanged, still enforced", () => {
  it("the goals query filters on is_public and excludes draft/retired", () => {
    expect(goalsPageSource).toMatch(/\.eq\("is_public", true\)/);
    expect(goalsPageSource).toMatch(/\.neq\("status", "draft"\)/);
    expect(goalsPageSource).toMatch(/\.neq\("status", "retired"\)/);
  });
});
