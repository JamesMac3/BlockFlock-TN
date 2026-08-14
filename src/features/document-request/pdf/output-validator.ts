import { requestProfileSchema } from "./profile-schema";
import { requestDocumentDataSchema } from "./request-data-schema";
import { resolvePlaceholders } from "./placeholder-resolver";
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

export async function inspectWithPdfJs(pdfBytes: Uint8Array): Promise<PdfInspection> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice() });
  const document = await loadingTask.promise;
  try {
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      page.cleanup();
    }
    return { pageCount: document.numPages, extractedText: pageTexts.join("\n") };
  } finally {
    await loadingTask.destroy();
  }
}
