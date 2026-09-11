import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import goalsManagerSource from "../../components/records-request-goals/RecordsRequestGoalsManager.jsx?raw";

/**
 * This project has no React component-render test harness, so these are
 * source-shape assertions proving the real component exposes an editable
 * public description ("Description", bound to public_summary) consistently
 * across goal creation, goal editing, template creation, and template
 * editing — and that saving either kind of record actually confirms a
 * matching row came back before declaring success. The pure dirty-state
 * and field-independence behavior (description-only edits, and separation
 * from the structured records_description/request language) is proven for
 * real, not just shape-matched, in goalFormRules.test.ts.
 */

const goalEditFormBlock = goalsManagerSource.match(/function GoalEditForm\([\s\S]*?\n^}/m)?.[0] ?? "";
const goalCreateFormBlock = goalsManagerSource.match(/function GoalForm\([\s\S]*?\n^}/m)?.[0] ?? "";
const templateEditorBlock = goalsManagerSource.match(/function TemplateEditor\([\s\S]*?\n^}/m)?.[0] ?? "";
const templateCreateFormBlock = goalsManagerSource.match(/function TemplateForm\([\s\S]*?\n^}/m)?.[0] ?? "";

describe("sanity: all four form blocks still exist", () => {
  it("extraction regexes still match", () => {
    expect(goalEditFormBlock).not.toBe("");
    expect(goalCreateFormBlock).not.toBe("");
    expect(templateEditorBlock).not.toBe("");
    expect(templateCreateFormBlock).not.toBe("");
  });
});

describe("GoalEditForm: a Description textarea sits between Title and Tier, bound through updateField", () => {
  it("Title comes before Description, which comes before Tier", () => {
    const titleIndex = goalEditFormBlock.indexOf("<label>Title</label>");
    const descriptionIndex = goalEditFormBlock.indexOf("<label>Description</label>");
    const tierIndex = goalEditFormBlock.indexOf("<label>Tier</label>");
    expect(titleIndex).toBeGreaterThan(-1);
    expect(descriptionIndex).toBeGreaterThan(-1);
    expect(tierIndex).toBeGreaterThan(-1);
    expect(titleIndex).toBeLessThan(descriptionIndex);
    expect(descriptionIndex).toBeLessThan(tierIndex);
  });

  it("the Description textarea is bound to formData.public_summary through updateField, like every other tracked field", () => {
    expect(goalEditFormBlock).toMatch(
      /value=\{formData\.public_summary \?\? ""\}\s*\n\s*onChange=\{\(e\) => updateField\(\{ public_summary: e\.target\.value \}\)\}/
    );
  });

  it("preserves the existing 2,000-character limit", () => {
    const descriptionBlock = goalEditFormBlock.match(/<label>Description<\/label>[\s\S]*?<\/textarea>|<label>Description<\/label>[\s\S]*?\/>/)?.[0] ?? "";
    expect(descriptionBlock).toMatch(/maxLength=\{2000\}/);
  });
});

