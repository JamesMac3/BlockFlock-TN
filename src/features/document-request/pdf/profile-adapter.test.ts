import { describe, expect, it } from "vitest";
import {
  adaptGovernmentEntityRow,
  adaptRequestProfileRow,
  assertSameGovernmentEntity,
  ProfileAdapterError,
} from "./profile-adapter";

// A raw live request_profiles row: government_entity_id is a bigint (here a
// JS number, as supabase-js returns it), and the row carries extra columns
// the generator does not support to prove they get dropped.
const rawProfileRow = {
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
  template_family: "municipal_form",
  renderer_type: "acroform",
  base_pdf_object_id: "30000000-0000-4000-8000-000000000003",
  continuation_profile_id: null,
  field_schema: { schema_version: 1, renderer_type: "acroform", fields: [] },
  template_schema: { schema_version: 1, blocks: [] },
  validation_schema: {
    schema_version: 1,
    required_paths: [],
    rules: [],
    scope_warnings: { broad_mode_confirmation: false },
  },
  output_options: {
    schema_version: 1,
    flatten_acroform: false,
    preserve_source_metadata: false,
    pdf_title_pattern: "x",
    filename_pattern: "x.pdf",
    page_size: "LETTER",
    margin_points: 72,
    default_font_key: "body",
    minimum_font_size: 8,
    show_page_numbers: true,
    allow_continuation: false,
  },
  verified_by: null,
  verified_at: null,
  // Live-only columns the generator does not know about.
  created_by: "40000000-0000-4000-8000-000000000009",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("adaptRequestProfileRow", () => {
  it("normalizes the live bigint government_entity_id to a string", () => {
    const adapted = adaptRequestProfileRow(rawProfileRow);
    expect(adapted.government_entity_id).toBe("4");
  });

  it("copies only the fields the generator supports", () => {
    const adapted = adaptRequestProfileRow(rawProfileRow);
    expect(adapted).not.toHaveProperty("created_by");
    expect(adapted).not.toHaveProperty("updated_at");
    expect(adapted.id).toBe(rawProfileRow.id);
    expect(adapted.renderer_type).toBe("acroform");
    expect(adapted.status).toBe("draft");
  });
});

describe("adaptGovernmentEntityRow", () => {
  it("normalizes id and drops null optional fields", () => {
    const adapted = adaptGovernmentEntityRow({
      id: 4,
      legal_name: "City of Murfreesboro",
      display_name: "City of Murfreesboro",
      coordinator_name: null,
      coordinator_title: null,
      submission_email: null,
      mailing_address: null,
      portal_url: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(adapted.id).toBe("4");
    expect(adapted).not.toHaveProperty("coordinator_name");
    expect(adapted).not.toHaveProperty("created_at");
  });

  it("keeps present optional fields", () => {
    const adapted = adaptGovernmentEntityRow({
      id: 5,
      legal_name: "Murfreesboro Police Department",
      display_name: "Murfreesboro Police Department",
      submission_email: "records@example.test",
    });
    expect(adapted.submission_email).toBe("records@example.test");
  });
});

describe("assertSameGovernmentEntity", () => {
  it("returns the normalized id when the goal, profile, and entity all match", () => {
    expect(assertSameGovernmentEntity(4, 4, "4")).toBe("4");
  });

  it("throws ENTITY_MISMATCH when the goal and profile disagree", () => {
    expect(() => assertSameGovernmentEntity(4, 5, 4)).toThrow(ProfileAdapterError);
  });

  it("throws ENTITY_MISMATCH when the entity disagrees with the profile", () => {
    try {
      assertSameGovernmentEntity(4, 4, 5);
      throw new Error("Expected assertSameGovernmentEntity to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(ProfileAdapterError);
      expect((error as ProfileAdapterError).code).toBe("ENTITY_MISMATCH");
    }
  });
});
