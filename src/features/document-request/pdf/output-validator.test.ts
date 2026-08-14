import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { RequestProfile } from "./profile-schema";
import type { RequestDocumentData } from "./request-data-schema";
import { inspectWithPdfJs, OutputValidationError, sanitizePdfFilename, validateRenderedOutput } from "./output-validator";

const entityId = "10000000-0000-4000-8000-000000000001";
const profileId = "20000000-0000-4000-8000-000000000002";
const bytes = new TextEncoder().encode("%PDF-1.7 test");
const data: RequestDocumentData = {
  government_entity: { id: entityId, legal_name: "Example City", display_name: "Example City" },
  request: { goal_language: "Request records documenting the acquisition and operation of the system.", records_description: "The executed contract and all amendments for the system.", delivery_method: "electronic" },
  profile: { id: profileId, version: 1, government_entity_id: entityId },
};
const profile: RequestProfile = {
  id: profileId, government_entity_id: entityId, version: 1, schema_version: 1, status: "verified",
  effective_from: null, effective_to: null, policy_source_url: "https://example.test/policy",
  archived_policy_object_id: null, policy_summary: null, eligibility_mode: "unknown",
  eligibility_jurisdiction: null, eligibility_explanation: null, form_mode: "not_required",
  form_explanation: null, fee_rule: null, aggregation_rule: null, submission_instructions: null,
  template_family: "tennessee_model", renderer_type: "generated_letter", base_pdf_object_id: null,
  continuation_profile_id: null, field_schema: { schema_version: 1, renderer_type: "generated_letter", fields: [] },
  template_schema: { schema_version: 1, blocks: [{ id: "body", type: "paragraph", text: "Records", locked: true }] },
  validation_schema: { schema_version: 1, required_paths: [], rules: [], scope_warnings: { broad_mode_confirmation: true } },
  output_options: { schema_version: 1, flatten_acroform: false, preserve_source_metadata: false, pdf_title_pattern: "Request", filename_pattern: "../Request: {{government_entity.display_name}}", page_size: "LETTER", margin_points: 72, default_font_key: "body", minimum_font_size: 8, show_page_numbers: true, allow_continuation: false },
  verified_by: "40000000-0000-4000-8000-000000000004", verified_at: "2026-08-01T12:00:00Z",
};
const rendered = { pdfBytes: bytes, warnings: [], diagnostics: [] };

async function expectCode(action: () => Promise<unknown>, code: string) {
  try { await action(); throw new Error("Expected failure."); }
  catch (error) { expect(error).toBeInstanceOf(OutputValidationError); expect((error as OutputValidationError).code).toBe(code); }
}

describe("validateRenderedOutput", () => {
  it("accepts inspected output and sanitizes its filename", async () => {
    const result = await validateRenderedOutput(rendered, profile, data, { inspectPdf: async () => ({ pageCount: 1, extractedText: "Records request" }) });
    expect(result.filename).toBe("Request- Example City.pdf");
  });
  it("blocks renderer diagnostics", async () => {
    await expectCode(() => validateRenderedOutput({ ...rendered, diagnostics: [{ code: "OVERFLOW", message: "bad" }] }, profile, data, { inspectPdf: async () => ({ pageCount: 1, extractedText: "" }) }), "RENDER_DIAGNOSTICS_PRESENT");
  });
  it("blocks PDF.js reopen failures", async () => {
    await expectCode(() => validateRenderedOutput(rendered, profile, data, { inspectPdf: async () => { throw new Error("bad"); } }), "PDF_REOPEN_FAILED");
  });
  it("blocks zero and excessive page counts", async () => {
    await expectCode(() => validateRenderedOutput(rendered, profile, data, { inspectPdf: async () => ({ pageCount: 0, extractedText: "" }) }), "PAGE_COUNT_INVALID");
    await expectCode(() => validateRenderedOutput(rendered, profile, data, { inspectPdf: async () => ({ pageCount: 101, extractedText: "" }) }), "PAGE_COUNT_INVALID");
  });
  it("blocks unresolved tokens found after rendering", async () => {
    await expectCode(() => validateRenderedOutput(rendered, profile, data, { inspectPdf: async () => ({ pageCount: 1, extractedText: "{{request.goal_language}}" }) }), "UNRESOLVED_PLACEHOLDER");
  });
  it("sanitizes traversal, reserved characters, and missing extensions", () => {
    expect(sanitizePdfFilename("../../bad:name")).toBe("bad-name.pdf");
  });
  it("reopens a real generated PDF through PDF.js", async () => {
    const document = await PDFDocument.create();
    document.addPage([612, 792]);
    const inspection = await inspectWithPdfJs(await document.save());
    expect(inspection.pageCount).toBe(1);
  });
});
