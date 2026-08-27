import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import pdfPreviewSource from "../../components/pdf/PdfPreview.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import requestDeliveryPanelSource from "../../components/records-request-goals/RequestDeliveryPanel.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import documentPageSource from "../../pages/DocumentPage.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import archiveDocumentViewerSource from "../../pages/ArchiveDocumentViewer.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import portalDocumentViewerSource from "../../pages/PortalDocumentViewer.jsx?raw";

/**
 * No React render harness exists in this repo, so these are source-shape
 * assertions proving the real component implements the intended mobile
 * PDF preview behavior — the actual rendering engine (pdfjs-dist loading,
 * page-limit logic, canvas scaling) is separately proven against real
 * PDF bytes under plain Node in pdf-preview-engine.test.ts and
 * pdfjs-loader.test.ts.
 */

describe("PdfPreview: lazy PDF.js loading", () => {
  it("never imports pdfjs-dist or the rendering engine at module scope — only inside effects, via dynamic import", () => {
    expect(pdfPreviewSource).not.toMatch(/^import .*pdfjs/m);
    expect(pdfPreviewSource).not.toMatch(/^import .*pdf-preview-engine/m);
    expect(
      pdfPreviewSource.match(/await import\(\s*"\.\.\/\.\.\/features\/document-request\/pdf\/pdf-preview-engine"\s*\)/g)?.length,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("PdfPreview: accepts either a Blob or a URL source", () => {
  it("a Blob source is never routed through an object URL for rendering — only used for Open/Download via onUrlReady", () => {
    expect(pdfPreviewSource).toMatch(/source\.kind === "blob"/);
    expect(pdfPreviewSource).toMatch(/URL\.createObjectURL\(source\.blob\)/);
  });

  it("a URL source is reported to onUrlReady immediately — it already has a stable URL, no object-URL lifecycle needed", () => {
    expect(pdfPreviewSource).toMatch(/if \(source\?\.kind === "url"\) \{\s*\n\s*onUrlReady\?\.\(source\.url\);/);
  });
});

describe("PdfPreview: object URL create-once, revoke-on-cleanup, never revoked while still needed", () => {
  it("creation is deferred via setTimeout so a StrictMode throwaway mount's synchronous cleanup cancels it before createObjectURL is ever called", () => {
    const effectBlock = pdfPreviewSource.match(/useEffect\(\(\) => \{\s*\n\s*if \(source\?\.kind !== "blob"\)[\s\S]*?\n {2}\}, \[source\]\);/)?.[0] ?? "";
    expect(effectBlock).not.toBe("");
    expect(effectBlock).toMatch(/const timer = setTimeout\(\(\) => \{/);
    expect(effectBlock).toMatch(/clearTimeout\(timer\);/);
    expect(effectBlock).toMatch(/if \(url\) URL\.revokeObjectURL\(url\);/);
  });
});

describe("PdfPreview: incremental rendering with an explicit page limit and Open/Download fallback", () => {
  it("renders pages one at a time in a sequential loop, not all at once", () => {
    expect(pdfPreviewSource).toMatch(/for \(let pageNumber = 1; pageNumber <= count; pageNumber \+= 1\) \{/);
    expect(pdfPreviewSource).not.toMatch(/Promise\.all/);
  });

  it("caps rendering at a configurable maxPages and shows a truncation notice pointing at Open/Download", () => {
    expect(pdfPreviewSource).toMatch(/const effectiveMaxPages = maxPages \?\? 20;/);
    expect(pdfPreviewSource).toMatch(/const hasMorePages = pageCount > effectiveMaxPages;/);
    expect(pdfPreviewSource).toMatch(/Use Open or Download/);
  });

  it("a stale render pass is abandoned via a generation token rather than racing a newer one (e.g. triggered by a resize mid-render)", () => {
    expect(pdfPreviewSource).toMatch(/renderGenerationRef\.current !== generation/);
  });
});

describe("PdfPreview: loading, rendering-error, and unsupported/empty-source states", () => {
  it("has a distinct loading and error phase, both rendered as visitor-safe text", () => {
    expect(pdfPreviewSource).toMatch(/phase === "loading"/);
    expect(pdfPreviewSource).toMatch(/phase === "error"/);
    expect(pdfPreviewSource).toMatch(/The preview could not be rendered\. Use Open or Download above/);
  });

  it("logs the real error to the console — never renders it", () => {
    expect(pdfPreviewSource).toMatch(/console\.error\("PDF preview could not open the document:", error\);/);
    expect(pdfPreviewSource).toMatch(/console\.error\(`PDF preview failed to render page \$\{pageNumber\}:`, error\);/);
  });

  it("a rendering failure sets the error phase but never clears an already-reported Open/Download URL — onUrlReady already fired independently before rendering could fail", () => {
    const renderEffect = pdfPreviewSource.match(/useEffect\(\(\) => \{\s*\n\s*if \(phase !== "ready"[\s\S]*?\n {2}\}, \[phase, containerWidth, effectiveMaxPages\]\);/)?.[0] ?? "";
    expect(renderEffect).not.toBe("");
    expect(renderEffect).not.toMatch(/setObjectUrl/);
    expect(renderEffect).not.toMatch(/onUrlReady/);
  });
});

describe("PdfPreview: resize/orientation handling without blurry stretching", () => {
  it("observes its own container width via ResizeObserver, guarded for environments without it", () => {
    expect(pdfPreviewSource).toMatch(/typeof ResizeObserver === "undefined"/);
    expect(pdfPreviewSource).toMatch(/new ResizeObserver\(/);
  });

  it("debounces resize/orientation changes and clears the observer on cleanup", () => {
    expect(pdfPreviewSource).toMatch(/clearTimeout\(debounceTimer\);/);
    expect(pdfPreviewSource).toMatch(/observer\.disconnect\(\);/);
  });
});

// PdfPreview.css's own "no nested-scroll trap" assertion lives in
// tests/pdfPreviewCss.test.js (plain Node, not this Vitest/TS program) —
// this tsconfig has no Node type declarations available to read the file
// directly here (the same constraint documented in
// tests/requestDeliveryPanelHeaderOffset.test.js for the same reason).

describe("Applied to all four viewer paths", () => {
  it("RequestDeliveryPanel uses PdfPreview for its blob-sourced generated document and no longer manages its own object-URL effect", () => {
    expect(requestDeliveryPanelSource).toMatch(/import PdfPreview from "\.\.\/pdf\/PdfPreview";/);
    expect(requestDeliveryPanelSource).toMatch(/<PdfPreview\s*\n\s*source=\{generated\?\.blob \? \{ kind: "blob", blob: generated\.blob \} : null\}/);
    expect(requestDeliveryPanelSource).toMatch(/onUrlReady=\{setObjectUrl\}/);
    expect(requestDeliveryPanelSource).not.toMatch(/URL\.createObjectURL\(generated\.blob\)/);
    // Open/Download still exist and still key off the same objectUrl state.
    expect(requestDeliveryPanelSource).toMatch(/aria-disabled=\{!objectUrl\}/);
  });

  it("DocumentPage uses PdfPreview for its downloaded-then-blob-URL'd document", () => {
    expect(documentPageSource).toMatch(/import PdfPreview from "\.\.\/components\/pdf\/PdfPreview";/);
    expect(documentPageSource).toMatch(/<PdfPreview source=\{\{ kind: "url", url: objectUrl \}\} title=\{entry\.title\} \/>/);
  });

  it("ArchiveDocumentViewer (public) uses PdfPreview only for application/pdf, keeping the existing iframe for images and the unsupported card for everything else", () => {
    expect(archiveDocumentViewerSource).toMatch(/import PdfPreview from "\.\.\/components\/pdf\/PdfPreview";/);
    expect(archiveDocumentViewerSource).toMatch(/doc\.mime_type === "application\/pdf" \? \(/);
    expect(archiveDocumentViewerSource).toMatch(/<PdfPreview source=\{\{ kind: "url", url \}\} title=\{doc\.title\} \/>/);
    expect(archiveDocumentViewerSource).toMatch(/: inline \? \(/);
    expect(archiveDocumentViewerSource).toMatch(/<iframe title=\{doc\.title\} src=\{url\} \/>/);
  });

  it("PortalDocumentViewer (authenticated) applies the identical pdf/image/unsupported split as the public viewer", () => {
    expect(portalDocumentViewerSource).toMatch(/import PdfPreview from "\.\.\/components\/pdf\/PdfPreview";/);
    expect(portalDocumentViewerSource).toMatch(/doc\.mime_type === "application\/pdf" \? \(/);
    expect(portalDocumentViewerSource).toMatch(/<PdfPreview source=\{\{ kind: "url", url \}\} title=\{doc\.title\} \/>/);
  });
});
