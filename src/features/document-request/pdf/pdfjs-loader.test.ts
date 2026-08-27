import { describe, expect, it, vi, afterEach } from "vitest";

/**
 * Same technique as output-validator-worker.test.ts's browser-worker
 * simulation, applied to this module's own independent loader: pdfjs-dist
 * is only ever fetched via a dynamic import (never a top-level import that
 * would pull it into the initial bundle — confirmed separately by
 * inspecting the production build's chunk list), and the worker asset is
 * only configured when a `window` actually exists. vi.resetModules() gives
 * each case its own fresh pdfjs-dist module instance, since
 * GlobalWorkerOptions is package-level mutable state that must not leak
 * between the "no window" and "window exists" cases.
 */

describe("loadPdfJs: lazy import and worker configuration", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.resetModules();
  });

  it("resolves in a Node/test environment (no window) without configuring workerSrc", async () => {
    delete (globalThis as { window?: unknown }).window;
    const { loadPdfJs } = await import("./pdfjs-loader");
    const pdfjs = await loadPdfJs();
    expect(typeof pdfjs.getDocument).toBe("function");
  });

  it("configures workerSrc to a real local asset URL once a window exists", async () => {
    (globalThis as { window?: unknown }).window = {};
    const { loadPdfJs } = await import("./pdfjs-loader");
    await loadPdfJs();

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    expect(typeof pdfjs.GlobalWorkerOptions.workerSrc).toBe("string");
    expect(pdfjs.GlobalWorkerOptions.workerSrc.length).toBeGreaterThan(0);
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker/);
    expect(pdfjs.GlobalWorkerOptions.workerSrc).not.toMatch(/^https?:\/\//);
  });

  it("caches the pdfjs module — a second call does not re-import or reconfigure it", async () => {
    (globalThis as { window?: unknown }).window = {};
    const { loadPdfJs } = await import("./pdfjs-loader");
    const first = await loadPdfJs();
    const second = await loadPdfJs();
    expect(second).toBe(first);
  });
});
