import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";
import type { AllowedPlaceholderPath } from "./request-data-schema";
import { readPlaceholderValue, resolvePlaceholders } from "./placeholder-resolver";
import type {
  PdfRenderer,
  RenderDiagnostic,
  RenderWarning,
  RendererContext,
  RenderedPdf,
} from "./template-resolver";

const MAX_SOURCE_PDF_BYTES = 25 * 1024 * 1024;

export type BasePdfLoader = (objectId: string) => Promise<Uint8Array>;
export type FontLoader = (fontKey: string) => Promise<Uint8Array | undefined>;

export type AcroformRendererDependencies = Readonly<{
  loadBasePdf: BasePdfLoader;
  loadFont?: FontLoader;
}>;

export type AcroformRendererErrorCode =
  | "WRONG_RENDERER"
  | "SOURCE_PDF_MISSING"
  | "SOURCE_PDF_TOO_LARGE"
  | "SOURCE_PDF_INVALID"
  | "XFA_UNSUPPORTED"
  | "DUPLICATE_FIELD_MAPPING"
  | "FIELD_VALUE_MISSING"
  | "FIELD_VALUE_INVALID"
  | "FIELD_NOT_FOUND_OR_WRONG_TYPE"
  | "FONT_INVALID"
  | "PDF_SAVE_FAILED";

export class AcroformRendererError extends Error {
  readonly code: AcroformRendererErrorCode;
  readonly diagnostics: readonly RenderDiagnostic[];
  readonly causeValue?: unknown;

  constructor(
    code: AcroformRendererErrorCode,
    message: string,
    diagnostics: readonly RenderDiagnostic[] = [],
    causeValue?: unknown,
  ) {
    super(message);
    this.name = "AcroformRendererError";
    this.code = code;
    this.diagnostics = diagnostics;
    this.causeValue = causeValue;
  }
}

function displayValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return undefined;
}

function diagnostic(code: string, message: string, field?: string): RenderDiagnostic {
  return { code, message, field };
}

async function embedAppearanceFont(
  document: PDFDocument,
  fontKey: string,
  loadFont?: FontLoader,
): Promise<PDFFont> {
  if (!loadFont) return document.embedFont(StandardFonts.Helvetica);

  const bytes = await loadFont(fontKey);
  if (!bytes) return document.embedFont(StandardFonts.Helvetica);

  try {
    document.registerFontkit(fontkit);
    return await document.embedFont(bytes, { subset: true });
  } catch (error) {
    throw new AcroformRendererError(
      "FONT_INVALID",
      `The configured appearance font could not be embedded: ${fontKey}.`,
      [],
      error,
    );
  }
}

