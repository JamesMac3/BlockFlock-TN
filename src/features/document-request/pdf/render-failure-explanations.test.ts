import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { RequestProfile } from "./profile-schema";
import type { RequestDocumentData } from "./request-data-schema";
import { createOverlayRenderer, OverlayRendererError } from "./overlay-renderer";
import { createAcroformRenderer, AcroformRendererError } from "./acroform-renderer";
import { createLetterRenderer } from "./letter-renderer";
import { resolveAndRenderTemplate, type RendererRegistry } from "./template-resolver";
import { TemplateSourceError } from "./supabase-template-loader";
import { explainRenderFailure } from "./render-failure-explanations";

const entityId = "10000000-0000-4000-8000-000000000001";
const profileId = "20000000-0000-4000-8000-000000000002";
const sourceId = "30000000-0000-4000-8000-000000000003";
const verifierId = "40000000-0000-4000-8000-000000000004";

function baseData(recordsDescription: string): RequestDocumentData {
  return {
    government_entity: { id: entityId, legal_name: "Example City", display_name: "Example City" },
    request: {
      goal_language: "Request records documenting the acquisition and operation of the system.",
      records_description: recordsDescription,
      delivery_method: "electronic",
    },
    profile: { id: profileId, version: 1, government_entity_id: entityId },
  };
}

type OverlayField = Extract<RequestProfile["field_schema"], { renderer_type: "overlay" }>["fields"][number];
type AcroformField = Extract<RequestProfile["field_schema"], { renderer_type: "acroform" }>["fields"][number];

function overlayProfile(field: OverlayField): RequestProfile {
  return {
    id: profileId, government_entity_id: entityId, version: 1, schema_version: 1,
    status: "verified", effective_from: null, effective_to: null,
    policy_source_url: "https://example.test/policy", archived_policy_object_id: null,
    policy_summary: null, eligibility_mode: "unknown", eligibility_jurisdiction: null,
    eligibility_explanation: null, form_mode: "required", form_explanation: null,
    fee_rule: null, aggregation_rule: null, submission_instructions: null,
    template_family: "municipal_form", renderer_type: "overlay",
    base_pdf_object_id: sourceId, continuation_profile_id: null,
    field_schema: { schema_version: 1, renderer_type: "overlay", fields: [field] },
    template_schema: { schema_version: 1, blocks: [] },
    validation_schema: { schema_version: 1, required_paths: [], rules: [], scope_warnings: { broad_mode_confirmation: true } },
    output_options: {
      schema_version: 1, flatten_acroform: false, preserve_source_metadata: false,
      pdf_title_pattern: "Request", filename_pattern: "request.pdf", page_size: "LETTER",
      margin_points: 72, default_font_key: "body", minimum_font_size: 8,
      show_page_numbers: false, allow_continuation: false,
    },
    verified_by: verifierId, verified_at: "2026-08-01T12:00:00Z",
  };
}

function acroformProfile(fields: AcroformField[]): RequestProfile {
  return {
    id: profileId, government_entity_id: entityId, version: 1, schema_version: 1,
    status: "verified", effective_from: null, effective_to: null,
    policy_source_url: "https://example.test/policy", archived_policy_object_id: null,
    policy_summary: null, eligibility_mode: "citizenship_required", eligibility_jurisdiction: "TN",
    eligibility_explanation: null, form_mode: "required", form_explanation: null,
    fee_rule: null, aggregation_rule: null, submission_instructions: null,
    template_family: "municipal_form", renderer_type: "acroform",
    base_pdf_object_id: sourceId, continuation_profile_id: null,
    field_schema: { schema_version: 1, renderer_type: "acroform", fields },
    template_schema: { schema_version: 1, blocks: [] },
    validation_schema: { schema_version: 1, required_paths: [], rules: [], scope_warnings: { broad_mode_confirmation: true } },
    output_options: {
      schema_version: 1, flatten_acroform: false, preserve_source_metadata: false,
      pdf_title_pattern: "Request", filename_pattern: "request.pdf", page_size: "LETTER",
      margin_points: 72, default_font_key: "body", minimum_font_size: 8,
      show_page_numbers: false, allow_continuation: false,
    },
    verified_by: verifierId, verified_at: "2026-08-01T12:00:00Z",
  };
}

const utilityOverlayField: OverlayField = {
  source: "request.records_description", page: 0, x: 72, y: 500, width: 120,
  height: 26, font_key: "body", font_size: 10, line_height: 13, max_lines: 2,
  color: "#000000", required: true, overflow: "error",
};

