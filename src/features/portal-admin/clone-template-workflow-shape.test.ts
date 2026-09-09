import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import goalsManagerSource from "../../components/records-request-goals/RecordsRequestGoalsManager.jsx?raw";

/**
 * This project has no React component-render test harness, so these are
 * source-shape assertions proving the real "Clone Template to County"
 * component implements the intended behavior (not merely describing it).
 * The response contract itself (parsing, error mapping, the RPC call
 * shape) is separately proven end-to-end in cloneTemplateResult.test.ts —
 * these tests cover the wiring that only exists in JSX: validation,
 * pending-state handling, error recovery, and the county-goals refresh /
 * goal-focus navigation path.
 */

const cloneFormBlock = goalsManagerSource.match(/function TemplateCloneForm\([\s\S]*?\n^}/m)?.[0] ?? "";
const adminGoalsManagerBlock = goalsManagerSource.match(/function AdminGoalsManager\([\s\S]*?\n^}/m)?.[0] ?? "";
const goalsTableBlock = goalsManagerSource.match(/function GoalsTable\([\s\S]*?\n^}/m)?.[0] ?? "";

describe("TemplateCloneForm: sanity", () => {
  it("is present in this file (sanity check that the extraction regex still matches)", () => {
    expect(cloneFormBlock).not.toBe("");
    expect(adminGoalsManagerBlock).not.toBe("");
    expect(goalsTableBlock).not.toBe("");
  });
});

