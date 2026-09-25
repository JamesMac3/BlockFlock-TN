import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import archivePageSource from "../../pages/ArchivePage.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import viewerSource from "../../pages/BlankRequestFormViewer.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import appSource from "../../App.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import manifestSource from "../../config/documentManifest.js?raw";

// Source-shape checks for the public blank request forms frontend
// (docs/public-blank-request-forms.md). Pure logic is covered directly in
// src/features/document-request/blankRequestForms.test.js; the anonymous
// listing/viewer flow was also exercised in a real browser.

describe("ArchivePage: blank forms come from the database, not the static manifest", () => {
  it("calls get_public_blank_request_forms and no longer lists manifest blank templates", () => {
    expect(archivePageSource).toMatch(/supabase\.rpc\(BLANK_FORMS_RPC\)/);
    expect(archivePageSource).not.toMatch(/listDocumentsByCategory\(/);
    expect(archivePageSource).not.toMatch(/from "\.\.\/config\/documentManifest"/);
  });

  it("never hardcodes the number of forms", () => {
    expect(archivePageSource).not.toMatch(/\b9\b.*form/i);
  });

  it("shows title, county, and government entity per row and routes to the dedicated viewer", () => {
    expect(archivePageSource).toMatch(/<td>\{form\.title\}<\/td>/);
    expect(archivePageSource).toMatch(/<td>\{form\.county \?\? "Not recorded"\}<\/td>/);
    expect(archivePageSource).toMatch(/<td>\{form\.government_entity \?\? "Not recorded"\}<\/td>/);
    expect(archivePageSource).toMatch(/navigate\(blankFormPath\(form\.evidence_id\)\)/);
  });

  it("has loading, error-with-retry, and empty states", () => {
    expect(archivePageSource).toMatch(/Loading blank request forms…/);
    expect(archivePageSource).toMatch(/onClick=\{retry\}>Try again<\/button>/);
    expect(archivePageSource).toMatch(/No blank request forms are available yet\./);
  });

  it("the goals tab still uses get_public_archive_goals, untouched", () => {
    expect(archivePageSource).toMatch(/supabase\.rpc\("get_public_archive_goals"\)/);
  });
});

describe("BlankRequestFormViewer", () => {
  it("looks up a single form with the same RPC and p_evidence_id — never get_public_archive_document", () => {
    expect(viewerSource).toMatch(/supabase\.rpc\(BLANK_FORMS_RPC, \{ p_evidence_id: evidenceId \}\)/);
    expect(viewerSource).not.toMatch(/rpc\(\s*"get_public_archive_document"/);
  });

  it("renders through the shared PdfPreview (keeps the Safari/PDF decoder fixes)", () => {
    expect(viewerSource).toMatch(/import PdfPreview from "\.\.\/components\/pdf\/PdfPreview";/);
    expect(viewerSource).toMatch(/<PdfPreview source=\{\{ kind: "url", url: urls\.viewUrl \}\}/);
  });

  it("has loading, not-found, error-with-retry, and unavailable states, each with a way back to the list", () => {
    for (const phase of ["loading", "error", "unavailable", "not-found"]) {
      expect(viewerSource).toMatch(new RegExp(`state\\.phase === "${phase}"`));
    }
    expect(viewerSource).toMatch(/onClick=\{retry\}/);
    expect(viewerSource.match(/to=\{BACK_TO_LIST\}/g)?.length).toBeGreaterThanOrEqual(4);
    expect(viewerSource).toMatch(/const BACK_TO_LIST = "\/archive\?tab=forms";/);
  });

  it("builds file URLs only from the RPC's returned row, never from query parameters", () => {
    expect(viewerSource).toMatch(/blankFormUrls\(supabase\.storage, form\)/);
    expect(viewerSource).not.toMatch(/useSearchParams/);
  });
});

describe("Routing and legacy URLs", () => {
  it("registers the dedicated /archive/forms/:evidenceId route", () => {
    expect(appSource).toMatch(/path="\/archive\/forms\/:evidenceId"/);
    expect(appSource).toMatch(/element=\{<BlankRequestFormViewer \/>\}/);
  });

  it("keeps the legacy /documents/:slug route and the existing goal-linked document route", () => {
    expect(appSource).toMatch(/path="\/documents\/:documentSlug"/);
    expect(appSource).toMatch(/path="\/archive\/documents\/:evidenceId"/);
  });

  it("keeps the manifest entries so legacy Murfreesboro and educational document URLs still resolve", () => {
    expect(manifestSource).toMatch(/"murfreesboro-city-request-form"/);
    expect(manifestSource).toMatch(/"murfreesboro-police-request-form"/);
    expect(manifestSource).toMatch(/"6-points-about-surveillance"/);
  });
});