describe("GoalEditForm: saving verifies a matching row actually came back", () => {
  it("chains .select(\"id\") onto the update instead of trusting a missing error alone", () => {
    const saveBlock = goalEditFormBlock.match(/async function handleSave\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(saveBlock).toMatch(/\.update\(payload\)\s*\n\s*\.eq\("id", goal\.id\)\s*\n\s*\.select\("id"\);/);
    expect(saveBlock).toMatch(/if \(!updatedRows \|\| updatedRows\.length === 0\) \{/);
    // The zero-row failure must be thrown (and so caught below, surfaced as
    // an error) strictly before onSave() is ever called.
    const throwIndex = saveBlock.indexOf("updatedRows.length === 0");
    const onSaveIndex = saveBlock.indexOf("onSave();");
    expect(throwIndex).toBeGreaterThan(-1);
    expect(onSaveIndex).toBeGreaterThan(-1);
    expect(throwIndex).toBeLessThan(onSaveIndex);
  });
});

describe("GoalForm (create): the same Description label and placement as the editor", () => {
  it("Title comes before Description, which comes before Tier", () => {
    const titleIndex = goalCreateFormBlock.indexOf('htmlFor="goal-title"');
    const descriptionIndex = goalCreateFormBlock.indexOf('htmlFor="goal-summary">Description<');
    const tierIndex = goalCreateFormBlock.indexOf('htmlFor="goal-tier"');
    expect(titleIndex).toBeGreaterThan(-1);
    expect(descriptionIndex).toBeGreaterThan(-1);
    expect(tierIndex).toBeGreaterThan(-1);
    expect(titleIndex).toBeLessThan(descriptionIndex);
    expect(descriptionIndex).toBeLessThan(tierIndex);
  });

  it("is bound to formData.public_summary, feeding the same field GoalEditForm edits later", () => {
    expect(goalCreateFormBlock).toMatch(/value=\{formData\.public_summary\}\s*\n\s*onChange=\{\(e\) => setFormData\(\{ \.\.\.formData, public_summary: e\.target\.value \}\)\}/);
  });
});

describe("TemplateEditor: Description sits directly below Title, above Seed Key", () => {
  it("Title comes before Description, which comes before Seed Key", () => {
    const titleIndex = templateEditorBlock.indexOf("<label>Title</label>");
    const descriptionIndex = templateEditorBlock.indexOf("<label>Description</label>");
    const seedKeyIndex = templateEditorBlock.indexOf("<label>Seed Key</label>");
    expect(titleIndex).toBeGreaterThan(-1);
    expect(descriptionIndex).toBeGreaterThan(-1);
    expect(seedKeyIndex).toBeGreaterThan(-1);
    expect(titleIndex).toBeLessThan(descriptionIndex);
    expect(descriptionIndex).toBeLessThan(seedKeyIndex);
  });

  it("preserves the existing 2,000-character limit", () => {
    expect(templateEditorBlock).toMatch(/<label>Description<\/label>\s*\n\s*<textarea\s*\n\s*rows=\{3\}\s*\n\s*maxLength=\{2000\}/);
  });
});

describe("TemplateEditor: saving verifies a matching row actually came back, and only ever touches templates", () => {
  const saveBlock = templateEditorBlock.match(/async function handleSave\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";

  it("chains .select(\"id\") onto the update instead of trusting a missing error alone", () => {
    expect(saveBlock).toMatch(/\.eq\("id", template\.id\)\s*\n\s*\.select\("id"\);/);
    expect(saveBlock).toMatch(/if \(!updatedRows \|\| updatedRows\.length === 0\) \{/);
    const throwIndex = saveBlock.indexOf("updatedRows.length === 0");
    const onUpdateIndex = saveBlock.indexOf("onUpdate();");
    expect(throwIndex).toBeGreaterThan(-1);
    expect(onUpdateIndex).toBeGreaterThan(-1);
    expect(throwIndex).toBeLessThan(onUpdateIndex);
  });

  it("only ever writes to records_request_goal_templates — never county_records_request_goals", () => {
    expect(saveBlock).toMatch(/\.from\("records_request_goal_templates"\)/);
    // The function's own explanatory comment names county_records_request_goals
    // to say it is NOT touched — so assert there is exactly one .from(...) call
    // in the whole block (the templates table), rather than banning the string
    // outright, which would also forbid that clarifying comment.
    const fromCallCount = (saveBlock.match(/\.from\(/g) ?? []).length;
    expect(fromCallCount).toBe(1);
  });
});

describe("TemplateForm (create): the same Description label and placement as the editor", () => {
  it("Title comes before Description, which comes before Seed Key", () => {
    const titleIndex = templateCreateFormBlock.indexOf('htmlFor="title"');
    const descriptionIndex = templateCreateFormBlock.indexOf('htmlFor="public_summary">Description<');
    const seedKeyIndex = templateCreateFormBlock.indexOf('htmlFor="seed_key"');
    expect(titleIndex).toBeGreaterThan(-1);
    expect(descriptionIndex).toBeGreaterThan(-1);
    expect(seedKeyIndex).toBeGreaterThan(-1);
    expect(titleIndex).toBeLessThan(descriptionIndex);
    expect(descriptionIndex).toBeLessThan(seedKeyIndex);
  });

  it("preserves the existing 2,000-character limit", () => {
    expect(templateCreateFormBlock).toMatch(/maxLength="2000"/);
  });
});
