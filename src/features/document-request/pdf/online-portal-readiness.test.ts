import { describe, expect, it } from "vitest";
import { evaluateOnlinePortalGoalReadiness } from "./online-portal-readiness";

const entityId = 11;
const profileId = "20000000-0000-4000-8000-000000000002";

function onlinePortalProfileRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: profileId,
    government_entity_id: entityId,
    version: 1,
    schema_version: 1,
    status: "verified",
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
    template_schema: { schema_version: 1, portal_url: "https://records.example.org/requests/new", request_text: "Default text." },
    validation_schema: { schema_version: 1, required_paths: [], rules: [], scope_warnings: [], broad_mode_confirmation: false },
    output_options: { schema_version: 1 },
    verified_by: "40000000-0000-4000-8000-000000000004",
    verified_at: "2026-08-01T12:00:00Z",
    ...overrides,
  };
}

const entityRow = { id: entityId, legal_name: "Example City", display_name: "Example City" };

function goal(overrides: Partial<Record<string, unknown>> = {}) {
  return { locked: false, request_profile_id: profileId, government_entity_id: entityId, ...overrides };
}

describe("evaluateOnlinePortalGoalReadiness", () => {
  it("is ready for a verified, currently-effective, entity-matched online_portal profile", () => {
    const result = evaluateOnlinePortalGoalReadiness({ goal: goal(), profileRow: onlinePortalProfileRow(), entityRow, today: "2026-09-22" });
    expect(result.ready).toBe(true);
    if (result.ready) expect(result.profile.renderer_type).toBe("online_portal");
  });

  it("rejects a locked goal without any network-equivalent lookup", () => {
    const result = evaluateOnlinePortalGoalReadiness({ goal: goal({ locked: true }), profileRow: null, entityRow: null });
    expect(result).toEqual({ ready: false, code: "LOCKED", message: "This goal is currently locked." });
  });

  it("rejects a goal with no linked profile", () => {
    const result = evaluateOnlinePortalGoalReadiness({ goal: goal({ request_profile_id: null }), profileRow: null, entityRow: null });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("MISSING_PROFILE_ID");
  });

  it("rejects when the profile row could not be loaded", () => {
    const result = evaluateOnlinePortalGoalReadiness({ goal: goal(), profileRow: null, entityRow });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("PROFILE_NOT_AVAILABLE");
  });

  it("rejects when the entity row could not be loaded", () => {
    const result = evaluateOnlinePortalGoalReadiness({ goal: goal(), profileRow: onlinePortalProfileRow(), entityRow: null });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("ENTITY_NOT_AVAILABLE");
  });

  it("rejects a goal/profile/entity mismatch", () => {
    const result = evaluateOnlinePortalGoalReadiness({
      goal: goal({ government_entity_id: 999 }), profileRow: onlinePortalProfileRow(), entityRow,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("ENTITY_MISMATCH");
  });

  it("rejects a draft online_portal profile (public preparation requires verified)", () => {
    const result = evaluateOnlinePortalGoalReadiness({
      goal: goal(), profileRow: onlinePortalProfileRow({ status: "draft", verified_by: null, verified_at: null }), entityRow,
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("PROFILE_NOT_VERIFIED");
  });

  it("rejects a profile that is not yet effective", () => {
    const result = evaluateOnlinePortalGoalReadiness({
      goal: goal(), profileRow: onlinePortalProfileRow({ effective_from: "2099-01-01" }), entityRow, today: "2026-09-22",
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("PROFILE_NOT_EFFECTIVE");
  });

  it("rejects a profile that is no longer effective", () => {
    const result = evaluateOnlinePortalGoalReadiness({
      goal: goal(), profileRow: onlinePortalProfileRow({ effective_to: "2020-01-01" }), entityRow, today: "2026-09-22",
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("PROFILE_NOT_EFFECTIVE");
  });

  it("rejects a PDF-renderer profile linked to the goal — this module only recognizes online_portal", () => {
    const pdfProfileRow = {
      ...onlinePortalProfileRow(),
      template_family: "tennessee_model",
      renderer_type: "generated_letter",
      form_mode: "not_required",
      base_pdf_object_id: null,
      field_schema: { schema_version: 1, renderer_type: "generated_letter", fields: [] },
      template_schema: { schema_version: 1, blocks: [{ id: "body", type: "paragraph", text: "Records", locked: true }] },
      validation_schema: { schema_version: 1, required_paths: [], rules: [], scope_warnings: { broad_mode_confirmation: false } },
      output_options: {
        schema_version: 1, flatten_acroform: false, preserve_source_metadata: false, pdf_title_pattern: "Request",
        filename_pattern: "request.pdf", page_size: "LETTER", margin_points: 72, default_font_key: "body",
        minimum_font_size: 8, show_page_numbers: true, allow_continuation: false,
      },
    };
    const result = evaluateOnlinePortalGoalReadiness({ goal: goal(), profileRow: pdfProfileRow, entityRow });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("NOT_AN_ONLINE_PORTAL_PROFILE");
  });

  it("never calls buildRequestDocumentDataInput / runValidationSchema — this is intentionally a much lighter check than PDF readiness, and text precedence is left entirely to rrg_prepare_online_request", () => {
    // No delivery_method, no goal_language, and an obviously-invalid
    // request-data shape (fill_payload deliberately absent from `goal`
    // above) would fail the PDF pipeline's requestDocumentDataSchema; this
    // still succeeds because that pipeline is never invoked here.
    const result = evaluateOnlinePortalGoalReadiness({ goal: goal(), profileRow: onlinePortalProfileRow(), entityRow, today: "2026-09-22" });
    expect(result.ready).toBe(true);
  });
});
