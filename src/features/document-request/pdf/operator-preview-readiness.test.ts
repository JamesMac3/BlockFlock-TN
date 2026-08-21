import { describe, expect, it } from "vitest";
import { evaluateOperatorPreviewReadiness } from "./operator-preview-readiness";

const draftProfileRow = {
  id: "20000000-0000-4000-8000-000000000002",
  government_entity_id: 4,
  version: 1,
  schema_version: 1,
  status: "draft",
  effective_from: null,
  effective_to: null,
  policy_source_url: "https://example.test/policy",
  archived_policy_object_id: null,
  policy_summary: null,
  eligibility_mode: "unknown",
  eligibility_jurisdiction: null,
  eligibility_explanation: null,
  form_mode: "unknown",
  form_explanation: null,
  fee_rule: null,
  aggregation_rule: null,
  submission_instructions: null,
  template_family: "tennessee_model",
  renderer_type: "generated_letter",
  base_pdf_object_id: null,
  continuation_profile_id: null,
  field_schema: { schema_version: 1, renderer_type: "generated_letter", fields: [] },
  template_schema: {
    schema_version: 1,
    blocks: [{ id: "body", type: "paragraph", text: "{{request.records_description}}", locked: true }],
  },
  validation_schema: { schema_version: 1, required_paths: [], rules: [], scope_warnings: { broad_mode_confirmation: false } },
  output_options: {
    schema_version: 1,
    flatten_acroform: false,
    preserve_source_metadata: false,
    pdf_title_pattern: "Request",
    filename_pattern: "request.pdf",
    page_size: "LETTER",
    margin_points: 72,
    default_font_key: "body",
    minimum_font_size: 8,
    show_page_numbers: true,
    allow_continuation: false,
  },
  verified_by: null,
  verified_at: null,
};

const entityRow = {
  id: 4,
  legal_name: "City of Murfreesboro",
  display_name: "City of Murfreesboro",
};

const goal = {
  id: 1,
  title: "City Contract Register",
  public_summary: "Track every contract the city has signed with surveillance vendors.",
  locked: false,
  government_entity_id: 4,
  request_profile_id: draftProfileRow.id,
  fill_payload: {
    request: {
      records_description: "All executed contracts and amendments with the selected vendor.",
      delivery_method: "electronic",
    },
  },
};

describe("evaluateOperatorPreviewReadiness", () => {
  it("is ready for a draft profile — this is the entire point of the operator preview path", () => {
    const result = evaluateOperatorPreviewReadiness({ goal, profileRow: draftProfileRow, entityRow });
    expect(result.ready).toBe(true);
    if (result.ready) {
      expect(result.profile.status).toBe("draft");
      expect(result.data.request.records_description).toBe(goal.fill_payload.request.records_description);
    }
  });

  it("is also ready for a profile outside its effective dates (irrelevant to a draft preview)", () => {
    const result = evaluateOperatorPreviewReadiness({
      goal,
      profileRow: { ...draftProfileRow, effective_from: "2099-01-01" },
      entityRow,
    });
    expect(result.ready).toBe(true);
  });

  it.each(["in_review", "verified", "retired"] as const)(
    "rejects a %s profile — only status === 'draft' is available through the operator preview path",
    (status) => {
      const result = evaluateOperatorPreviewReadiness({
        goal,
        profileRow: {
          ...draftProfileRow,
          status,
          // Verified profiles require verifier metadata for structural
          // validation; populated here so this exercises the draft-status
          // gate specifically, not an unrelated structural failure.
          verified_by: status === "verified" ? "40000000-0000-4000-8000-000000000004" : null,
          verified_at: status === "verified" ? "2026-08-01T12:00:00Z" : null,
        },
        entityRow,
      });
      expect(result.ready).toBe(false);
      if (!result.ready) expect(result.code).toBe("PROFILE_NOT_DRAFT");
    },
  );

  it("rejects a locked goal — preview never makes a locked goal generator-ready", () => {
    const result = evaluateOperatorPreviewReadiness({ goal: { ...goal, locked: true }, profileRow: draftProfileRow, entityRow });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("LOCKED");
  });

  it("rejects a goal with no linked profile", () => {
    const result = evaluateOperatorPreviewReadiness({
      goal: { ...goal, request_profile_id: null },
      profileRow: null,
      entityRow: null,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("MISSING_PROFILE_ID");
  });

  it("rejects when the bundle's profile row is missing", () => {
    const result = evaluateOperatorPreviewReadiness({ goal, profileRow: null, entityRow });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("PROFILE_NOT_AVAILABLE");
  });

  it("rejects when the bundle's entity row is missing", () => {
    const result = evaluateOperatorPreviewReadiness({ goal, profileRow: draftProfileRow, entityRow: null });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("ENTITY_NOT_AVAILABLE");
  });

  it("enforces goal/profile/entity relationship: mismatched entity is rejected", () => {
    const result = evaluateOperatorPreviewReadiness({
      goal: { ...goal, government_entity_id: 5 },
      profileRow: draftProfileRow,
      entityRow: { ...entityRow, id: 5 },
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("ENTITY_MISMATCH");
  });

  it("rejects an overlay profile that declares a continuation profile", () => {
    const overlayProfile = {
      ...draftProfileRow,
      renderer_type: "overlay",
      base_pdf_object_id: "30000000-0000-4000-8000-000000000003",
      continuation_profile_id: "70000000-0000-4000-8000-000000000007",
      field_schema: {
        schema_version: 1,
        renderer_type: "overlay",
        fields: [
          { source: "request.records_description", page: 0, x: 0, y: 0, width: 100, height: 100, font_key: "body", font_size: 10, line_height: 12, max_lines: 5, required: true, overflow: "continuation", continuation_label: "See attached." },
        ],
      },
    };
    const result = evaluateOperatorPreviewReadiness({ goal, profileRow: overlayProfile, entityRow });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("CONTINUATION_NOT_SUPPORTED");
  });

  it("rejects a goal payload missing the required delivery method", () => {
    const result = evaluateOperatorPreviewReadiness({
      goal: { ...goal, fill_payload: { request: { records_description: "Contracts and amendments." } } },
      profileRow: draftProfileRow,
      entityRow,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("MISSING_DELIVERY_METHOD");
  });

  it("blocks on a broad-scope-unresolved profile configuration, same as the public path", () => {
    const result = evaluateOperatorPreviewReadiness({
      goal,
      profileRow: { ...draftProfileRow, validation_schema: { ...draftProfileRow.validation_schema, scope_warnings: { broad_mode_confirmation: true } } },
      entityRow,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("BROAD_SCOPE_UNRESOLVED");
  });

  it("uses the real fill_payload verbatim, never substituting public_summary", () => {
    const result = evaluateOperatorPreviewReadiness({
      goal: { ...goal, public_summary: "A different investigative purpose, not request language." },
      profileRow: draftProfileRow,
      entityRow,
    });
    expect(result.ready).toBe(true);
    if (result.ready) {
      expect(result.data.request.records_description).toBe(goal.fill_payload.request.records_description);
      expect(result.data.request.records_description).not.toContain("investigative purpose");
    }
  });
});
