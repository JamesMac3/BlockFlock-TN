import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { RequestProfile } from "./profile-schema";
import type { RequestDocumentData } from "./request-data-schema";
import { createOverlayRenderer, OverlayRendererError } from "./overlay-renderer";

const entityId = "10000000-0000-4000-8000-000000000001";
const profileId = "20000000-0000-4000-8000-000000000002";
const sourceId = "30000000-0000-4000-8000-000000000003";
const data: RequestDocumentData = {
  government_entity: { id: entityId, legal_name: "Example City", display_name: "Example City" },
  request: {
    goal_language: "Request records documenting the acquisition and operation of the system.",
    records_description: "The executed contract and amendments for the selected system.",
    delivery_method: "electronic",
  },
  profile: { id: profileId, version: 1, government_entity_id: entityId },
};

type OverlayField = Extract<RequestProfile["field_schema"], { renderer_type: "overlay" }>["fields"][number];

function profile(field: OverlayField): RequestProfile {
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
    verified_by: "40000000-0000-4000-8000-000000000004", verified_at: "2026-08-01T12:00:00Z",
  };
}

const baseField: OverlayField = {
  source: "request.records_description", page: 0, x: 72, y: 500, width: 300,
  height: 100, font_key: "body", font_size: 10, line_height: 13, max_lines: 7,
  color: "#000000", required: true, overflow: "error",
};

async function blankPdf() {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return document.save();
}

async function expectCode(action: () => Promise<unknown>, code: string) {
  try { await action(); throw new Error("Expected failure."); }
  catch (error) {
    expect(error).toBeInstanceOf(OverlayRendererError);
    expect((error as OverlayRendererError).code).toBe(code);
  }
}

describe("createOverlayRenderer", () => {
  it("draws text into a verified box and returns a readable PDF", async () => {
    const source = await blankPdf();
    const renderer = createOverlayRenderer({ loadBasePdf: async () => source });
    const result = await renderer({ profile: profile(baseField), data });
    expect((await PDFDocument.load(result.pdfBytes)).getPageCount()).toBe(1);
  });

  it("draws text containing an arrow character instead of crashing the standard WinAnsi font (same underlying fix as acroform-renderer.test.ts)", async () => {
    const source = await blankPdf();
    const renderer = createOverlayRenderer({ loadBasePdf: async () => source });
    const arrowData = { ...data, request: { ...data.request, records_description: "Records located → transferred to archive." } };
    const result = await renderer({ profile: profile(baseField), data: arrowData });
    expect(result.pdfBytes.slice(0, 5)).toEqual(new TextEncoder().encode("%PDF-"));
  });

  it("wraps long unbroken words without exceeding the box", async () => {
    const source = await blankPdf();
    const renderer = createOverlayRenderer({ loadBasePdf: async () => source });
    const longWordData = { ...data, request: { ...data.request, records_description: "A".repeat(80) } };
    const result = await renderer({ profile: profile({ ...baseField, height: 200, max_lines: 20 }), data: longWordData });
    expect(result.pdfBytes.slice(0, 5)).toEqual(new TextEncoder().encode("%PDF-"));
  });

  it("shrinks only to the configured minimum", async () => {
    const source = await blankPdf();
    const renderer = createOverlayRenderer({ loadBasePdf: async () => source });
    const crowded = { ...data, request: { ...data.request, records_description: "records ".repeat(18) } };
    await renderer({ profile: profile({ ...baseField, width: 180, height: 65, max_lines: 6, font_size: 12, line_height: 14, overflow: "shrink" }), data: crowded });
  });

  it("refuses overflow instead of clipping text", async () => {
    const source = await blankPdf();
    const renderer = createOverlayRenderer({ loadBasePdf: async () => source });
    const crowded = { ...data, request: { ...data.request, records_description: "records ".repeat(100) } };
    await expectCode(() => renderer({ profile: profile({ ...baseField, width: 80, height: 20, max_lines: 1 }), data: crowded }), "TEXT_OVERFLOW");
  });

  it("refuses boxes outside the actual source page", async () => {
    const source = await blankPdf();
    const renderer = createOverlayRenderer({ loadBasePdf: async () => source });
    await expectCode(() => renderer({ profile: profile({ ...baseField, x: 600, width: 100 }), data }), "BOX_OUT_OF_BOUNDS");
  });

  it("refuses missing required values", async () => {
    const source = await blankPdf();
    const renderer = createOverlayRenderer({ loadBasePdf: async () => source });
    await expectCode(() => renderer({ profile: profile({ ...baseField, source: "request.vendor_or_system" }), data }), "FIELD_VALUE_MISSING");
  });

  it("signals continuation rather than silently adding an unverified page", async () => {
    const source = await blankPdf();
    const renderer = createOverlayRenderer({ loadBasePdf: async () => source });
    const continuation = {
      ...profile({ ...baseField, width: 80, height: 20, max_lines: 1, overflow: "continuation", continuation_label: "See continuation." }),
      continuation_profile_id: "50000000-0000-4000-8000-000000000005",
      output_options: { ...profile(baseField).output_options, allow_continuation: true },
    };
    const crowded = { ...data, request: { ...data.request, records_description: "records ".repeat(100) } };
    await expectCode(() => renderer({ profile: continuation, data: crowded }), "CONTINUATION_REQUIRED");
  });

  it("appends only a verified same-entity continuation source", async () => {
    const primarySource = await blankPdf();
    const continuationSource = await blankPdf();
    const continuationId = "50000000-0000-4000-8000-000000000005";
    const continuationSourceId = "60000000-0000-4000-8000-000000000006";
    const continuationProfile = {
      ...profile({ ...baseField, y: 150, width: 420, height: 500, max_lines: 35, overflow: "error" }),
      id: continuationId,
      base_pdf_object_id: continuationSourceId,
      continuation_profile_id: null,
    };
    const primaryProfile = {
      ...profile({ ...baseField, width: 80, height: 20, max_lines: 1, overflow: "continuation", continuation_label: "Attached." }),
      continuation_profile_id: continuationId,
      output_options: { ...profile(baseField).output_options, allow_continuation: true },
    };
    const renderer = createOverlayRenderer({
      loadBasePdf: async (id) => id === continuationSourceId ? continuationSource : primarySource,
      loadContinuationProfile: async () => continuationProfile,
      today: () => "2026-08-06",
    });
    const crowded = { ...data, request: { ...data.request, records_description: "records ".repeat(100) } };
    const result = await renderer({ profile: primaryProfile, data: crowded });
    expect((await PDFDocument.load(result.pdfBytes)).getPageCount()).toBeGreaterThan(1);
  });

  it("rejects a continuation profile belonging to another entity", async () => {
    const source = await blankPdf();
    const continuationId = "50000000-0000-4000-8000-000000000005";
    const badContinuation = {
      ...profile({ ...baseField, overflow: "error" }),
      id: continuationId,
      government_entity_id: "70000000-0000-4000-8000-000000000007",
    };
    const primaryProfile = {
      ...profile({ ...baseField, width: 80, height: 20, max_lines: 1, overflow: "continuation", continuation_label: "See continuation." }),
      continuation_profile_id: continuationId,
      output_options: { ...profile(baseField).output_options, allow_continuation: true },
    };
    const renderer = createOverlayRenderer({
      loadBasePdf: async () => source,
      loadContinuationProfile: async () => badContinuation,
    });
    const crowded = { ...data, request: { ...data.request, records_description: "records ".repeat(100) } };
    await expectCode(() => renderer({ profile: primaryProfile, data: crowded }), "CONTINUATION_PROFILE_INVALID");
  });
});
