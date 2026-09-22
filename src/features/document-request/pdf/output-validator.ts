import { requestProfileSchema } from "./profile-schema";
import { requestDocumentDataSchema } from "./request-data-schema";
import { resolvePlaceholders } from "./placeholder-resolver";
import { PDFJS_WASM_URL } from "./pdfjs-wasm-url";
import type { RenderedPdf, RenderWarning } from "./template-resolver";

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const MAX_OUTPUT_PAGES = 100;
const UNRESOLVED_TOKEN = /\{\{[^{}]*\}\}/;

export type PdfInspection = Readonly<{
  pageCount: number;
  extractedText: string;
}>;

export type PdfInspector = (pdfBytes: Uint8Array) => Promise<PdfInspection>;

export type OutputValidationOptions = Readonly<{
  inspectPdf: PdfInspector;
}>;

export type ValidatedOutput = Readonly<{
  pdfBytes: Uint8Array;
  pageCount: number;
  filename: string;
  warnings: readonly RenderWarning[];
}>;

export type OutputValidationErrorCode =
  | "INVALID_PROFILE"
  | "INVALID_REQUEST_DATA"
  | "PROFILE_REQUEST_MISMATCH"
  | "RENDER_DIAGNOSTICS_PRESENT"
  | "OUTPUT_EMPTY"
  | "OUTPUT_TOO_LARGE"
  | "OUTPUT_NOT_PDF"
  | "PDF_REOPEN_FAILED"
  | "PAGE_COUNT_INVALID"
  | "UNRESOLVED_PLACEHOLDER";

export class OutputValidationError extends Error {
  constructor(
    readonly code: OutputValidationErrorCode,
    message: string,
    readonly details: readonly string[] = [],
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "OutputValidationError";
  }
}

// Distinguishes *where* in-browser PDF verification failed. Safari (pre-
// 26.4) does not implement ReadableStream async iteration, which
// pdfjs-dist's own getTextContent() relies on internally (`for await (const
// value of readableStream)` — see streamTextContent's caller in
// node_modules/pdfjs-dist/legacy/build/pdf.mjs). Without a stage, every
// failure in this pipeline collapsed into one generic
// "PDF.js could not reopen the generated output" — indistinguishable from
// an actually corrupt file. This lets the UI say something accurate
// instead (see render-failure-explanations.ts's explainPdfInspectionFailure)
// and gives support a stable, safe code to search logs by.
export type PdfInspectionStage = "worker_init" | "document_open" | "text_extraction";

export class PdfInspectionError extends Error {
  constructor(
    readonly stage: PdfInspectionStage,
    message: string,
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "PdfInspectionError";
  }
}

export function sanitizePdfFilename(value: string): string {
  const leaf = value.normalize("NFKC").replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = leaf
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\- ]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const base = cleaned || "public-records-request.pdf";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

export async function validateRenderedOutput(
  rendered: RenderedPdf,
  profileInput: unknown,
  requestInput: unknown,
  options: OutputValidationOptions,
): Promise<ValidatedOutput> {
  const profileResult = requestProfileSchema.safeParse(profileInput);
  if (!profileResult.success) throw new OutputValidationError("INVALID_PROFILE", "Output validation received an invalid profile.");
  const dataResult = requestDocumentDataSchema.safeParse(requestInput);
  if (!dataResult.success) throw new OutputValidationError("INVALID_REQUEST_DATA", "Output validation received invalid request data.");
  const profile = profileResult.data;
  const data = dataResult.data;
  if (
    profile.id !== data.profile.id
    || profile.version !== data.profile.version
    || profile.government_entity_id !== data.government_entity.id
  ) throw new OutputValidationError("PROFILE_REQUEST_MISMATCH", "The output profile does not match the selected entity and profile.");

  if (rendered.diagnostics.length > 0) {
    throw new OutputValidationError(
      "RENDER_DIAGNOSTICS_PRESENT",
      "Renderer diagnostics block publication.",
      rendered.diagnostics.map((item) => `${item.code}: ${item.message}`),
    );
  }
  if (!(rendered.pdfBytes instanceof Uint8Array) || rendered.pdfBytes.length < 5) {
    throw new OutputValidationError("OUTPUT_EMPTY", "No PDF output was produced.");
  }
  if (rendered.pdfBytes.length > MAX_OUTPUT_BYTES) {
    throw new OutputValidationError("OUTPUT_TOO_LARGE", "The generated PDF exceeds 50 MB.");
  }
  if (String.fromCharCode(...rendered.pdfBytes.slice(0, 5)) !== "%PDF-") {
    throw new OutputValidationError("OUTPUT_NOT_PDF", "The generated output does not have a PDF signature.");
  }

  let inspection: PdfInspection;
  try {
    inspection = await options.inspectPdf(rendered.pdfBytes);
  } catch (error) {
    throw new OutputValidationError("PDF_REOPEN_FAILED", "PDF.js could not reopen the generated output.", [], error);
  }
  if (!Number.isInteger(inspection.pageCount) || inspection.pageCount < 1 || inspection.pageCount > MAX_OUTPUT_PAGES) {
    throw new OutputValidationError("PAGE_COUNT_INVALID", `Generated output must contain 1-${MAX_OUTPUT_PAGES} pages.`);
  }
  if (UNRESOLVED_TOKEN.test(inspection.extractedText)) {
    throw new OutputValidationError("UNRESOLVED_PLACEHOLDER", "Generated output contains unresolved placeholder syntax.");
  }

  const warnings: RenderWarning[] = [...rendered.warnings];
  const filename = sanitizePdfFilename(
    resolvePlaceholders(profile.output_options.filename_pattern, data).text,
  );
  return { pdfBytes: rendered.pdfBytes, pageCount: inspection.pageCount, filename, warnings };
}

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfDocumentProxy = Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>;
type PdfPageProxy = Awaited<ReturnType<PdfDocumentProxy["getPage"]>>;

