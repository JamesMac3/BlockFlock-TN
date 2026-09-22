import { describe, expect, it } from "vitest";
import {
  requestProfileSchema,
  pdfRequestProfileSchema,
  onlinePortalFieldSchema,
  onlinePortalTemplateSchema,
  onlinePortalValidationSchema,
  onlinePortalOutputOptionsSchema,
  onlinePortalUrlSchema,
} from "./profile-schema";

/**
 * The online_portal literal shapes below must byte-for-byte match what
 * rrg_validate_online_portal_profile (supabase/migrations/20260922170741_online_portal_request_profiles.sql)
 * compares against with `is distinct from` — these are not independently
 * chosen frontend defaults. Any drift here means the RPC will reject a
 * profile our own UI believes is valid, or (worse) our UI will accept
 * something the database silently rejects.
 */

const entityId = "10000000000";
const profileId = "20000000-0000-4000-8000-000000000002";

function baseOnlinePortalProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: profileId,
    government_entity_id: entityId,
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
    form_mode: "portal_only",
    form_explanation: null,
    fee_rule: null,
    aggregation_rule: null,
    submission_instructions: null,
    template_family: "online_portal",
    renderer_type: "online_portal",
    base_pdf_object_id: null,
    continuation_profile_id: null,
    field_schema: { schema_version: 1, renderer_type: "online_portal", fields: [] },
    template_schema: { schema_version: 1, portal_url: "https://records.example.org/requests/new", request_text: "" },
    validation_schema: { schema_version: 1, required_paths: [], rules: [], scope_warnings: [], broad_mode_confirmation: false },
    output_options: { schema_version: 1 },
    verified_by: null,
    verified_at: null,
    ...overrides,
  };
}

describe("onlinePortalFieldSchema: matches rrg_validate_online_portal_profile's literal jsonb comparison exactly", () => {
  it("accepts the exact required shape", () => {
    expect(onlinePortalFieldSchema.safeParse({ schema_version: 1, renderer_type: "online_portal", fields: [] }).success).toBe(true);
  });

  it("rejects any non-empty fields array", () => {
    expect(onlinePortalFieldSchema.safeParse({ schema_version: 1, renderer_type: "online_portal", fields: [{}] }).success).toBe(false);
  });

  it("rejects an unexpected extra key (strict)", () => {
    expect(onlinePortalFieldSchema.safeParse({ schema_version: 1, renderer_type: "online_portal", fields: [], extra: true }).success).toBe(false);
  });
});

