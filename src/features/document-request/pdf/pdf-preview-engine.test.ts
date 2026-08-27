import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  loadPdfDocument,
  resolveGetDocumentParams,
  pagesToRender,
  renderPageToCanvas,
  DEFAULT_MAX_PREVIEW_PAGES,
} from "./pdf-preview-engine";

async function multiPagePdfBytes(pageCount: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    document.addPage([612, 792]);
  }
  return document.save();
}

// pdfjs-dist's Node build only fetches file:// URLs on its own (its
// PDFNodeStream rejects http(s):/data: URLs outright, unlike a real
// browser), so a genuine end-to-end loadPdfDocument({kind:"url"}) test
// isn't reproducible under plain Node/Vitest. resolveGetDocumentParams is
// the actual behavioral contract for the URL case — proving pdfjs-dist's
// getDocument is asked for exactly the given URL, unmodified — and is
// fully exercised below without needing a real fetch.
describe("resolveGetDocumentParams: Blob input vs. URL input", () => {
  it("a URL source passes straight through as { url } — never re-derived, never touched", async () => {
    const params = await resolveGetDocumentParams({ kind: "url", url: "https://example.test/document.pdf" });
    expect(params).toEqual({ url: "https://example.test/document.pdf" });
  });

  it("a Blob source resolves to its own raw bytes as { data }, not a blob: URL", async () => {
    const bytes = await multiPagePdfBytes(1);
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const params = await resolveGetDocumentParams({ kind: "blob", blob });
    expect("data" in params).toBe(true);
    expect((params as { data: Uint8Array }).data).toBeInstanceOf(Uint8Array);
    expect((params as { data: Uint8Array }).data.length).toBe(bytes.length);
  });
});

describe("loadPdfDocument: Blob input", () => {
  it("opens a real single-page PDF supplied as a Blob and reports its page count", async () => {
    const bytes = await multiPagePdfBytes(1);
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const loaded = await loadPdfDocument({ kind: "blob", blob });
    try {
      expect(loaded.document.numPages).toBe(1);
    } finally {
      await loaded.destroy();
    }
  });

  it("opens a real multi-page PDF supplied as a Blob and can read every page", async () => {
    const bytes = await multiPagePdfBytes(4);
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const loaded = await loadPdfDocument({ kind: "blob", blob });
    try {
      expect(loaded.document.numPages).toBe(4);
      for (let pageNumber = 1; pageNumber <= loaded.document.numPages; pageNumber += 1) {
        const page = await loaded.document.getPage(pageNumber);
        expect(page.getViewport({ scale: 1 }).width).toBeGreaterThan(0);
        page.cleanup();
      }
    } finally {
      await loaded.destroy();
    }
  });
});

describe("pagesToRender: page-limit logic", () => {
  it("renders every page when the document is within the limit", () => {
    expect(pagesToRender(5, 20)).toBe(5);
  });

  it("caps at the limit for a document that exceeds it", () => {
    expect(pagesToRender(500, 20)).toBe(20);
  });

  it("the default limit is a reasonable, explicit number, not unlimited", () => {
    expect(DEFAULT_MAX_PREVIEW_PAGES).toBeGreaterThan(0);
    expect(DEFAULT_MAX_PREVIEW_PAGES).toBeLessThan(200);
  });

  it("never returns a negative or non-finite count for degenerate input", () => {
    expect(pagesToRender(0, 20)).toBe(0);
    expect(pagesToRender(-5, 20)).toBe(0);
    expect(pagesToRender(5, 0)).toBe(0);
    expect(pagesToRender(Number.NaN, 20)).toBe(0);
  });
});

describe("renderPageToCanvas: rendering failure", () => {
  it("throws a clear, catchable error when the canvas has no 2D context available, rather than a silent no-op", async () => {
    const bytes = await multiPagePdfBytes(1);
    const loaded = await loadPdfDocument({ kind: "blob", blob: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }) });
    try {
      const page = await loaded.document.getPage(1);
      const fakeCanvas = { style: {}, getContext: () => null } as unknown as HTMLCanvasElement;
      await expect(renderPageToCanvas(page, fakeCanvas, 600)).rejects.toThrow(/2D canvas rendering context/);
    } finally {
      await loaded.destroy();
    }
  });
});
