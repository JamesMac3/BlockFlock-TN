import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, rgb, StandardFonts } from "pdf-lib";
import type { BasePdfLoader, FontLoader } from "./acroform-renderer";
import { requestProfileSchema, type RequestProfile } from "./profile-schema";
import { readPlaceholderValue } from "./placeholder-resolver";
import { sanitizeForWinAnsiFont } from "./winansi-text";
import type { PdfRenderer, RendererContext, RenderedPdf } from "./template-resolver";

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_CONTINUATION_PAGES = 25;

export type OverlayRendererDependencies = Readonly<{
  loadBasePdf: BasePdfLoader;
  loadFont?: FontLoader;
  loadContinuationProfile?: (profileId: string) => Promise<unknown>;
  today?: () => string;
}>;

export type OverlayRendererErrorCode =
  | "WRONG_RENDERER"
  | "SOURCE_PDF_INVALID"
  | "SOURCE_PDF_TOO_LARGE"
  | "FONT_INVALID"
  | "FIELD_VALUE_MISSING"
  | "FIELD_VALUE_INVALID"
  | "BOX_OUT_OF_BOUNDS"
  | "TEXT_OVERFLOW"
  | "CONTINUATION_REQUIRED"
  | "CONTINUATION_PROFILE_INVALID"
  | "CONTINUATION_LIMIT_EXCEEDED"
  | "PDF_SAVE_FAILED";

export class OverlayRendererError extends Error {
  constructor(
    readonly code: OverlayRendererErrorCode,
    message: string,
    readonly field?: string,
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "OverlayRendererError";
  }
}

function splitLongWord(word: string, font: PDFFont, size: number, width: number): string[] {
  const parts: string[] = [];
  let part = "";
  for (const character of [...word]) {
    const candidate = part + character;
    if (part && font.widthOfTextAtSize(candidate, size) > width) {
      parts.push(part);
      part = character;
    } else part = candidate;
  }
  if (part) parts.push(part);
  return parts;
}

export function wrapOverlayText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const originalWord of paragraph.trim().split(/\s+/)) {
      const words = font.widthOfTextAtSize(originalWord, size) > width
        ? splitLongWord(originalWord, font, size, width)
        : [originalWord];
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && font.widthOfTextAtSize(candidate, size) > width) {
          lines.push(current);
          current = word;
        } else current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

async function embedFont(document: PDFDocument, key: string, loader?: FontLoader): Promise<PDFFont> {
  const bytes = loader ? await loader(key) : undefined;
  if (!bytes) return document.embedFont(StandardFonts.Helvetica);
  try {
    document.registerFontkit(fontkit);
    return await document.embedFont(bytes, { subset: true });
  } catch (error) {
    throw new OverlayRendererError("FONT_INVALID", `The configured overlay font is invalid: ${key}.`, undefined, error);
  }
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return undefined;
}

function parseHexColor(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  ];
}

function assertBox(pageWidth: number, pageHeight: number, field: { x: number; y: number; width: number; height: number }, source: string) {
  if (field.x < 0 || field.y < 0 || field.x + field.width > pageWidth || field.y + field.height > pageHeight) {
    throw new OverlayRendererError("BOX_OUT_OF_BOUNDS", "The verified overlay box exceeds the PDF page.", source);
  }
}

