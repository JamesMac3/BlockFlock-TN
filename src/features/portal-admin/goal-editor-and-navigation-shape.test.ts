import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import goalsManagerSource from "../../components/records-request-goals/RecordsRequestGoalsManager.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import deliveryPanelSource from "../../components/records-request-goals/RequestDeliveryPanel.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import headerSource from "../../components/Header.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import roadmapPageSource from "../../pages/RecordsRequestGoalsPage.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import footerSource from "../../components/Footer.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import portalDashboardSource from "../../pages/PortalDashboard.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import portalLoginSource from "../../components/PortalLogin.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import countyStatusPageSource from "../../pages/CountyStatusPage.jsx?raw";

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

  it("only the close button sits in its own sticky row — the title and draft banner are not wrapped in it, so they scroll away normally", () => {
    const headerBlock = deliveryPanelSource.match(/<header className="delivery-panel__header">[\s\S]*?<\/header>/)?.[0] ?? "";
    const closeRowBlock = headerBlock.match(/<div className="delivery-panel__close-row">[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(closeRowBlock).not.toBe("");
    expect(closeRowBlock).toMatch(/delivery-panel__close/);
    expect(closeRowBlock).not.toMatch(/delivery-panel__draft-banner/);
    expect(closeRowBlock).not.toMatch(/id="delivery-panel-title"/);
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

describe("Footer: Source Library link removed, Public Records Archive kept", () => {
  it("no longer links to /sources", () => {
    expect(footerSource).not.toMatch(/\/sources/);
    expect(footerSource).not.toMatch(/Source Library/);
  });

  it("still links to the public records archive", () => {
    expect(footerSource).toMatch(/<Link to="\/archive">Public Records Archive<\/Link>/);
  });
});

describe("Chapter dashboard heading: county role name only, h2-sized, eyebrow preserved", () => {
  it("no longer renders 'Signed in as'", () => {
    expect(portalDashboardSource).not.toMatch(/Signed in as/);
  });

  it("renders the county name and role as an h2, not an h1", () => {
    expect(portalDashboardSource).toMatch(/<h2>\{assignedCounty\.name\} Chapter Master<\/h2>/);
  });

  it("keeps the 'Authenticated portal' eyebrow", () => {
    expect(portalDashboardSource).toMatch(/Authenticated portal/);
  });
});

describe("Resource trash icon: compact icon button, not visible text, disassociation only", () => {
  it("LinkItem no longer renders the 'Remove archive link' text button", () => {
    expect(goalsManagerSource).not.toMatch(/Remove archive link/);
  });

  it("the trash button has an accessible label and a tooltip, both describing removal from the goal (not deletion)", () => {
    const linkItemBlock = goalsManagerSource.match(/function LinkItem\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(linkItemBlock).toMatch(/aria-label="Remove document from this goal"/);
    expect(linkItemBlock).toMatch(/title="Remove document from this goal"/);
  });

  it("a confirmation still gates the disassociation, and the underlying evidence object/Storage file is never deleted", () => {
    const linkItemBlock = goalsManagerSource.match(/function LinkItem\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(linkItemBlock).toMatch(/confirm\(/);
    expect(linkItemBlock).toMatch(/\.from\("records_request_goal_links"\)\.delete\(\)/);
    expect(linkItemBlock).not.toMatch(/\.from\("evidence_objects"\)/);
    expect(linkItemBlock).not.toMatch(/storage\.from/);
  });

  it("the button relies on the shared .rrg-btn focus-visible style rather than defining its own", () => {
    const linkItemBlock = goalsManagerSource.match(/function LinkItem\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(linkItemBlock).toMatch(/className="rrg-btn rrg-btn--icon rrg-btn--danger"/);
  });
});

describe("Login length limits: 120-character maxLength on both fields", () => {
  it("both the identity and password inputs carry maxLength={MAX_LOGIN_FIELD_LENGTH}", () => {
    const matches = portalLoginSource.match(/maxLength=\{MAX_LOGIN_FIELD_LENGTH\}/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("an over-limit value is rejected before calling supabase.auth.signInWithPassword, not truncated", () => {
    const handleSubmitBlock = portalLoginSource.match(/async function handleSubmit\([\s\S]*?\n  \}/)?.[0] ?? "";
    const lengthGuardIndex = handleSubmitBlock.search(/identity\.length > MAX_LOGIN_FIELD_LENGTH/);
    const authCallIndex = handleSubmitBlock.search(/signInWithPassword/);
    expect(lengthGuardIndex).toBeGreaterThan(-1);
    expect(authCallIndex).toBeGreaterThan(-1);
    expect(lengthGuardIndex).toBeLessThan(authCallIndex);
  });

  it("shows the existing generic error message, never a length-specific one that could hint at validation internals", () => {
    expect(portalLoginSource).toMatch(/setErrorMessage\(GENERIC_LOGIN_ERROR\);/);
  });
});

describe("County Status Updates: county-only feed, statewide posts excluded from this view", () => {
  it("the posts query filters strictly by county_id, with no scope.eq.global branch", () => {
    expect(countyStatusPageSource).toMatch(/\.eq\("county_id", county\.id\)/);
    expect(countyStatusPageSource).not.toMatch(/scope\.eq\.global/);
  });

  it("keeps a next-meeting banner and the existing chapter-claim callout, and still links to Records Request Roadmap", () => {
    expect(countyStatusPageSource).toMatch(/<NextMeetingBanner countyId=\{state\.county\.id\} \/>/);
    expect(countyStatusPageSource).toMatch(/ChapterClaimCallout/);
    expect(countyStatusPageSource).toMatch(/records-request-goals/);
  });
});