async function blankPdf() {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return document.save();
}

async function acroformSourcePdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const form = document.getForm();
  form.createTextField("RecordsDescription").addToPage(page, { x: 72, y: 500, width: 468, height: 120 });
  const radio = form.createRadioGroup("DeliveryChoice");
  radio.addOptionToPage("Choice1", page, { x: 72, y: 450, width: 15, height: 15 });
  radio.addOptionToPage("Choice2", page, { x: 150, y: 450, width: 15, height: 15 });
  return document.save();
}

describe("explainRenderFailure: the confirmed regression — TEXT_OVERFLOW on request.records_description", () => {
  it("produces the exact required message, with no invented character limit", async () => {
    const renderer = createOverlayRenderer({ loadBasePdf: async () => blankPdf() });
    let thrown: unknown;
    try {
      await renderer({
        profile: overlayProfile(utilityOverlayField),
        data: baseData("A very long records description that will not fit inside this small overlay box no matter how it wraps."),
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OverlayRendererError);
    expect((thrown as OverlayRendererError).code).toBe("TEXT_OVERFLOW");

    const explanation = explainRenderFailure(thrown);
    expect(explanation.category).toBe("layout_overflow");
    expect(explanation.headline).toBe(
      "The records description is too long for this form's available space. Shorten the text or remove extra line breaks, save, and preview again."
    );
    // No number appears anywhere — this is a layout problem, not a
    // configured character limit, and must never claim to have one.
    expect(explanation.headline).not.toMatch(/\d/);
    expect(explanation.detail ?? "").not.toMatch(/\d/);
  });

  it("shortening the request changes the outcome from failure to success, without weakening validation", async () => {
    const renderer = createOverlayRenderer({ loadBasePdf: async () => blankPdf() });

    await expect(renderer({
      profile: overlayProfile(utilityOverlayField),
      data: baseData("A very long records description that will not fit inside this small overlay box no matter how it wraps."),
    })).rejects.toBeInstanceOf(OverlayRendererError);

    const result = await renderer({
      profile: overlayProfile(utilityOverlayField),
      data: baseData("Short request."),
    });
    expect(result.pdfBytes.byteLength).toBeGreaterThan(0);
    expect(result.diagnostics).toEqual([]);
  });

  it("still recognizes the failure after resolveAndRenderTemplate wraps it as a generic TemplateResolverError (the real, un-mocked wrapping chain)", async () => {
    const renderers: RendererRegistry = {
      acroform: createAcroformRenderer({ loadBasePdf: async () => acroformSourcePdf() }),
      overlay: createOverlayRenderer({ loadBasePdf: async () => blankPdf() }),
      generated_letter: createLetterRenderer(),
    };
    let thrown: unknown;
    try {
      await resolveAndRenderTemplate(
        overlayProfile(utilityOverlayField),
        baseData("A very long records description that will not fit inside this small overlay box no matter how it wraps."),
        renderers,
      );
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).name).toBe("TemplateResolverError");
    expect((thrown as { causeValue?: unknown }).causeValue).toBeInstanceOf(OverlayRendererError);

    const explanation = explainRenderFailure(thrown);
    expect(explanation.category).toBe("layout_overflow");
    expect(explanation.headline).toContain("records description is too long");
  });
});

describe("explainRenderFailure: an explicit configured character-limit violation (acroform max_length)", () => {
  it("reports the field's friendly name, current character count, and maximum — distinct from layout overflow", async () => {
    const renderer = createAcroformRenderer({ loadBasePdf: async () => acroformSourcePdf() });
    const longText = "x".repeat(20);
    let thrown: unknown;
    try {
      await renderer({
        profile: acroformProfile([{ source: "request.records_description", pdf_field: "RecordsDescription", kind: "text", required: false, max_length: 10 }]),
        data: baseData(longText),
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AcroformRendererError);
    expect((thrown as AcroformRendererError).code).toBe("FIELD_VALUE_TOO_LONG");

    const explanation = explainRenderFailure(thrown);
    expect(explanation.category).toBe("character_limit");
    expect(explanation.headline).toContain("Records description");
    expect(explanation.headline).toContain(`${longText.length} characters`);
    expect(explanation.headline).toContain("10-character limit");
    expect(explanation.detail).toBe("Shorten the text, save, and preview again.");
  });
});

describe("explainRenderFailure: missing required fields", () => {
  it("names the missing field and gives a request-specific call to action for a request.* source", async () => {
    const renderer = createAcroformRenderer({ loadBasePdf: async () => acroformSourcePdf() });
    let thrown: unknown;
    try {
      await renderer({
        profile: acroformProfile([{ source: "request.department_or_division", pdf_field: "RecordsDescription", kind: "text", required: true }]),
        data: baseData("Short request."),
      });
    } catch (error) {
      thrown = error;
    }
    const explanation = explainRenderFailure(thrown);
    expect(explanation.category).toBe("missing_required");
    expect(explanation.headline).toContain("Department or division");
    expect(explanation.detail).toMatch(/goal's request details/);
  });

  it("gives an entity-record call to action for a government_entity.* source", async () => {
    const renderer = createOverlayRenderer({ loadBasePdf: async () => blankPdf() });
    const field: OverlayField = {
      source: "government_entity.mailing_address", page: 0, x: 72, y: 500, width: 200,
      height: 40, font_key: "body", font_size: 10, line_height: 13, max_lines: 3,
      color: "#000000", required: true, overflow: "error",
    };
    let thrown: unknown;
    try {
      await renderer({ profile: overlayProfile(field), data: baseData("Short request.") });
    } catch (error) {
      thrown = error;
    }
    const explanation = explainRenderFailure(thrown);
    expect(explanation.category).toBe("missing_required");
    expect(explanation.headline).toContain("Mailing address");
    expect(explanation.detail).toMatch(/government entity's record/);
  });
});

describe("explainRenderFailure: an unsupported/mismatched PDF field option (radio option_value)", () => {
  it("explains a multi-option radio group configured with option_value as a profile configuration issue", async () => {
    const renderer = createAcroformRenderer({ loadBasePdf: async () => acroformSourcePdf() });
    let thrown: unknown;
    try {
      await renderer({
        profile: acroformProfile([{ source: "request.delivery_method", pdf_field: "DeliveryChoice", kind: "radio", required: true, option_value: "usps_mail" }]),
        data: baseData("Short request."),
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AcroformRendererError);
    const explanation = explainRenderFailure(thrown);
    expect(explanation.category).toBe("unsupported_field");
    expect(explanation.headline).toContain("DeliveryChoice");
    expect(explanation.detail).toMatch(/administrator/);
  });
});

describe("explainRenderFailure: wrapped errors and unknown-error fallback", () => {
  it("unwraps a multi-level causeValue chain to find the deepest recognized error", async () => {
    const inner = new OverlayRendererError("FIELD_VALUE_MISSING", "Required overlay value is missing: request.records_description.", "request.records_description");
    const middleWrapper = Object.assign(new Error("outer wrapper"), { name: "TemplateResolverError", code: "RENDERER_FAILED", causeValue: inner });
    const explanation = explainRenderFailure(middleWrapper);
    expect(explanation.category).toBe("missing_required");
    expect(explanation.headline).toContain("Records description");
  });

  it("classifies a TemplateSourceError download failure as template-unavailable", () => {
    const error = new TemplateSourceError("SOURCE_DOWNLOAD_FAILED", "Template download failed with status 500.");
    const explanation = explainRenderFailure(error);
    expect(explanation.category).toBe("template_unavailable");
  });

  it("classifies a TemplateSourceError hash mismatch as a file-integrity failure", () => {
    const error = new TemplateSourceError("SOURCE_HASH_MISMATCH", "Downloaded template hash does not match its verified evidence record.");
    const explanation = explainRenderFailure(error);
    expect(explanation.category).toBe("file_integrity");
  });

  it("falls back to a generic message with a stable code for a completely unrecognized error, and never echoes the raw error message", () => {
    const error = new Error("relation \"internal_secret_table\" does not exist at /var/task/index.js:42");
    const explanation = explainRenderFailure(error);
    expect(explanation.category).toBe("unexpected");
    expect(explanation.headline).toBe("The document could not be generated because of an unexpected problem.");
    expect(explanation.headline).not.toContain("internal_secret_table");
    expect(explanation.detail).not.toContain("internal_secret_table");
    expect(explanation.code).toMatch(/^UNEXPECTED_/);
  });

  it("falls back gracefully for a thrown non-Error value", () => {
    const explanation = explainRenderFailure("a plain string was thrown");
    expect(explanation.category).toBe("unexpected");
    expect(explanation.code).toBe("UNEXPECTED_ERROR");
  });
});