async function appendContinuation(
  document: PDFDocument,
  currentProfile: RequestProfile,
  sourcePath: string,
  text: string,
  dependencies: OverlayRendererDependencies,
  fonts: Map<string, PDFFont>,
): Promise<void> {
  if (!currentProfile.continuation_profile_id || !dependencies.loadContinuationProfile) {
    throw new OverlayRendererError("CONTINUATION_REQUIRED", "A verified continuation profile loader is required.", sourcePath);
  }
  const parsed = requestProfileSchema.safeParse(await dependencies.loadContinuationProfile(currentProfile.continuation_profile_id));
  if (!parsed.success) throw new OverlayRendererError("CONTINUATION_PROFILE_INVALID", "The continuation profile failed validation.", sourcePath);
  const continuation = parsed.data;
  const today = dependencies.today?.() ?? new Date().toISOString().slice(0, 10);
  if (
    continuation.status !== "verified"
    || continuation.government_entity_id !== currentProfile.government_entity_id
    || continuation.renderer_type !== "overlay"
    || continuation.field_schema.renderer_type !== "overlay"
    || continuation.continuation_profile_id !== null
    || continuation.field_schema.fields.length !== 1
    || (continuation.effective_from !== null && today < continuation.effective_from)
    || (continuation.effective_to !== null && today > continuation.effective_to)
  ) throw new OverlayRendererError("CONTINUATION_PROFILE_INVALID", "The continuation profile is not a current, same-entity, terminal overlay profile.", sourcePath);
  const field = continuation.field_schema.fields[0];
  if (field.source !== sourcePath || field.page !== 0 || field.overflow === "continuation" || !continuation.base_pdf_object_id) {
    throw new OverlayRendererError("CONTINUATION_PROFILE_INVALID", "The continuation field does not match the overflowing source.", sourcePath);
  }
  const bytes = await dependencies.loadBasePdf(continuation.base_pdf_object_id);
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_SOURCE_BYTES) {
    throw new OverlayRendererError("CONTINUATION_PROFILE_INVALID", "The continuation source PDF is missing or oversized.", sourcePath);
  }
  let sourceDocument: PDFDocument;
  try { sourceDocument = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false }); }
  catch (error) { throw new OverlayRendererError("CONTINUATION_PROFILE_INVALID", "The continuation source PDF is invalid.", sourcePath, error); }
  if (sourceDocument.getPageCount() !== 1) throw new OverlayRendererError("CONTINUATION_PROFILE_INVALID", "A v1 continuation source must contain exactly one page.", sourcePath);

  let font = fonts.get(field.font_key);
  if (!font) {
    font = await embedFont(document, field.font_key, dependencies.loadFont);
    fonts.set(field.font_key, font);
  }
  let size = field.font_size;
  let lineHeight = field.line_height;
  let lines = wrapOverlayText(text, font, size, field.width);
  const capacity = () => Math.min(field.max_lines, Math.floor(field.height / lineHeight));
  if (field.overflow === "shrink") {
    while (capacity() < 1 && size - 0.5 >= continuation.output_options.minimum_font_size) {
      const ratio = (size - 0.5) / size; size -= 0.5; lineHeight *= ratio;
      lines = wrapOverlayText(text, font, size, field.width);
    }
  }
  const perPage = capacity();
  if (perPage < 1) throw new OverlayRendererError("CONTINUATION_PROFILE_INVALID", "The continuation box cannot contain one line.", sourcePath);
  const pageCount = Math.ceil(lines.length / perPage);
  if (pageCount > MAX_CONTINUATION_PAGES) throw new OverlayRendererError("CONTINUATION_LIMIT_EXCEEDED", "Continuation exceeds 25 pages.", sourcePath);
  const [red, green, blue] = parseHexColor(field.color);
  for (let index = 0; index < pageCount; index += 1) {
    const [copied] = await document.copyPages(sourceDocument, [0]);
    document.addPage(copied);
    const { width, height } = copied.getSize();
    assertBox(width, height, field, sourcePath);
    lines.slice(index * perPage, (index + 1) * perPage).forEach((line, lineIndex) => {
      copied.drawText(line, { x: field.x, y: field.y + field.height - lineHeight * (lineIndex + 1), size, font, color: rgb(red, green, blue), maxWidth: field.width });
    });
  }
}

