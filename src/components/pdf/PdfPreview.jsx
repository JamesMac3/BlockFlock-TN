import { useEffect, useRef, useState } from "react";
import "./PdfPreview.css";

/**
 * Shared, mobile-reliable PDF preview. Replaces the `<iframe src={pdfUrl}>`
 * pattern used across RequestDeliveryPanel, DocumentPage,
 * ArchiveDocumentViewer, and PortalDocumentViewer — mobile Safari and some
 * Android browsers do not reliably render an embedded or blob: PDF inside
 * an iframe, and no amount of iframe sizing fixes that. This renders each
 * page to its own <canvas> via pdfjs-dist instead, which every one of
 * those requirements below depends on being true regardless of viewport:
 *
 * - The PDF itself is never altered. This only ever *reads* it to paint
 *   pixels; the original bytes (as a Blob, or at the given URL) are the
 *   only thing Open/Download ever serve, so a fillable AcroForm stays
 *   fillable after download exactly as before.
 * - pdfjs-dist and its worker are only ever imported once rendering is
 *   actually needed (see pdfjs-loader.ts) — this component's own import is
 *   the only thing that must be cheap for a page that never opens a
 *   preview at all.
 * - A `source.blob` is read as raw bytes for rendering (never through a
 *   blob: URL — see pdf-preview-engine.ts's module comment for why), but
 *   a blob: URL is still created, owned, and revoked by this component
 *   for Open/Download's benefit, using the same StrictMode-safe deferred
 *   creation this codebase already establishes elsewhere (see
 *   RequestDeliveryPanel's former object-URL effect): the URL is created
 *   only once a 0ms timeout actually fires, so a React StrictMode
 *   throwaway mount's synchronous cleanup cancels it before
 *   createObjectURL is ever called, and it is revoked on real unmount —
 *   never while a caller-rendered Open/Download link might still use it,
 *   since onUrlReady only ever reports a URL this component still owns
 *   until its own cleanup runs.
 */