async function renderAcroform(
  context: RendererContext,
  dependencies: AcroformRendererDependencies,
): Promise<RenderedPdf> {
  const { profile, data } = context;
  if (profile.renderer_type !== "acroform" || profile.field_schema.renderer_type !== "acroform") {
    throw new AcroformRendererError("WRONG_RENDERER", "The AcroForm renderer received a different profile type.");
  }
  if (!profile.base_pdf_object_id) {
    throw new AcroformRendererError("SOURCE_PDF_MISSING", "The AcroForm profile has no source PDF reference.");
  }

  const sourceBytes = await dependencies.loadBasePdf(profile.base_pdf_object_id);
  if (!(sourceBytes instanceof Uint8Array) || sourceBytes.length === 0) {
    throw new AcroformRendererError("SOURCE_PDF_MISSING", "The source PDF could not be loaded.");
  }
  if (sourceBytes.length > MAX_SOURCE_PDF_BYTES) {
    throw new AcroformRendererError(
      "SOURCE_PDF_TOO_LARGE",
      `The source PDF exceeds the ${MAX_SOURCE_PDF_BYTES} byte safety limit.`,
    );
  }

  let document: PDFDocument;
  try {
    document = await PDFDocument.load(sourceBytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
  } catch (error) {
    throw new AcroformRendererError("SOURCE_PDF_INVALID", "The source is encrypted, damaged, or not a PDF.", [], error);
  }

  const form = document.getForm();
  if (form.hasXFA()) {
    throw new AcroformRendererError("XFA_UNSUPPORTED", "XFA forms are not supported or silently converted.");
  }

  const diagnostics: RenderDiagnostic[] = [];
  const warnings: RenderWarning[] = [];
  const mappedNames = new Set<string>();

  for (const mapping of profile.field_schema.fields) {
    if (mappedNames.has(mapping.pdf_field)) {
      diagnostics.push(diagnostic(
        "DUPLICATE_FIELD_MAPPING",
        `The PDF field is mapped more than once: ${mapping.pdf_field}.`,
        mapping.pdf_field,
      ));
      continue;
    }
    mappedNames.add(mapping.pdf_field);

    const value = readPlaceholderValue(mapping.source as AllowedPlaceholderPath, data);
    const missing = value === undefined || value === null || value === "";
    if (missing) {
      if (mapping.required) {
        diagnostics.push(diagnostic(
          "FIELD_VALUE_MISSING",
          `A required value is missing for ${mapping.source}.`,
          mapping.pdf_field,
        ));
      }
      continue;
    }

    try {
      switch (mapping.kind) {
        case "text": {
          const text = displayValue(value);
          if (text === undefined || typeof value === "boolean") {
            diagnostics.push(diagnostic("FIELD_VALUE_INVALID", "Text fields require a string or number.", mapping.pdf_field));
            break;
          }
          if (mapping.max_length !== undefined && text.length > mapping.max_length) {
            diagnostics.push(diagnostic(
              "FIELD_VALUE_INVALID",
              `Value exceeds the ${mapping.max_length} character limit.`,
              mapping.pdf_field,
            ));
            break;
          }
          const textField = form.getTextField(mapping.pdf_field);
          if (mapping.multiline) textField.enableMultiline();
          textField.setText(text);
          break;
        }
        case "checkbox": {
          const checkbox = form.getCheckBox(mapping.pdf_field);
          if (typeof value === "boolean") {
            if (value) checkbox.check();
            else checkbox.uncheck();
            break;
          }
          if (mapping.option_value && displayValue(value) !== undefined) {
            if (displayValue(value) === mapping.option_value) checkbox.check();
            else checkbox.uncheck();
            break;
          }
          diagnostics.push(diagnostic(
            "FIELD_VALUE_INVALID",
            "Checkbox fields require a boolean or a verified option_value match.",
            mapping.pdf_field,
          ));
          break;
        }
        case "radio": {
          const radio = form.getRadioGroup(mapping.pdf_field);
          if (typeof value === "boolean") {
            if (!mapping.option_value) {
              diagnostics.push(diagnostic(
                "FIELD_VALUE_INVALID",
                "Boolean radio mappings require a verified option_value.",
                mapping.pdf_field,
              ));
              break;
            }
            if (value) radio.select(mapping.option_value);
            else radio.clear();
            break;
          }
          const selected = displayValue(value);
          if (!selected) {
            diagnostics.push(diagnostic("FIELD_VALUE_INVALID", "Radio fields require a selectable value.", mapping.pdf_field));
            break;
          }
          radio.select(selected);
          break;
        }
        case "dropdown": {
          const selected = displayValue(value);
          if (!selected) {
            diagnostics.push(diagnostic("FIELD_VALUE_INVALID", "Dropdown fields require a string or number.", mapping.pdf_field));
            break;
          }
          form.getDropdown(mapping.pdf_field).select(selected);
          break;
        }
      }
    } catch (error) {
      diagnostics.push(diagnostic(
        "FIELD_NOT_FOUND_OR_WRONG_TYPE",
        `The archived PDF does not contain the expected ${mapping.kind} field: ${mapping.pdf_field}.`,
        mapping.pdf_field,
      ));
      warnings.push({
        code: "PDF_FIELD_INSPECTION_REQUIRED",
        message: "The profile must be rechecked against its archived source PDF.",
        field: mapping.pdf_field,
      });
    }
  }

  if (diagnostics.length > 0) {
    const firstCode = diagnostics[0].code as AcroformRendererErrorCode;
    throw new AcroformRendererError(firstCode, "The AcroForm could not be filled safely.", diagnostics);
  }

  const appearanceFont = await embedAppearanceFont(
    document,
    profile.output_options.default_font_key,
    dependencies.loadFont,
  );

  try {
    form.updateFieldAppearances(appearanceFont);
    document.setTitle(resolvePlaceholders(profile.output_options.pdf_title_pattern, data).text);
    document.setProducer("Flock Block document request generator");
    document.setCreator("Flock Block document request generator");

    const pdfBytes = await document.save({
      addDefaultPage: false,
      updateFieldAppearances: false,
    });
    return { pdfBytes, warnings, diagnostics: [] };
  } catch (error) {
    throw new AcroformRendererError(
      "PDF_SAVE_FAILED",
      "The completed form could not be encoded with the configured font and options.",
      [],
      error,
    );
  }
}

export function createAcroformRenderer(dependencies: AcroformRendererDependencies): PdfRenderer {
  return (context) => renderAcroform(context, dependencies);
}
