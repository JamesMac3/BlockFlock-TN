import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { RequestProfile } from "./profile-schema";
import type { RequestDocumentData } from "./request-data-schema";
import { createAcroformRenderer } from "./acroform-renderer";
import { createOverlayRenderer } from "./overlay-renderer";
import { createLetterRenderer } from "./letter-renderer";
import { resolveAndRenderTemplate, type RendererRegistry } from "./template-resolver";
import { inspectWithPdfJs, validateRenderedOutput } from "./output-validator";

const entityId = "10000000-0000-4000-8000-000000000001";
const profileId = "20000000-0000-4000-8000-000000000002";
const sourceId = "30000000-0000-4000-8000-000000000003";
const data: RequestDocumentData = {
  government_entity: { id: entityId, legal_name: "Example Tennessee City", display_name: "Example City", coordinator_title: "Public Records Coordinator" },
  request: { goal_language: "Request records documenting the acquisition and operation of the system.", records_description: "The executed contract, amendments, pricing schedules, and current statement of work for the selected system.", delivery_method: "electronic" },
  profile: { id: profileId, version: 1, government_entity_id: entityId },
};

function baseProfile(): Omit<RequestProfile, "template_family" | "renderer_type" | "base_pdf_object_id" | "field_schema" | "template_schema"> {
  return {
    id: profileId, government_entity_id: entityId, version: 1, schema_version: 1,
    status: "verified", effective_from: "2026-01-01", effective_to: null,
    policy_source_url: "https://example.test/tennessee-policy", archived_policy_object_id: null,
    policy_summary: null, eligibility_mode: "citizenship_required", eligibility_jurisdiction: "TN",
    eligibility_explanation: "Tennessee citizenship attestation required.", form_mode: "unknown",
    form_explanation: null, fee_rule: null, aggregation_rule: null, submission_instructions: null,
    continuation_profile_id: null,
    validation_schema: { schema_version: 1, required_paths: ["request.goal_language", "request.records_description"], rules: [], scope_warnings: { broad_mode_confirmation: true } },
    output_options: { schema_version: 1, flatten_acroform: false, preserve_source_metadata: false, pdf_title_pattern: "Records Request - {{government_entity.display_name}}", filename_pattern: "records-request.pdf", page_size: "LETTER", margin_points: 72, default_font_key: "body", minimum_font_size: 8, show_page_numbers: true, allow_continuation: false },
    verified_by: "40000000-0000-4000-8000-000000000004", verified_at: "2026-08-01T12:00:00Z",
  };
}

async function fillableSource() {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  document.getForm().createTextField("RecordsDescription").addToPage(page, { x: 72, y: 560, width: 468, height: 120 });
  return document.save();
}

async function blankSource() {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return document.save();
}

async function run(profile: RequestProfile, source?: Uint8Array) {
  const loadBasePdf = async () => source ?? new Uint8Array();
  const renderers: RendererRegistry = {
    acroform: createAcroformRenderer({ loadBasePdf }),
    overlay: createOverlayRenderer({ loadBasePdf }),
    generated_letter: createLetterRenderer(),
  };
  const rendered = await resolveAndRenderTemplate(profile, data, renderers, { today: "2026-08-06" });
  return validateRenderedOutput(rendered, profile, data, { inspectPdf: inspectWithPdfJs });
}

describe("complete Tennessee request-document pipeline", () => {
  it("fills, flattens, reopens, and validates a municipal AcroForm", async () => {
    const profile: RequestProfile = {
      ...baseProfile(), template_family: "municipal_form", renderer_type: "acroform", base_pdf_object_id: sourceId,
      form_mode: "required",
      field_schema: { schema_version: 1, renderer_type: "acroform", fields: [{ source: "request.records_description", pdf_field: "RecordsDescription", kind: "text", required: true, multiline: true }] },
      template_schema: { schema_version: 1, blocks: [] },
    };
    const result = await run(profile, await fillableSource());
    expect(result.pageCount).toBe(1);
    expect(result.filename).toBe("records-request.pdf");
  });

  it("draws, reopens, and validates a non-fillable municipal overlay", async () => {
    const profile: RequestProfile = {
      ...baseProfile(), template_family: "municipal_form", renderer_type: "overlay", base_pdf_object_id: sourceId,
      form_mode: "required",
      field_schema: { schema_version: 1, renderer_type: "overlay", fields: [{ source: "request.records_description", page: 0, x: 72, y: 400, width: 468, height: 180, font_key: "body", font_size: 10, line_height: 13, max_lines: 13, color: "#000000", required: true, overflow: "error" }] },
      template_schema: { schema_version: 1, blocks: [] },
    };
    expect((await run(profile, await blankSource())).pageCount).toBe(1);
  });

  it("generates, paginates, reopens, and validates the Tennessee fallback letter", async () => {
    const profile: RequestProfile = {
      ...baseProfile(), template_family: "tennessee_model", renderer_type: "generated_letter", base_pdf_object_id: null,
      form_mode: "not_required",
      field_schema: { schema_version: 1, renderer_type: "generated_letter", fields: [] },
      template_schema: { schema_version: 1, document_title: "Tennessee Public Records Request", blocks: [
        { id: "heading", type: "heading", text: "Tennessee Public Records Request", locked: true },
        { id: "recipient", type: "address", lines: ["{{government_entity.coordinator_title}}", "{{government_entity.legal_name}}"], locked: true },
        { id: "body", type: "paragraph", text: "I request access to the following public records: {{request.records_description}}", locked: true },
        { id: "signature", type: "signature", lines: ["Name: ______________________________", "Signature: ___________________________", "Date: _______________________________"], locked: true },
      ] },
    };
    expect((await run(profile)).pageCount).toBe(1);
  });
});