export default function PdfPreview({ source, title, onUrlReady, maxPages }) {
  const containerRef = useRef(null);
  const canvasRefsRef = useRef([]);
  const pdfDocumentRef = useRef(null);
  const renderGenerationRef = useRef(0);
  const [objectUrl, setObjectUrl] = useState(source?.kind === "blob" ? null : source?.url ?? null);
  const [phase, setPhase] = useState("loading");
  const [pageCount, setPageCount] = useState(0);
  const [renderedPageCount, setRenderedPageCount] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  const effectiveMaxPages = maxPages ?? 20;

  // Owns the blob: URL lifecycle for a Blob source. A URL source already
  // has a stable URL the caller owns, so nothing to create/revoke here.
  useEffect(() => {
    if (source?.kind !== "blob") return undefined;
    if (!source.blob) {
      const timer = setTimeout(() => setObjectUrl(null), 0);
      return () => clearTimeout(timer);
    }
    let url;
    const timer = setTimeout(() => {
      url = URL.createObjectURL(source.blob);
      setObjectUrl(url);
    }, 0);
    return () => {
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [source]);

  useEffect(() => {
    if (source?.kind === "url") {
      onUrlReady?.(source.url);
      return;
    }
    if (objectUrl) onUrlReady?.(objectUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onUrlReady is a caller-supplied callback, not reactive state this effect should re-run for
  }, [source, objectUrl]);

  // Opens the document once (or whenever the source itself changes) —
  // independent of the object-URL effect above, so a slow/failed canvas
  // render never blocks Open/Download, and a slow/failed URL creation
  // never blocks the preview from opening a URL-sourced document.
  useEffect(() => {
    let active = true;
    let releaseDocument = null;

    async function open() {
      setPhase("loading");
      setPageCount(0);
      setRenderedPageCount(0);
      canvasRefsRef.current = [];

      if (!source || (source.kind === "blob" && !source.blob) || (source.kind === "url" && !source.url)) {
        return;
      }

      try {
        const { loadPdfDocument } = await import("../../features/document-request/pdf/pdf-preview-engine");
        const loaded = await loadPdfDocument(
          source.kind === "blob" ? { kind: "blob", blob: source.blob } : { kind: "url", url: source.url },
        );
        if (!active) {
          await loaded.destroy();
          return;
        }
        releaseDocument = loaded.destroy;
        pdfDocumentRef.current = loaded.document;
        setPageCount(loaded.document.numPages);
        setPhase("ready");
      } catch (error) {
        console.error("PDF preview could not open the document:", error);
        if (active) setPhase("error");
      }
    }

    open();

    return () => {
      active = false;
      if (releaseDocument) {
        releaseDocument().catch((error) => console.error("Failed to release PDF preview document:", error));
      }
      pdfDocumentRef.current = null;
    };
  }, [source]);

  // Tracks the preview's own current width — pages render to exactly this
  // width, and resizing/rotating the device re-renders at the new width
  // rather than stretching the existing raster (which would blur it).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return undefined;

    function updateWidth() {
      setContainerWidth(container.clientWidth);
    }

    updateWidth();
    // Debounced so a drag-resize or an in-progress orientation change
    // doesn't trigger a fresh render pass on every intermediate frame —
    // each resize event clears any still-pending timer from the previous
    // one before scheduling its own.
    let debounceTimer;
    const observer = new ResizeObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateWidth, 150);
    });
    observer.observe(container);
    return () => {
      clearTimeout(debounceTimer);
      observer.disconnect();
    };
  }, []);

  // Renders pages incrementally (one at a time, in order) rather than all
  // at once — a large document never triggers dozens of simultaneous
  // canvas renders — up to effectiveMaxPages, whenever the document,
  // container width, or mounted canvases change. A generation token lets
  // a newer pass (e.g. triggered by a resize mid-render) safely abandon
  // an older one instead of racing to draw over the same canvases.
  useEffect(() => {
    if (phase !== "ready" || !pdfDocumentRef.current || containerWidth <= 0) return undefined;

    const generation = (renderGenerationRef.current += 1);
    let cancelled = false;

    async function renderPages() {
      const { renderPageToCanvas, pagesToRender } = await import(
        "../../features/document-request/pdf/pdf-preview-engine"
      );
      const document_ = pdfDocumentRef.current;
      if (!document_ || cancelled || renderGenerationRef.current !== generation) return;

      const count = pagesToRender(document_.numPages, effectiveMaxPages);
      for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
        if (cancelled || renderGenerationRef.current !== generation) return;
        const canvas = canvasRefsRef.current[pageNumber - 1];
        if (!canvas) continue;
        try {
          const page = await document_.getPage(pageNumber);
          if (cancelled || renderGenerationRef.current !== generation) return;
          await renderPageToCanvas(page, canvas, containerWidth);
          page.cleanup();
          if (!cancelled && renderGenerationRef.current === generation) {
            setRenderedPageCount(pageNumber);
          }
        } catch (error) {
          console.error(`PDF preview failed to render page ${pageNumber}:`, error);
          if (!cancelled && renderGenerationRef.current === generation) setPhase("error");
          return;
        }
      }
    }

    renderPages();
    return () => {
      cancelled = true;
    };
  }, [phase, containerWidth, effectiveMaxPages]);

  const cappedPageCount = Math.min(pageCount, effectiveMaxPages);
  const hasMorePages = pageCount > effectiveMaxPages;

  return (
    <div className="pdf-preview" ref={containerRef}>
      {phase === "loading" && (
        <p className="pdf-preview__status" role="status">
          Preparing preview…
        </p>
      )}

      {phase === "error" && (
        <p className="pdf-preview__status pdf-preview__status--error" role="alert">
          The preview could not be rendered. Use Open or Download above to view the document.
        </p>
      )}

      {phase === "ready" && (
        <div className="pdf-preview__pages">
          {Array.from({ length: cappedPageCount }, (_, index) => (
            <canvas
              key={index}
              ref={(node) => {
                canvasRefsRef.current[index] = node;
              }}
              className="pdf-preview__page"
              aria-label={`${title ?? "Document"} page ${index + 1} of ${pageCount}`}
              role="img"
            />
          ))}
          {renderedPageCount < cappedPageCount && (
            <p className="pdf-preview__status" role="status">
              Rendering page {renderedPageCount + 1} of {cappedPageCount}…
            </p>
          )}
          {hasMorePages && (
            <p className="pdf-preview__status pdf-preview__status--truncated">
              This document has {pageCount} pages — showing the first {effectiveMaxPages}. Use Open or Download
              above to view the complete document.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