// Narrowed to just the one method readPageTextContent actually needs
// (rather than the full PdfPageProxy), so tests can drive it with a small
// fake page — a real PdfPageProxy already structurally satisfies this.
export type PdfTextStreamPage = Pick<PdfPageProxy, "streamTextContent">;

// Reads a page's text via streamTextContent()'s ReadableStream through an
// explicit getReader()/read() loop, instead of page.getTextContent() — which
// pdfjs-dist implements internally as `for await (const value of
// readableStream)` (ReadableStream async iteration). Safari did not support
// that until 26.4 (https://webkit.org/blog/17862/webkit-features-for-safari-26-4/),
// and Mozilla has documented failures from it
// (https://github.com/mozilla/pdf.js/issues/20973) — getReader()/read() is
// the widely-supported, explicit equivalent and produces the exact same
// accumulated { items, styles, lang } shape getTextContent() does (compare
// this to getTextContent's own body in
// node_modules/pdfjs-dist/legacy/build/pdf.mjs), so page order and item
// order within a page are unchanged. The reader lock is always released,
// on both the success and the error path.
export async function readPageTextContent(page: PdfTextStreamPage): Promise<string> {
  const stream = page.streamTextContent();
  const reader = stream.getReader();
  const items: Array<{ str?: string }> = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      items.push(...value.items);
    }
  } finally {
    reader.releaseLock();
  }
  return items.map((item) => ("str" in item ? (item.str ?? "") : "")).join(" ");
}

export async function inspectWithPdfJs(pdfBytes: Uint8Array): Promise<PdfInspection> {
  let pdfjs: PdfJsModule;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // pdfjs-dist 6 requires GlobalWorkerOptions.workerSrc in a real
    // browser — without it, getDocument() fails. Node (this module's own
    // tests) has no `window` and no `Worker` global, so pdfjs-dist already
    // falls back to its in-process fake worker there — workerSrc is
    // deliberately left unset in that case rather than pointed at a
    // meaningless value. Both the library and its worker are dynamically
    // imported from the same installed pdfjs-dist package (never a CDN, so
    // versions can never drift apart), so neither ships in the initial
    // bundle; the worker specifically is imported with the `?url` suffix
    // so Vite emits it as a separate static asset that only loads when a
    // preview is actually generated.
    if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
      const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
    }
  } catch (error) {
    throw new PdfInspectionError("worker_init", "PDF.js could not initialize in this browser.", error);
  }

  // Same wasmUrl requirement as pdf-preview-engine.ts's loadPdfDocument —
  // see pdfjs-wasm-url.ts. This function only extracts text (never
  // renders), so the JBIG2/OpenJPEG decoders it exists to configure are
  // unlikely to run here, but passing it keeps this independent
  // getDocument() call from ever being the one still missing it.
  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice(), wasmUrl: PDFJS_WASM_URL });
  try {
    let document: PdfDocumentProxy;
    try {
      document = await loadingTask.promise;
    } catch (error) {
      throw new PdfInspectionError("document_open", "PDF.js could not open the generated document.", error);
    }

    try {
      const pageTexts: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        try {
          pageTexts.push(await readPageTextContent(page));
        } finally {
          page.cleanup();
        }
      }
      return { pageCount: document.numPages, extractedText: pageTexts.join("\n") };
    } catch (error) {
      throw new PdfInspectionError("text_extraction", "PDF.js could not extract text from the generated document.", error);
    }
  } finally {
    // destroy() is safe (and necessary, to release the worker) even when
    // loadingTask.promise itself rejected — see PDFDocumentLoadingTask's
    // own destroy() in pdf.mjs, which awaits its internal setup capability
    // regardless of whether the outer document promise resolved.
    await loadingTask.destroy();
  }
}
