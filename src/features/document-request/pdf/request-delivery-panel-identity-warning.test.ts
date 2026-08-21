import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import source from "../../../components/records-request-goals/RequestDeliveryPanel.jsx?raw";

/**
 * Static assertions against the real RequestDeliveryPanel.jsx source — the
 * closest available proof of its behavior since this project has no
 * component-render test harness.
 */

describe("RequestDeliveryPanel: identity-document warning", () => {
  it("is driven by the request profile's own eligibility_mode field, not a hardcoded jurisdiction", () => {
    expect(source).toMatch(
      /identityDocumentRequired =\s*\n\s*profile\.eligibility_mode === "citizenship_required" \|\| profile\.eligibility_mode === "residency_required";/,
    );
  });

  it("renders the exact required bold bullet text", () => {
    expect(source).toContain(
      "Attach a scan or clear photo of a valid ID showing that you are a Tennessee resident. Requests are",
    );
    expect(source).toContain("commonly rejected when this proof is omitted.");
  });

  it("the bold text is wrapped in <strong>, not just styled", () => {
    const warningBlock = source.match(/\{identityDocumentRequired && \(([\s\S]*?)\)\}/)?.[1] ?? "";
    expect(warningBlock).toMatch(/<strong>/);
    expect(warningBlock).toMatch(/<\/strong>/);
  });

  it("explains the visitor attaches the ID directly to their own submission", () => {
    const warningBlock = source.match(/\{identityDocumentRequired && \(([\s\S]*?)\)\}/)?.[1] ?? "";
    expect(warningBlock).toMatch(/Attach it directly to your own submission/);
  });

  it("preserves the privacy rule: the website never collects, uploads, stores, or transmits the ID", () => {
    const warningBlock = source.match(/\{identityDocumentRequired && \(([\s\S]*?)\)\}/)?.[1] ?? "";
    expect(warningBlock).toMatch(/the website never collects, uploads, stores, or\s*\n\s*transmits this ID/);
  });

  it("is not gated by draftPreview — appears in both the operator preview and public delivery paths", () => {
    const warningBlock = source.match(/\{identityDocumentRequired && \(([\s\S]*?)\)\}/)?.[1] ?? "";
    expect(warningBlock).not.toMatch(/draftPreview/);
  });

  it("lives inside the Completing your request section, alongside the other completion steps", () => {
    const section = source.match(/<h3>Completing your request<\/h3>([\s\S]*?)<\/ul>/)?.[1] ?? "";
    expect(section).toMatch(/identityDocumentRequired/);
  });
});
