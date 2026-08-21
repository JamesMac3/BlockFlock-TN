import { describe, expect, it } from "vitest";
import { evaluateGoalReadiness } from "./readiness";
import { evaluateOperatorPreviewReadiness } from "./operator-preview-readiness";

/**
 * End-to-end proof that the same saved goal fill_payload drives two
 * distinct, independently authorized paths:
 *   - the audited operator draft preview, available only while the
 *     profile is status = 'draft';
 *   - anonymous public generation, available only once the same profile
 *     is status = 'verified' (and currently effective).
 * A profile can never be usable through both paths at once — they are
 * gated on mutually exclusive statuses — but the goal's own fill_payload
 * is never duplicated or rewritten between them.
 */

const GOAL_ID = 3;
const PROFILE_ID = "10dc495d-417d-4027-8ac4-4cb9fbd5b966";
const ENTITY_ID = 5;
const VERIFIER_ID = "40000000-0000-4000-8000-000000000004";

const goal = {
  id: GOAL_ID,
  title: "Flock Contracts and Invoice Trail",
  public_summary: "Track the city's Flock Safety camera contracts and invoices.",
  locked: false,
  government_entity_id: ENTITY_ID,
  request_profile_id: PROFILE_ID,
  fill_payload: {
    request: {
      records_description: "All Flock Safety contracts, purchase orders, and invoices.",
      record_category_label: "Contracts",
      delivery_method: "electronic",
    },
  },
};

const entityRow = { id: ENTITY_ID, legal_name: "Murfreesboro Police Department", display_name: "Murfreesboro Police Department" };

function fieldSchema() {
  return {
    schema_version: 1,
    renderer_type: "acroform",
    fields: [
      { source: "request.delivery_method", pdf_field: "Electronic Copy", kind: "checkbox", required: true, option_value: "electronic" },
      { source: "request.record_category_label", pdf_field: "Other", kind: "checkbox", required: false, option_value: "Contracts" },
      { source: "request.records_description", pdf_field: "Request Description", kind: "text", required: true, multiline: true, max_length: 12000 },
    ],
  };
}

function draftProfileRow() {
  return {
    id: PROFILE_ID,
    government_entity_id: ENTITY_ID,
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
    form_mode: "required",
    form_explanation: null,
    fee_rule: null,
    aggregation_rule: null,
    submission_instructions: null,
    template_family: "municipal_form",
    renderer_type: "acroform",
    base_pdf_object_id: "fe502656-cbb9-427f-82cd-4428ecac4318",
    continuation_profile_id: null,
    field_schema: fieldSchema(),
    template_schema: { schema_version: 1, blocks: [] },
    validation_schema: { schema_version: 1, required_paths: ["request.records_description"], rules: [], scope_warnings: { broad_mode_confirmation: false } },
    output_options: {
      schema_version: 1,
      flatten_acroform: false,
      preserve_source_metadata: false,
      pdf_title_pattern: "Records Request - {{government_entity.display_name}}",
      filename_pattern: "records-request.pdf",
      page_size: "LETTER",
      margin_points: 72,
      default_font_key: "body",
      minimum_font_size: 8,
      show_page_numbers: false,
      allow_continuation: false,
    },
    verified_by: null,
    verified_at: null,
  };
}

function verifiedProfileRow() {
  return {
    ...draftProfileRow(),
    status: "verified",
    effective_from: "2020-01-01",
    effective_to: null,
    verified_by: VERIFIER_ID,
    verified_at: "2026-01-01T00:00:00Z",
  };
}

describe("dual-path generation: the same goal drives operator preview (draft) and public generation (verified) exclusively", () => {
  it("while the profile is draft: operator preview is ready, public generation is not (PROFILE_NOT_VERIFIED, verification-unavailable message)", () => {
    const operatorResult = evaluateOperatorPreviewReadiness({ goal, profileRow: draftProfileRow(), entityRow });
    expect(operatorResult.ready).toBe(true);

    const publicResult = evaluateGoalReadiness({ goal, profileRow: draftProfileRow(), entityRow, today: "2026-06-01" });
    expect(publicResult.ready).toBe(false);
    if (!publicResult.ready) {
      expect(publicResult.code).toBe("PROFILE_NOT_VERIFIED");
      expect(publicResult.message).toBe("This request form is being verified and is not available for download yet.");
    }
  });

  it("once the same profile is verified and effective: public generation is ready, operator preview is not (PROFILE_NOT_DRAFT)", () => {
    const publicResult = evaluateGoalReadiness({ goal, profileRow: verifiedProfileRow(), entityRow, today: "2026-06-01" });
    expect(publicResult.ready).toBe(true);

    const operatorResult = evaluateOperatorPreviewReadiness({ goal, profileRow: verifiedProfileRow(), entityRow });
    expect(operatorResult.ready).toBe(false);
    if (!operatorResult.ready) {
      expect(operatorResult.code).toBe("PROFILE_NOT_DRAFT");
    }
  });

  it("both ready outcomes carry the exact same request data, sourced from the one saved goal.fill_payload", () => {
    const operatorResult = evaluateOperatorPreviewReadiness({ goal, profileRow: draftProfileRow(), entityRow });
    const publicResult = evaluateGoalReadiness({ goal, profileRow: verifiedProfileRow(), entityRow, today: "2026-06-01" });

    expect(operatorResult.ready).toBe(true);
    expect(publicResult.ready).toBe(true);
    if (operatorResult.ready && publicResult.ready) {
      expect(operatorResult.data.request).toEqual(publicResult.data.request);
      expect(operatorResult.data.request.records_description).toBe(goal.fill_payload.request.records_description);
      expect(operatorResult.data.request.goal_language).toBe(goal.public_summary);
    }
  });

  it("a profile can never be simultaneously ready for both paths — draft and verified are mutually exclusive statuses", () => {
    for (const profileRow of [draftProfileRow(), verifiedProfileRow()]) {
      const operatorResult = evaluateOperatorPreviewReadiness({ goal, profileRow, entityRow });
      const publicResult = evaluateGoalReadiness({ goal, profileRow, entityRow, today: "2026-06-01" });
      expect(operatorResult.ready && publicResult.ready).toBe(false);
    }
  });
});
