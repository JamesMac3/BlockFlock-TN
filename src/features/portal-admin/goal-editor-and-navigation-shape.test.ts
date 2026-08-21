import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import goalsManagerSource from "../../components/records-request-goals/RecordsRequestGoalsManager.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import deliveryPanelSource from "../../components/records-request-goals/RequestDeliveryPanel.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import headerSource from "../../components/Header.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import roadmapPageSource from "../../pages/RecordsRequestGoalsPage.jsx?raw";

// RequestDeliveryPanel.css's own assertions live in
// tests/requestDeliveryPanelHeaderOffset.test.js (plain Node, not this
// Vitest/TS program) — Vite's ?raw import does not reliably return plain
// text for .css files under this program, and this program has no Node
// type declarations available to read the file directly here.

/**
 * Source-shape assertions for the remaining checklist items that have no
 * meaningful pure-logic extraction (chapter-master vs. admin status
 * options, the panel's header-offset CSS strategy, Header's remembered-
 * county navigation, and the removed roadmap button) — this project has
 * no component-render or CSS-computed-style test harness, so these prove
 * the real source implements the intended behavior rather than merely
 * describing it.
 */

describe("RequestDeliveryPanel: header offset structure (CSS assertions live in tests/requestDeliveryPanelHeaderOffset.test.js)", () => {
  it("the close control and (when present) the draft banner are wrapped in a dedicated header element", () => {
    const headerBlock = deliveryPanelSource.match(/<header className="delivery-panel__header">[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(headerBlock).toMatch(/delivery-panel__close/);
    expect(headerBlock).toMatch(/delivery-panel__draft-banner/);
  });
});

describe("Goal status selector: chapter masters see only draft/ready/published; admins keep the full list", () => {
  it("defines the restricted three-option list separately from the full admin list", () => {
    expect(goalsManagerSource).toMatch(
      /const CHAPTER_MASTER_GOAL_STATUS_OPTIONS = \["draft", "ready", "published"\];/,
    );
  });

  it("GoalEditForm's status select branches on isAdmin between the two option lists", () => {
    expect(goalsManagerSource).toMatch(
      /\{\(isAdmin \? GOAL_STATUS_OPTIONS : CHAPTER_MASTER_GOAL_STATUS_OPTIONS\)\.map/,
    );
  });

  it("a chapter master viewing a goal already in an internal-only status sees it as a distinct disabled option, never silently hidden", () => {
    expect(goalsManagerSource).toMatch(
      /\{!isAdmin && !CHAPTER_MASTER_GOAL_STATUS_OPTIONS\.includes\(formData\.status\) && \(/,
    );
  });

  it("the create form (GoalForm) applies the same restriction and defaults chapter-master goals to draft, not profile_needed", () => {
    expect(goalsManagerSource).toMatch(/status: isAdmin \? "profile_needed" : "draft",/);
    expect(goalsManagerSource).toMatch(/\{isAdmin \? \(\s*\n\s*<>\s*\n\s*<option value="draft">Draft<\/option>/);
  });
});

describe("Header: Status nav link routes directly to the remembered county's page", () => {
  it("reads the stored county slug and validates it against the live counties table before using it", () => {
    expect(headerSource).toMatch(/getStoredCountySlug\(\)/);
    expect(headerSource).toMatch(/\.from\("counties"\)\s*\n\s*\.select\("slug"\)\s*\n\s*\.eq\("slug", storedSlug\)/);
  });

  it("defaults to the statewide /status page and only upgrades once the county is confirmed to still exist", () => {
    expect(headerSource).toMatch(/useState\("\/status"\)/);
    expect(headerSource).toMatch(/setStatusHref\(`\/status\/\$\{data\.slug\}`\);/);
  });

  it("only the Status nav item's target is swapped — Home/Education/Archive keep their static paths", () => {
    expect(headerSource).toMatch(/to=\{item\.path === "\/status" \? statusHref : item\.path\}/);
  });
});

describe("Records Request Roadmap page: the top-right 'Choose another county' button is removed", () => {
  it("the ready-state header no longer renders CountyStatusChooser", () => {
    const readyHeaderBlock = roadmapPageSource.match(/<header className="records-goals-header">[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(readyHeaderBlock).not.toMatch(/<CountyStatusChooser/);
  });

  it("removing the button does not touch the county-preference storage — the page still records arrival via setStoredCountySlug", () => {
    expect(roadmapPageSource).toMatch(/setStoredCountySlug\(county\.slug\);/);
  });

  it("the chooser is still available on the loading/not-found/failed states, so a visitor is never stranded with no way to navigate", () => {
    const statusMessageBlock = roadmapPageSource.match(/function StatusMessage\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(statusMessageBlock).toMatch(/<CountyStatusChooser currentCountySlug=\{currentCountySlug\} \/>/);
  });
});
