/**
 * Lazy, cached loader for pdfjs-dist and its worker — used by the mobile
 * PDF preview pipeline (pdf-preview-engine.ts). Deliberately separate from
 * output-validator.ts's own identical-in-spirit loader rather than a
 * shared refactor of it: that module's generation-time PDF re-inspection
 * path is already tested and load-bearing, and this loader has a
 * different caller (a React component, not the generation pipeline) with
 * its own caching need (a preview panel may mount more than once per
 * session, and pdfjs-dist itself should only ever be fetched once).
 *
 * pdfjs-dist 6 requires GlobalWorkerOptions.workerSrc in a real browser —
 * without it, getDocument() fails. Node (this module's own tests) has no
 * `window` and no `Worker` global, so pdfjs-dist already falls back to its
 * in-process fake worker there — workerSrc is deliberately left unset in
 * that case. Both the library and its worker are dynamically imported so
 * neither ships in the initial bundle; the worker specifically is
 * imported with the `?url` suffix so Vite emits it as a separate static
 * asset (never bundled into a JS chunk) that only loads once a preview is
 * actually rendered. No CDN is used.
 */

export type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfJsModule> | null = null;

async function importAndConfigure(): Promise<PdfJsModule> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  }

  return pdfjs;
}

export function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = importAndConfigure();
  }
  return pdfjsPromise;
}
