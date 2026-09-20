import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import goalsTiersSource from "../../components/records-request-goals/RecordsRequestGoalsTiers.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import archiveGoalPageSource from "../../pages/ArchiveGoalPage.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import goalsPageSource from "../../pages/RecordsRequestGoalsPage.jsx?raw";

// Vitest's default CSS handling empties plain .css imports (even with
// ?raw), so these are read directly rather than imported.
const goalsTiersCss = readFileSync(new URL("../../components/records-request-goals/RecordsRequestGoalsTiers.css", import.meta.url), "utf8");
const archiveGoalPageCss = readFileSync(new URL("../../pages/ArchiveGoalPage.css", import.meta.url), "utf8");

/**
 * This project has no React render harness, so these are source-shape
 * assertions proving the goal-card <-> archive-detail navigation added
 * here is wired the way publicArchiveEligibility.test.js's real, executed
 * logic assumes it is used, and that both directions actually reach a
 * real destination (never solely relying on browser history) with
 * matching button styling and keyboard-focus states.
 */

describe("RecordsRequestGoalsTiers.jsx: \"More details\" link, shown only for an archive-eligible goal", () => {
  it("gates the link on the shared eligibility helper, not a bespoke or inline check", () => {
    expect(goalsTiersSource).toMatch(
      /import \{ isGoalPubliclyArchived \} from "\.\.\/\.\.\/features\/document-request\/publicArchiveEligibility";/
    );
    expect(goalsTiersSource).toMatch(/\{isGoalPubliclyArchived\(goal\) && \(/);
  });

  it("links to /archive/goals/ using the goal's actual id, via a React Router Link", () => {
    expect(goalsTiersSource).toMatch(/<Link to=\{`\/archive\/goals\/\$\{goal\.id\}`\} className="goal-card__details-link">/);
  });

  it("sits in the card header beside the title, not replacing the existing lock badge", () => {
    const headerBlock = goalsTiersSource.match(/<div className="goal-card__header">[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(headerBlock).toMatch(/goal-card__title/);
    expect(headerBlock).toMatch(/goal-card__lock-badge/);
    expect(headerBlock).toMatch(/goal-card__details-link/);
  });

  it("gives the card a stable id anchor for the return-to-card behavior", () => {
    expect(goalsTiersSource).toMatch(/<article id=\{`goal-\$\{goal\.id\}`\} className=/);
  });

  it("preserves the existing resource links and request-generation controls untouched", () => {
    expect(goalsTiersSource).toMatch(/handlePrepareRequest/);
    expect(goalsTiersSource).toMatch(/goal-card__links/);
    expect(goalsTiersSource).toMatch(/OperatorDraftPreviewButton goal=\{goal\} county=\{county\} \/>/);
  });

  it("the header row is flex + wrap, so the button drops to its own line under the title on mobile instead of overlapping it", () => {
    const headerCss = goalsTiersCss.match(/\.goal-card__header \{[\s\S]*?\}/)?.[0] ?? "";
    expect(headerCss).toMatch(/display: flex;/);
    expect(headerCss).toMatch(/flex-wrap: wrap;/);
  });

  it("the details link has a visible keyboard-focus state", () => {
    expect(goalsTiersCss).toMatch(/\.goal-card__details-link:focus-visible \{\s*\n\s*outline: 3px solid #2563eb;/);
  });
});

describe("ArchiveGoalPage.jsx: \"Back to records request goals\" link", () => {
  it("resolves the county slug from the existing counties table by the name get_public_archive_goal already returns — no new RPC field", () => {
    expect(archiveGoalPageSource).toMatch(/\.from\("counties"\)\s*\n\s*\.select\("slug"\)\s*\n\s*\.eq\("name", data\.county\)/);
  });

  it("links directly to /status/<slug>/records-request-goals for that county via a React Router Link, carrying the goal id for the return trip", () => {
    expect(archiveGoalPageSource).toMatch(
      /`\/status\/\$\{countySlug\}\/records-request-goals\?goal=\$\{goal\.id\}`/
    );
    expect(archiveGoalPageSource).toMatch(/<Link to=\{backHref\} className="archive-goal-page__back-link">/);
  });

  it("still works when the county slug cannot be resolved — falls back to a real destination rather than disappearing or linking nowhere", () => {
    expect(archiveGoalPageSource).toMatch(/const backHref = countySlug\s*\n\s*\? `\/status\/\$\{countySlug\}\/records-request-goals\?goal=\$\{goal\.id\}`\s*\n\s*: "\/status";/);
  });

  it("this whole flow works from a direct/refreshed URL — the goal, and then the county slug, are both loaded from goalId alone, never from router/navigation state", () => {
    const effectBlock = archiveGoalPageSource.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[goalId\]\);/)?.[0] ?? "";
    expect(effectBlock).toMatch(/get_public_archive_goal/);
    expect(effectBlock).toMatch(/\.from\("counties"\)/);
    expect(archiveGoalPageSource).not.toMatch(/location\.state/);
    expect(archiveGoalPageSource).not.toMatch(/history\.state/);
  });

  it("matches the goal card's button styling and has a visible keyboard-focus state", () => {
    const backLinkCss = archiveGoalPageCss.match(/\.archive-goal-page__back-link \{[\s\S]*?\}/)?.[0] ?? "";
    expect(backLinkCss).toMatch(/border: 1px solid #2563eb;/);
    expect(backLinkCss).toMatch(/color: #2563eb;/);
    expect(archiveGoalPageCss).toMatch(/\.archive-goal-page__back-link:focus-visible \{\s*\n\s*outline: 3px solid #2563eb;/);
  });
});

describe("RecordsRequestGoalsPage.jsx: returns to the originating goal card via a stable anchor, not solely browser history", () => {
  it("reads the goal id from a ?goal= query param (HashRouter's own \"#\" cannot host a second URL fragment)", () => {
    expect(goalsPageSource).toMatch(/import \{ useParams, useSearchParams \} from "react-router-dom";/);
    expect(goalsPageSource).toMatch(/const goalId = searchParams\.get\("goal"\);/);
  });

  it("only scrolls once the matching card actually exists in the DOM (goals finished loading), never before", () => {
    const scrollEffect = goalsPageSource.match(/useEffect\(\(\) => \{\s*\n\s*if \(state\.phase !== "done"[\s\S]*?\}, \[state\.phase, state\.goals, searchParams\]\);/)?.[0] ?? "";
    expect(scrollEffect).toMatch(/document\.getElementById\(`goal-\$\{goalId\}`\)\?\.scrollIntoView/);
  });

  it("selects is_public so the goal-card eligibility check can rely on real data, not an assumption from the query's own filter", () => {
    expect(goalsPageSource).toMatch(/is_public,/);
    expect(goalsPageSource).toMatch(/\.eq\("is_public", true\)/);
  });
});