async function renderOverlay(
  context: RendererContext,
  dependencies: OverlayRendererDependencies,
): Promise<RenderedPdf> {
  const { profile, data } = context;
  if (profile.renderer_type !== "overlay" || profile.field_schema.renderer_type !== "overlay") {
    throw new OverlayRendererError("WRONG_RENDERER", "The overlay renderer received a different profile type.");
  }
  if (!profile.base_pdf_object_id) throw new OverlayRendererError("SOURCE_PDF_INVALID", "No overlay source PDF is configured.");
  const source = await dependencies.loadBasePdf(profile.base_pdf_object_id);
  if (!(source instanceof Uint8Array) || source.length === 0) throw new OverlayRendererError("SOURCE_PDF_INVALID", "The overlay source is empty.");
  if (source.length > MAX_SOURCE_BYTES) throw new OverlayRendererError("SOURCE_PDF_TOO_LARGE", "The overlay source exceeds 25 MB.");

  let document: PDFDocument;
  try {
    document = await PDFDocument.load(source, { ignoreEncryption: false, updateMetadata: false });
  } catch (error) {
    throw new OverlayRendererError("SOURCE_PDF_INVALID", "The overlay source is encrypted, damaged, or not a PDF.", undefined, error);
  }
  const fonts = new Map<string, PDFFont>();

  for (const field of profile.field_schema.fields) {
    const value = readPlaceholderValue(field.source, data);
    if (value === undefined || value === null || value === "") {
      if (field.required) throw new OverlayRendererError("FIELD_VALUE_MISSING", `Required overlay value is missing: ${field.source}.`, field.source);
      continue;
    }
    const rawText = stringValue(value);
    if (rawText === undefined) throw new OverlayRendererError("FIELD_VALUE_INVALID", `Overlay value is not printable: ${field.source}.`, field.source);
    // Same standard-font (WinAnsi-only) limitation as the acroform
    // renderer — see winansi-text.ts. Sanitized before any width
    // measurement/wrapping so layout reflects what will actually render.
    const text = sanitizeForWinAnsiFont(rawText);
    const page = document.getPages()[field.page];
    if (!page) throw new OverlayRendererError("BOX_OUT_OF_BOUNDS", `Overlay page does not exist: ${field.page}.`, field.source);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    assertBox(pageWidth, pageHeight, field, field.source);

    let font = fonts.get(field.font_key);
    if (!font) {
      font = await embedFont(document, field.font_key, dependencies.loadFont);
      fonts.set(field.font_key, font);
    }
    let size = field.font_size;
    let lineHeight = field.line_height;
    let lines = wrapOverlayText(text, font, size, field.width);
    const fits = () => lines.length <= field.max_lines && lines.length * lineHeight <= field.height;
    if (!fits() && field.overflow === "shrink") {
      const minimum = profile.output_options.minimum_font_size;
      while (!fits() && size - 0.5 >= minimum) {
        const ratio = (size - 0.5) / size;
        size -= 0.5;
        lineHeight *= ratio;
        lines = wrapOverlayText(text, font, size, field.width);
      }
    }
    if (!fits()) {
      if (field.overflow === "continuation" && profile.output_options.allow_continuation && profile.continuation_profile_id) {
        const label = field.continuation_label ?? "";
        const labelLines = wrapOverlayText(label, font, size, field.width);
        if (labelLines.length > field.max_lines || labelLines.length * lineHeight > field.height) {
          throw new OverlayRendererError("TEXT_OVERFLOW", "The verified continuation label does not fit the primary form.", field.source);
        }
        const [red, green, blue] = parseHexColor(field.color);
        labelLines.forEach((line, index) => page.drawText(line, { x: field.x, y: field.y + field.height - lineHeight * (index + 1), size, font, color: rgb(red, green, blue), maxWidth: field.width }));
        await appendContinuation(document, profile, field.source, text, dependencies, fonts);
        continue;
      }
      throw new OverlayRendererError("TEXT_OVERFLOW", "Text does not fit the verified overlay box.", field.source);
    }

    const [red, green, blue] = parseHexColor(field.color);
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: field.x,
        y: field.y + field.height - lineHeight * (index + 1),
        size,
        font,
        color: rgb(red, green, blue),
        maxWidth: field.width,
      });
    });
  }

  try {
    const pdfBytes = await document.save({ addDefaultPage: false, updateFieldAppearances: false });
    return { pdfBytes, warnings: [], diagnostics: [] };
  } catch (error) {
    throw new OverlayRendererError("PDF_SAVE_FAILED", "The overlay PDF could not be saved.", undefined, error);
  }
}

export function createOverlayRenderer(dependencies: OverlayRendererDependencies): PdfRenderer {
  return (context) => renderOverlay(context, dependencies);
}