describe("onlinePortalValidationSchema: the DB trigger requires scope_warnings as an EMPTY ARRAY and broad_mode_confirmation as a sibling key — not the PDF shape", () => {
  it("accepts the exact required shape", () => {
    const result = onlinePortalValidationSchema.safeParse({
      schema_version: 1, required_paths: [], rules: [], scope_warnings: [], broad_mode_confirmation: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects the PDF-shaped validation_schema (scope_warnings as an object)", () => {
    const result = onlinePortalValidationSchema.safeParse({
      schema_version: 1, required_paths: [], rules: [], scope_warnings: { broad_mode_confirmation: false },
    });
    expect(result.success).toBe(false);
  });

  it("rejects broad_mode_confirmation: true (the DB trigger requires exactly false)", () => {
    const result = onlinePortalValidationSchema.safeParse({
      schema_version: 1, required_paths: [], rules: [], scope_warnings: [], broad_mode_confirmation: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-empty required_paths or rules array", () => {
    expect(onlinePortalValidationSchema.safeParse({
      schema_version: 1, required_paths: ["request.records_description"], rules: [], scope_warnings: [], broad_mode_confirmation: false,
    }).success).toBe(false);
  });
});

describe("onlinePortalOutputOptionsSchema: must be exactly { schema_version: 1 }, none of the PDF output fields", () => {
  it("accepts the bare shape", () => {
    expect(onlinePortalOutputOptionsSchema.safeParse({ schema_version: 1 }).success).toBe(true);
  });

  it("rejects any PDF output_options field (strict — extra keys are the DB trigger's `is distinct from` failure mode)", () => {
    expect(onlinePortalOutputOptionsSchema.safeParse({ schema_version: 1, page_size: "LETTER" }).success).toBe(false);
  });
});

describe("onlinePortalTemplateSchema / onlinePortalUrlSchema: HTTPS-only portal URL, no credentials/spaces, <=2048 chars; request_text <=12000 chars", () => {
  it("accepts a plain HTTPS URL", () => {
    expect(onlinePortalUrlSchema.safeParse("https://records.example.org/requests/new").success).toBe(true);
  });

  it("rejects a non-HTTPS URL", () => {
    expect(onlinePortalUrlSchema.safeParse("http://records.example.org/requests/new").success).toBe(false);
  });

  it("rejects a URL with embedded credentials", () => {
    expect(onlinePortalUrlSchema.safeParse("https://user:pass@records.example.org/new").success).toBe(false);
  });

  it("rejects a URL containing whitespace", () => {
    expect(onlinePortalUrlSchema.safeParse("https://records.example.org/new form").success).toBe(false);
  });

  it("rejects a URL containing a backslash", () => {
    expect(onlinePortalUrlSchema.safeParse("https://records.example.org/new\\form").success).toBe(false);
  });

  it("rejects a URL over 2048 characters", () => {
    const longPath = "a".repeat(2048);
    expect(onlinePortalUrlSchema.safeParse(`https://records.example.org/${longPath}`).success).toBe(false);
  });

  it("rejects request_text over 12000 characters", () => {
    const result = onlinePortalTemplateSchema.safeParse({
      schema_version: 1, portal_url: "https://records.example.org/new", request_text: "a".repeat(12_001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts request_text at exactly the 12000-character limit", () => {
    const result = onlinePortalTemplateSchema.safeParse({
      schema_version: 1, portal_url: "https://records.example.org/new", request_text: "a".repeat(12_000),
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty request_text (the default is optional)", () => {
    const result = onlinePortalTemplateSchema.safeParse({
      schema_version: 1, portal_url: "https://records.example.org/new", request_text: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unexpected extra key like blocks (strict — the DB trigger explicitly rejects anything beyond schema_version/portal_url/request_text)", () => {
    const result = onlinePortalTemplateSchema.safeParse({
      schema_version: 1, portal_url: "https://records.example.org/new", request_text: "", blocks: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("requestProfileSchema: the online_portal branch of the union", () => {
  it("accepts a fully-formed online_portal profile", () => {
    const result = requestProfileSchema.safeParse(baseOnlinePortalProfile());
    expect(result.success).toBe(true);
  });

  it("still accepts an existing PDF profile shape (the pdf branch of the union is unaffected)", () => {
    const pdfProfile = {
      id: profileId, government_entity_id: entityId, version: 1, schema_version: 1, status: "verified",
      effective_from: null, effective_to: null, policy_source_url: "https://example.test/policy",
      archived_policy_object_id: null, policy_summary: null, eligibility_mode: "unknown",
      eligibility_jurisdiction: null, eligibility_explanation: null, form_mode: "not_required",
      form_explanation: null, fee_rule: null, aggregation_rule: null, submission_instructions: null,
      template_family: "tennessee_model", renderer_type: "generated_letter", base_pdf_object_id: null,
      continuation_profile_id: null, field_schema: { schema_version: 1, renderer_type: "generated_letter", fields: [] },
      template_schema: { schema_version: 1, blocks: [{ id: "body", type: "paragraph", text: "Records", locked: true }] },
      validation_schema: { schema_version: 1, required_paths: [], rules: [], scope_warnings: { broad_mode_confirmation: true } },
      output_options: { schema_version: 1, flatten_acroform: false, preserve_source_metadata: false, pdf_title_pattern: "Request", filename_pattern: "request.pdf", page_size: "LETTER", margin_points: 72, default_font_key: "body", minimum_font_size: 8, show_page_numbers: true, allow_continuation: false },
      verified_by: "40000000-0000-4000-8000-000000000004", verified_at: "2026-08-01T12:00:00Z",
    };
    expect(requestProfileSchema.safeParse(pdfProfile).success).toBe(true);
    expect(pdfRequestProfileSchema.safeParse(pdfProfile).success).toBe(true);
  });

  it("rejects an online_portal profile that also carries a base_pdf_object_id", () => {
    const result = requestProfileSchema.safeParse(baseOnlinePortalProfile({ base_pdf_object_id: "30000000-0000-4000-8000-000000000003" }));
    expect(result.success).toBe(false);
  });

  it("rejects an online_portal profile with a mismatched template_family/renderer_type pair", () => {
    const result = requestProfileSchema.safeParse(baseOnlinePortalProfile({ template_family: "tennessee_model" }));
    expect(result.success).toBe(false);
  });

  it("rejects a verified online_portal profile missing verifier metadata (same invariant as PDF profiles)", () => {
    const result = requestProfileSchema.safeParse(baseOnlinePortalProfile({ status: "verified" }));
    expect(result.success).toBe(false);
  });

  it("accepts a verified online_portal profile with verifier metadata present", () => {
    const result = requestProfileSchema.safeParse(baseOnlinePortalProfile({
      status: "verified", verified_by: "40000000-0000-4000-8000-000000000004", verified_at: "2026-08-01T12:00:00Z",
    }));
    expect(result.success).toBe(true);
  });

  it("rejects an inverted effective date range, same as PDF profiles", () => {
    const result = requestProfileSchema.safeParse(baseOnlinePortalProfile({
      effective_from: "2026-06-01", effective_to: "2026-01-01",
    }));
    expect(result.success).toBe(false);
  });
});
