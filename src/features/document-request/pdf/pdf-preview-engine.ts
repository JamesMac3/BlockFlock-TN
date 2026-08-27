import { loadPdfJs, type PdfJsModule } from "./pdfjs-loader";

/**
 * Rendering engine behind the shared <PdfPreview> component (see
 * src/components/pdf/PdfPreview.jsx). Kept framework-free and DOM-light on
 * purpose: everything here except renderPageToCanvas is plain data-in,
 * data-out logic that can be exercised with real pdf-lib-generated PDF
 * bytes under plain Node (no browser, no jsdom, no real <canvas>) — the
 * same testing approach already established for inspectWithPdfJs in
 * output-validator.ts.
 *
 * A Blob source is read directly into bytes (`{ data }`) rather than
 * routed through a `blob:` object URL for rendering — mobile Safari and
 * some Android browsers are specifically unreliable at *fetching* a
 * `blob:` URL from inside an iframe, which is the root cause this preview
 * exists to work around. Reading the Blob's own bytes sidesteps that
 * fetch entirely; a `blob:` URL is still created (by the caller, e.g.
 * PdfPreview.jsx) for Open/Download links, which is a different action
 * (the browser's native download/open-in-new-tab handling) that mobile
 * browsers do support reliably.
 */

type GetDocumentReturn = ReturnType<PdfJsModule["getDocument"]>;
export type PdfDocumentProxy = Awaited<GetDocumentReturn["promise"]>;
export type PdfPageProxy = Awaited<ReturnType<PdfDocumentProxy["getPage"]>>;

export type PdfPreviewSource =
  | Readonly<{ kind: "blob"; blob: Blob }>
  | Readonly<{ kind: "url"; url: string }>;

export const DEFAULT_MAX_PREVIEW_PAGES = 20;

export type GetDocumentParams = Readonly<{ data: Uint8Array }> | Readonly<{ url: string }>;

/**
 * Pure translation from a PdfPreviewSource to the parameters pdfjs-dist's
 * getDocument expects — separated from loadPdfDocument itself so this
 * exact "Blob -> raw bytes, URL -> passed through unchanged" behavior is
 * directly testable without touching pdfjs-dist, a real network request,
 * or any ESM-mocking fragility.
 */
export async function resolveGetDocumentParams(source: PdfPreviewSource): Promise<GetDocumentParams> {
  if (source.kind === "url") return { url: source.url };
  return { data: new Uint8Array(await source.blob.arrayBuffer()) };
}

export type LoadedPdfDocument = Readonly<{
  document: PdfDocumentProxy;
  /** Releases pdfjs-dist's resources for this document. Call exactly once, on cleanup. */
  destroy: () => Promise<void>;
}>;

/**
 * Opens a PDF document via pdfjs-dist from either a Blob (read as raw
 * bytes) or a URL (fetched by pdfjs-dist itself — the same request an
 * iframe or `<a href>` would have made, so no new cross-origin/auth
 * requirement is introduced versus the iframe this replaces).
 *
 * `destroy` releases the underlying loading task, not the resolved
 * document proxy directly — mirroring inspectWithPdfJs's own
 * `loadingTask.destroy()` in output-validator.ts, the already-proven
 * cleanup call for this pdfjs-dist build.
 */
export async function loadPdfDocument(source: PdfPreviewSource): Promise<LoadedPdfDocument> {
  const pdfjs = await loadPdfJs();
  const params = await resolveGetDocumentParams(source);
  const loadingTask = pdfjs.getDocument(params);
  const document = await loadingTask.promise;
  return { document, destroy: () => loadingTask.destroy() };
}

/** How many of a document's pages should actually be rendered inline, given a cap. Never negative, never more than the document has. */
export function pagesToRender(totalPages: number, maxPages: number): number {
  if (!Number.isFinite(totalPages) || totalPages <= 0) return 0;
  if (!Number.isFinite(maxPages) || maxPages <= 0) return 0;
  return Math.min(Math.floor(totalPages), Math.floor(maxPages));
}

export type RenderedPageSize = Readonly<{ width: number; height: number }>;

/**
 * Renders one page onto an already-mounted <canvas>, scaled to exactly
 * fill `containerWidth` (so the page fills the preview's current width at
 * the correct aspect ratio on any viewport/orientation) and backed at the
 * device's actual pixel ratio (so it stays sharp on high-DPI mobile
 * screens instead of stretching a low-resolution raster). The canvas's
 * CSS size is set in logical (CSS) pixels while its backing-store
 * width/height are set in device pixels — the standard "retina canvas"
 * pattern — with the render transform scaled to match.
 */
export async function renderPageToCanvas(
  page: PdfPageProxy,
  canvas: HTMLCanvasElement,
  containerWidth: number,
): Promise<RenderedPageSize> {
  const unscaledViewport = page.getViewport({ scale: 1 });
  const scale = containerWidth > 0 ? containerWidth / unscaledViewport.width : 1;
  const viewport = page.getViewport({ scale });

  const outputScale = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
  canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas rendering context is not available.");
  }

  const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
  await page.render({ canvas, canvasContext: context, viewport, transform }).promise;

  return { width: viewport.width, height: viewport.height };
}
