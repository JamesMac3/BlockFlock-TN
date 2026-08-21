import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi, afterEach } from "vitest";

/**
 * Narrowly scoped test for inspectWithPdfJs's browser worker
 * initialization. The rest of this project's Node-only tests exercise
 * inspectWithPdfJs successfully without this module ever configuring
 * GlobalWorkerOptions.workerSrc, because pdfjs-dist resolves a usable
 * Node-only fallback on its own — which is exactly why the real browser
 * failure ("PDF.js could not reopen the generated output") was never
 * caught by those tests. This file simulates "a `window` exists" (the
 * guard inspectWithPdfJs actually checks) without needing a full browser
 * or jsdom, using vi.resetModules() so each case gets its own fresh
 * pdfjs-dist module instance (GlobalWorkerOptions is package-level mutable
 * state, so instances must not leak between these two opposite cases).
 */

async function onePageBytes(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return document.save();
}

describe("inspectWithPdfJs: browser worker initialization", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.resetModules();
  });

  it("succeeds without this module configuring workerSrc when window is undefined (Node/test environment)", async () => {
    delete (globalThis as { window?: unknown }).window;
    const { inspectWithPdfJs } = await import("./output-validator");

    const inspection = await inspectWithPdfJs(await onePageBytes());

    expect(inspection.pageCount).toBe(1);
  });

  it("configures workerSrc to a real dynamically-imported worker asset URL when window exists (simulated browser environment)", async () => {
    (globalThis as { window?: unknown }).window = {};
    const { inspectWithPdfJs } = await import("./output-validator");

    const inspection = await inspectWithPdfJs(await onePageBytes());
    expect(inspection.pageCount).toBe(1);

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    expect(typeof pdfjs.GlobalWorkerOptions.workerSrc).toBe("string");
    expect(pdfjs.GlobalWorkerOptions.workerSrc.length).toBeGreaterThan(0);
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker/);
  });

  it("never points the worker at a CDN — the configured URL is a local build asset", async () => {
    (globalThis as { window?: unknown }).window = {};
    const { inspectWithPdfJs } = await import("./output-validator");
    await inspectWithPdfJs(await onePageBytes());

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    expect(pdfjs.GlobalWorkerOptions.workerSrc).not.toMatch(/^https?:\/\//);
  });
});
