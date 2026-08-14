import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { RequestProfile } from "./profile-schema";
import type { RequestDocumentData } from "./request-data-schema";
import { createLetterRenderer, LetterRendererError, resolveLetterBlocks } from "./letter-renderer";

const entityId = "10000000-0000-4000-8000-000000000001";
const profileId = "20000000-0000-4000-8000-000000000002";
const data: RequestDocumentData = {
  government_entity: { id: entityId, legal_name: "Example City", display_name: "Example City", coordinator_title: "Public Records Coordinator" },
  request: { goal_language: "Request records documenting the acquisition and operation of the system.", records_description: "The executed contract and amendments for the selected system.", delivery_method: "electronic" },
  profile: { id: profileId, version: 1, government_entity_id: entityId },
};

function profile(blocks: RequestProfile["template_schema"]["blocks"]): RequestProfile {
  return {
    id: profileId, government_entity_id: entityId, version: 1, schema_version: 1,
    status: "verified", effective_from: null, effective_to: null,
    policy_source_url: "https://example.test/policy", archived_policy_object_id: null,
    policy_summary: null, eligibility_mode: "unknown", eligibility_jurisdiction: null,
    eligibility_explanation: null, form_mode: "not_required", form_explanation: null,
    fee_rule: null, aggregation_rule: null, submission_instructions: null,
    template_family: "tennessee_model", renderer_type: "generated_letter", base_pdf_object_id: null,
    continuation_profile_id: null,
    field_schema: { schema_version: 1, renderer_type: "generated_letter", fields: [] },
    template_schema: { schema_version: 1, document_title: "Tennessee Public Records Request", blocks },
    validation_schema: { schema_version: 1, required_paths: [], rules: [], scope_warnings: { broad_mode_confirmation: true } },
    output_options: { schema_version: 1, flatten_acroform: false, preserve_source_metadata: false, pdf_title_pattern: "Request - {{government_entity.display_name}}", filename_pattern: "request.pdf", page_size: "LETTER", margin_points: 72, default_font_key: "body", minimum_font_size: 8, show_page_numbers: true, allow_continuation: false },
    verified_by: "40000000-0000-4000-8000-000000000004", verified_at: "2026-08-01T12:00:00Z",
  };
}

const blocks: RequestProfile["template_schema"]["blocks"] = [
  { id: "heading", type: "heading", text: "Tennessee Public Records Request", locked: true },
  { id: "address", type: "address", lines: ["{{government_entity.coordinator_title}}", "{{government_entity.legal_name}}", "{{government_entity.mailing_address}}"], omit_empty_lines: true, locked: true },
  { id: "body", type: "paragraph", text: "I request: {{request.records_description}}", locked: true },
  { id: "optional", type: "paragraph", text: "System: {{request.vendor_or_system}}", include_when_present: "request.vendor_or_system", locked: false },
  { id: "signature", type: "signature", lines: ["Name: ______________________________", "Signature: ___________________________", "Date: _______________________________"], locked: true },
];

describe("generated letter renderer", () => {
  it("resolves structured blocks and omits absent optional blocks and lines", () => {
    const resolved = resolveLetterBlocks(profile(blocks), data);
    expect(resolved.map((block) => block.id)).not.toContain("optional");
    expect(resolved.find((block) => block.id === "address")?.lines).toEqual(["Public Records Coordinator", "Example City"]);
  });

  it("renders a PDF that can be reopened", async () => {
    const result = await createLetterRenderer()({ profile: profile(blocks), data });
    const document = await PDFDocument.load(result.pdfBytes);
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe("Request - Example City");
  });

  it("honors explicit page-break blocks", async () => {
    const result = await createLetterRenderer()({
      profile: profile([...blocks, { id: "break", type: "page_break", locked: true }, { id: "second", type: "paragraph", text: "Second page", locked: true }]),
      data,
    });
    expect((await PDFDocument.load(result.pdfBytes)).getPageCount()).toBe(2);
  });

  it("rejects unsafe placeholders within blocks", () => {
    expect(() => resolveLetterBlocks(profile([{ id: "bad", type: "paragraph", text: "{{request.__proto__}}", locked: true }]), data))
      .toThrowError(LetterRendererError);
  });

  it("rejects an empty resolved template", () => {
    expect(() => resolveLetterBlocks(profile([{ id: "optional", type: "paragraph", text: "{{request.vendor_or_system}}", include_when_present: "request.vendor_or_system", locked: false }]), data))
      .toThrowError(LetterRendererError);
  });

  it("rejects a renderer/profile mismatch", () => {
    const wrong = { ...profile(blocks), renderer_type: "overlay" as const };
    expect(() => resolveLetterBlocks(wrong, data)).toThrowError(LetterRendererError);
  });
});