describe("TemplateCloneForm: calls the RPC via the shared helper, not an inline .rpc()", () => {
  it("uses cloneTemplateToCounty (the tested, pure call site) instead of calling supabase.rpc directly", () => {
    expect(cloneFormBlock).toMatch(/cloneTemplateToCounty\(supabase, \{/);
    expect(cloneFormBlock).not.toMatch(/supabase\.rpc\(\s*["']rrg_clone_template_to_county["']/);
  });

  it("passes the RPC's two required IDs under countyId/templateId, sourced from the clicked template and the resolved target county — never from raw form/select state directly", () => {
    expect(cloneFormBlock).toMatch(/countyId: targetCounty\.id,/);
    expect(cloneFormBlock).toMatch(/templateId: template\.id,/);
  });
});

describe("TemplateCloneForm: validates both selections before submitting", () => {
  it("rejects a missing template", () => {
    expect(cloneFormBlock).toMatch(/if \(!template\?\.id\) \{\s*\n\s*setError\("No template selected\."\);/);
  });

  it("resolves the selected county against the real counties list rather than trusting a raw id, and rejects when nothing matches", () => {
    expect(cloneFormBlock).toMatch(/const targetCounty = counties\.find\(\(county\) => county\.id === selectedCountyId\);/);
    expect(cloneFormBlock).toMatch(/if \(!targetCounty\) \{\s*\n\s*setError\("Please select a target county\."\);/);
  });

  it("guards against a duplicate submit while one is already in flight", () => {
    expect(cloneFormBlock).toMatch(/if \(submitting\) return;/);
  });
});

describe("TemplateCloneForm: disables submission while pending and restores it afterward", () => {
  it("disables Clone whenever nothing is selected or a request is already in flight", () => {
    expect(cloneFormBlock).toMatch(/disabled=\{submitting \|\| !selectedCountyId\}/);
  });

  it("disables the county <select> and the Cancel button while a request is in flight, so a selection can't change mid-submit", () => {
    const selectBlock = cloneFormBlock.match(/<select[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(selectBlock).toMatch(/disabled=\{submitting\}/);
    expect(cloneFormBlock).toMatch(/onClick=\{onCancel\} disabled=\{submitting\}/);
  });

  it("always clears submitting in both the success and error paths — the button is never left stuck", () => {
    expect(cloneFormBlock).toMatch(/setSubmitting\(false\);\s*\n\s*\n\s*if \(outcome\.error\)/);
  });

  it("shows a distinct pending label", () => {
    expect(cloneFormBlock).toMatch(/\{submitting \? "Cloning\.\.\." : "Clone"\}/);
  });
});

describe("TemplateCloneForm: checks error before reading data, and never assumes an array/first-row shape", () => {
  it("branches on the outcome's error field before ever touching a goal-shaped result", () => {
    expect(cloneFormBlock).toMatch(/if \(outcome\.error\) \{\s*\n\s*setError\(outcome\.error\);/);
  });

  it("never calls .single() or indexes data[0] on the clone RPC response", () => {
    expect(cloneFormBlock).not.toMatch(/\.single\(\)/);
    expect(cloneFormBlock).not.toMatch(/data\[0\]/);
  });

  it("keeps the modal usable after an error: the form (with its error message) still renders, not a dead end", () => {
    expect(cloneFormBlock).toMatch(/\{error && <div className="rrg-error-message">\{error\}<\/div>\}/);
  });
});

describe("TemplateCloneForm: created vs. already-existing messaging", () => {
  it("renders the success message from the shared formatter, driven by the server's own returned county — not the live <select> value", () => {
    expect(cloneFormBlock).toMatch(/formatCloneResultMessage\(result, countyName\)/);
    expect(cloneFormBlock).toMatch(
      /const resultCounty = counties\.find\(\(county\) => county\.id === result\.countyId\);/
    );
  });

  it("falls back to a labeled county number if the returned county isn't in the loaded list, rather than showing nothing", () => {
    expect(cloneFormBlock).toMatch(/const countyName = resultCounty\?\.name \?\? `county #\$\{result\.countyId\}`;/);
  });
});

describe("TemplateCloneForm: offers to open the returned goal", () => {
  it("shows an Open Goal action tied to the returned goal, alongside Done", () => {
    expect(cloneFormBlock).toMatch(/onClick=\{\(\) => \{\s*\n\s*onOpenGoal\(result\);\s*\n\s*onSuccess\(\);/);
    expect(cloneFormBlock).toMatch(/>\s*Open Goal\s*</);
    expect(cloneFormBlock).toMatch(/onClick=\{onSuccess\}>\s*Done\s*</);
  });
});

describe("Goal-focus wiring: county switch and popout open on the actual RecordsRequestGoalsManager tree", () => {
  it("RecordsRequestGoalsManager switches to the County Goals tab and records which county/goal to focus when a clone is opened", () => {
    expect(goalsManagerSource).toMatch(/function handleOpenClonedGoal\(result\) \{\s*\n\s*setActiveTab\("county-goals"\);\s*\n\s*setGoalFocus\(\{ countyId: result\.countyId, goalId: result\.goalId \}\);/);
  });

  it("AdminTemplateManager forwards onOpenClonedGoal into TemplateCloneForm as onOpenGoal", () => {
    expect(goalsManagerSource).toMatch(/onOpenClonedGoal\}\s*\n/);
    expect(goalsManagerSource).toMatch(/onOpenGoal=\{onOpenClonedGoal\}/);
  });

  it("AdminGoalsManager switches its own county selector to the focused county", () => {
    expect(adminGoalsManagerBlock).toMatch(/if \(goalFocus\.countyId !== selectedCountyId\) \{\s*\n\s*setSelectedCountyId\(goalFocus\.countyId\);/);
  });

  it("AdminGoalsManager only ever passes a focusGoalId down once the table's county actually matches the focused county — never for the wrong county's list", () => {
    expect(adminGoalsManagerBlock).toMatch(
      /focusGoalId=\{goalFocus\?\.countyId === selectedCountyId \? goalFocus\.goalId : null\}/
    );
  });

  it("GoalsTable opens the popout only once the goal is actually present in the freshly fetched goals — not merely because focusGoalId was passed", () => {
    expect(goalsTableBlock).toMatch(
      /if \(focusGoalId && openedFocusGoalId !== focusGoalId && goals\.some\(\(goal\) => goal\.id === focusGoalId\)\) \{/
    );
    expect(goalsTableBlock).toMatch(/setManagingGoalId\(focusGoalId\);/);
  });

  it("GoalsTable tells the parent the focus request was fulfilled so it isn't reapplied on a later, unrelated refresh", () => {
    expect(goalsTableBlock).toMatch(/onFocusHandled\?\.\(\);/);
  });
});

describe("County-goals refresh uses the existing data-fetching pattern", () => {
  it("AdminGoalsManager still refetches via the same loadGoals/onRefresh pair used by every other goal mutation in this tree", () => {
    expect(adminGoalsManagerBlock).toMatch(/useEffect\(\(\) => \{\s*\n\s*loadGoals\(\);\s*\n\s*\}, \[selectedCountyId\]\);/);
  });
});
