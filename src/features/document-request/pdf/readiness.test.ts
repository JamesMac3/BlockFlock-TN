import { describe, expect, it } from "vitest";
import { evaluateGoalReadiness } from "./readiness";

const validProfileRow = {
  id: "20000000-0000-4000-8000-000000000002",
  government_entity_id: 4,
  version: 1,
  schema_version: 1,
  status: "verified",
  effective_from: "2026-01-01",
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
  verified_by: "40000000-0000-4000-8000-000000000004",
  verified_at: "2026-01-01T00:00:00Z",
};

const validEntityRow = {
  id: 4,
  legal_name: "City of Murfreesboro",
  display_name: "City of Murfreesboro",
};

const readyGoal = {
  id: 1,
  title: "City Contract Register",
  public_summary: "Track every contract the city has signed with surveillance vendors.",
  locked: false,
  government_entity_id: 4,
  request_profile_id: validProfileRow.id,
  fill_payload: {
    request: {
      records_description: "All executed contracts and amendments with the selected vendor.",
      delivery_method: "electronic",
    },
  },
};

const today = "2026-06-01";

describe("evaluateGoalReadiness", () => {
  it("is never ready for a locked goal", () => {
    const result = evaluateGoalReadiness({
      goal: { ...readyGoal, locked: true },
      profileRow: validProfileRow,
      entityRow: validEntityRow,
      today,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("LOCKED");
  });

  it("is never ready when the goal has no linked profile", () => {
    const result = evaluateGoalReadiness({
      goal: { ...readyGoal, request_profile_id: null },
      profileRow: null,
      entityRow: null,
      today,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("MISSING_PROFILE_ID");
  });

  it("is not ready and reports the truthful notice when the profile is a draft that the public query cannot return (the live Murfreesboro state)", () => {
    // Mirrors the live database: both Murfreesboro profiles are still
    // status = 'draft', so the public verified-profile query returns no
    // row for them and profileRow is null here.
    const result = evaluateGoalReadiness({
      goal: readyGoal,
      profileRow: null,
      entityRow: validEntityRow,
      today,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.code).toBe("PROFILE_NOT_AVAILABLE");
      expect(result.message).toBe("This request form is being verified and is not available for download yet.");
    }
  });

  it("is not ready when a profile row is present but its status is not verified", () => {
    const result = evaluateGoalReadiness({
      goal: readyGoal,
      profileRow: { ...validProfileRow, status: "draft" },
      entityRow: validEntityRow,
      today,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("PROFILE_NOT_VERIFIED");
  });

  it("is not ready when the profile is not currently effective", () => {
    const result = evaluateGoalReadiness({
      goal: readyGoal,
      profileRow: { ...validProfileRow, effective_from: "2027-01-01" },
      entityRow: validEntityRow,
      today,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("PROFILE_NOT_EFFECTIVE");
  });

  it("is not ready when the goal's entity does not match the profile's entity", () => {
    const result = evaluateGoalReadiness({
      goal: { ...readyGoal, government_entity_id: 5 },
      profileRow: validProfileRow,
      entityRow: { ...validEntityRow, id: 5 },
      today,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("ENTITY_MISMATCH");
  });

  it("is not ready when the approved payload has no delivery method", () => {
    const result = evaluateGoalReadiness({
      goal: { ...readyGoal, fill_payload: { request: { records_description: "Contracts." } } },
      profileRow: validProfileRow,
      entityRow: validEntityRow,
      today,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("MISSING_DELIVERY_METHOD");
  });

  it("is not ready when runtime validation reports a blocking error", () => {
    const result = evaluateGoalReadiness({
      goal: readyGoal,
      profileRow: {
        ...validProfileRow,
        validation_schema: {
          schema_version: 1,
          required_paths: ["request.department_or_division"],
          rules: [],
          scope_warnings: { broad_mode_confirmation: false },
        },
      },
      entityRow: validEntityRow,
      today,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("VALIDATION_FAILED");
  });

  it("is ready when every stored precondition holds, and never enables merely because a profile UUID exists", () => {
    const result = evaluateGoalReadiness({
      goal: readyGoal,
      profileRow: validProfileRow,
      entityRow: validEntityRow,
      today,
    });
    expect(result.ready).toBe(true);
    if (result.ready) {
      expect(result.profile.status).toBe("verified");
      expect(result.data.request.records_description).toBe(readyGoal.fill_payload.request.records_description);
      expect(result.data.government_entity.id).toBe("4");
    }
  });

  it("never throws for a malformed row — one bad row reports not-ready instead of aborting the caller's batch", () => {
    const malformedProfileRow = { ...validProfileRow, government_entity_id: "not-a-bigint" };
    expect(() =>
      evaluateGoalReadiness({ goal: readyGoal, profileRow: malformedProfileRow, entityRow: validEntityRow, today })
    ).not.toThrow();

    const result = evaluateGoalReadiness({
      goal: readyGoal,
      profileRow: malformedProfileRow,
      entityRow: validEntityRow,
      today,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("INVALID_ENTITY_ID");
  });

  it("never throws for a malformed entity row either", () => {
    const malformedEntityRow = { ...validEntityRow, id: -1 };
    expect(() =>
      evaluateGoalReadiness({ goal: readyGoal, profileRow: validProfileRow, entityRow: malformedEntityRow, today })
    ).not.toThrow();
  });

  it("is not ready for an overlay profile that declares a continuation profile — no continuation loader is wired yet", () => {
    const overlayProfile = {
      ...validProfileRow,
      template_family: "municipal_form",
      renderer_type: "overlay",
      base_pdf_object_id: "30000000-0000-4000-8000-000000000003",
      continuation_profile_id: "50000000-0000-4000-8000-000000000005",
      field_schema: {
        schema_version: 1,
        renderer_type: "overlay",
        fields: [
          {
            source: "request.records_description",
            page: 0,
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            font_key: "body",
            font_size: 10,
            line_height: 12,
            max_lines: 5,
            required: true,
            overflow: "continuation",
            continuation_label: "See attached continuation.",
          },
        ],
      },
    };
    const result = evaluateGoalReadiness({ goal: readyGoal, profileRow: overlayProfile, entityRow: validEntityRow, today });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("CONTINUATION_NOT_SUPPORTED");
  });

  it("is ready for an overlay profile with no continuation profile declared", () => {
    const overlayProfile = {
      ...validProfileRow,
      template_family: "municipal_form",
      renderer_type: "overlay",
      base_pdf_object_id: "30000000-0000-4000-8000-000000000003",
      continuation_profile_id: null,
      field_schema: {
        schema_version: 1,
        renderer_type: "overlay",
        fields: [
          {
            source: "request.records_description",
            page: 0,
            x: 0,
            y: 0,
            width: 400,
            height: 400,
            font_key: "body",
            font_size: 10,
            line_height: 12,
            max_lines: 30,
            required: true,
            overflow: "error",
          },
        ],
      },
    };
    const result = evaluateGoalReadiness({ goal: readyGoal, profileRow: overlayProfile, entityRow: validEntityRow, today });
    expect(result.ready).toBe(true);
  });

  it("is not ready when broad-scope confirmation is required and unresolved — the site has no input to collect it", () => {
    const result = evaluateGoalReadiness({
      goal: readyGoal,
      profileRow: {
        ...validProfileRow,
        validation_schema: {
          schema_version: 1,
          required_paths: [],
          rules: [],
          scope_warnings: { broad_mode_confirmation: true },
        },
      },
      entityRow: validEntityRow,
      today,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("BROAD_SCOPE_UNRESOLVED");
  });

  it("is ready when broad-scope confirmation is required but a date range narrows the request", () => {
    const result = evaluateGoalReadiness({
      goal: {
        ...readyGoal,
        fill_payload: {
          request: {
            records_description: readyGoal.fill_payload.request.records_description,
            delivery_method: "electronic",
            date_from_mm_dd_yyyy: "01/01/2026",
            date_to_mm_dd_yyyy: "02/01/2026",
          },
        },
      },
      profileRow: {
        ...validProfileRow,
        validation_schema: {
          schema_version: 1,
          required_paths: [],
          rules: [],
          scope_warnings: { broad_mode_confirmation: true },
        },
      },
      entityRow: validEntityRow,
      today,
    });
    expect(result.ready).toBe(true);
  });
});
