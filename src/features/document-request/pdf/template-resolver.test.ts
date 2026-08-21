import { describe, expect, it, vi } from "vitest";
import type { RequestProfile } from "./profile-schema";
import type { RequestDocumentData } from "./request-data-schema";
import {
  resolveAndRenderTemplate,
  TemplateResolverError,
  type PdfRenderer,
  type RendererRegistry,
} from "./template-resolver";

const entityId = "10000000-0000-4000-8000-000000000001";
const profileId = "20000000-0000-4000-8000-000000000002";
const basePdfId = "30000000-0000-4000-8000-000000000003";
const verifierId = "40000000-0000-4000-8000-000000000004";
const pdfBytes = new TextEncoder().encode("%PDF-1.7 test");
type SharedProfile = Omit<
  RequestProfile,
  "template_family" | "renderer_type" | "base_pdf_object_id" | "field_schema" | "template_schema"
>;

const requestData: RequestDocumentData = {
  government_entity: {
    id: entityId,
    legal_name: "Example City",
    display_name: "Example City",
  },
  request: {
    goal_language: "Request records documenting the acquisition and operation of the system.",
    records_description: "The executed contract and amendments for the selected system.",
    delivery_method: "electronic",
  },
  profile: { id: profileId, version: 1, government_entity_id: entityId },
};

const sharedProfile: SharedProfile = {
  id: profileId,
  government_entity_id: entityId,
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
  continuation_profile_id: null,
  validation_schema: {
    schema_version: 1,
    required_paths: [],
    rules: [],
    scope_warnings: { broad_mode_confirmation: true },
  },
  output_options: {
    schema_version: 1,
    flatten_acroform: false,
    preserve_source_metadata: false,
    pdf_title_pattern: "Request - {{government_entity.display_name}}",
    filename_pattern: "records-request.pdf",
    page_size: "LETTER",
    margin_points: 72,
    default_font_key: "body",
    minimum_font_size: 8,
    show_page_numbers: true,
    allow_continuation: false,
  },
  verified_by: verifierId,
  verified_at: "2026-08-01T12:00:00Z",
};

function profileFor(rendererType: "acroform" | "overlay" | "generated_letter"): RequestProfile {
  if (rendererType === "generated_letter") {
    return {
      ...sharedProfile,
      template_family: "tennessee_model",
      renderer_type: rendererType,
      base_pdf_object_id: null,
      field_schema: { schema_version: 1, renderer_type: rendererType, fields: [] },
      template_schema: {
        schema_version: 1,
        document_title: "Records request",
        blocks: [{
          id: "body",
          type: "paragraph",
          text: "{{request.records_description}}",
          locked: false,
        }],
      },
    };
  }
  return {
    ...sharedProfile,
    template_family: "municipal_form",
    renderer_type: rendererType,
    base_pdf_object_id: basePdfId,
    field_schema: rendererType === "acroform"
      ? { schema_version: 1, renderer_type: rendererType, fields: [] }
      : { schema_version: 1, renderer_type: rendererType, fields: [] },
    template_schema: { schema_version: 1, blocks: [] },
  };
}

function registry(overrides: Partial<RendererRegistry> = {}) {
  const successful = (): PdfRenderer => vi.fn(async () => ({ pdfBytes, warnings: [], diagnostics: [] }));
  return {
    acroform: successful(),
    overlay: successful(),
    generated_letter: successful(),
    ...overrides,
  } satisfies RendererRegistry;
}

async function expectCode(action: () => Promise<unknown>, code: string) {
  try {
    await action();
    throw new Error("Expected template resolution to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(TemplateResolverError);
    expect((error as TemplateResolverError).code).toBe(code);
  }
}

describe("resolveAndRenderTemplate", () => {
  it.each(["acroform", "overlay", "generated_letter"] as const)(
    "dispatches only to the declared %s renderer",
    async (type) => {
      const renderers = registry();
      await resolveAndRenderTemplate(profileFor(type), requestData, renderers, { today: "2026-08-05" });
      expect(renderers[type]).toHaveBeenCalledOnce();
      for (const other of ["acroform", "overlay", "generated_letter"] as const) {
        if (other !== type) expect(renderers[other]).not.toHaveBeenCalled();
      }
    },
  );

  it("rejects structurally invalid profiles before dispatch", async () => {
    const renderers = registry();
    await expectCode(
      () => resolveAndRenderTemplate({ ...profileFor("acroform"), base_pdf_object_id: null }, requestData, renderers),
      "INVALID_PROFILE",
    );
    expect(renderers.acroform).not.toHaveBeenCalled();
  });

  it("rejects invalid request data before dispatch", async () => {
    await expectCode(
      () => resolveAndRenderTemplate(profileFor("generated_letter"), { ...requestData, request: {} }, registry()),
      "INVALID_REQUEST_DATA",
    );
  });

  it("rejects draft profiles", async () => {
    await expectCode(
      () => resolveAndRenderTemplate({ ...profileFor("generated_letter"), status: "draft" }, requestData, registry()),
      "PROFILE_NOT_VERIFIED",
    );
  });

  it.each([
    ["2025-12-31", "2026-01-01", null],
    ["2026-09-01", "2025-01-01", "2026-08-31"],
  ])("rejects a profile outside its effective dates", async (today, from, to) => {
    await expectCode(
      () => resolveAndRenderTemplate(
        { ...profileFor("generated_letter"), effective_from: from, effective_to: to },
        requestData,
        registry(),
        { today },
      ),
      "PROFILE_NOT_EFFECTIVE",
    );
  });

  describe("allowDraftProfile (authorized operator preview only)", () => {
    it("still rejects a draft profile by default (public path unaffected)", async () => {
      await expectCode(
        () => resolveAndRenderTemplate({ ...profileFor("generated_letter"), status: "draft" }, requestData, registry()),
        "PROFILE_NOT_VERIFIED",
      );
    });

    it("renders a draft profile when allowDraftProfile is explicitly set", async () => {
      const renderers = registry();
      const result = await resolveAndRenderTemplate(
        { ...profileFor("generated_letter"), status: "draft" },
        requestData,
        renderers,
        { allowDraftProfile: true },
      );
      expect(result.pdfBytes.length).toBeGreaterThan(0);
      expect(renderers.generated_letter).toHaveBeenCalledOnce();
    });

    it("ignores effective dates for a draft profile when allowDraftProfile is set (drafts have no effective window that matters yet)", async () => {
      const result = await resolveAndRenderTemplate(
        { ...profileFor("generated_letter"), status: "draft", effective_from: "2027-01-01" },
        requestData,
        registry(),
        { allowDraftProfile: true, today: "2026-01-01" },
      );
      expect(result.pdfBytes.length).toBeGreaterThan(0);
    });

    it.each(["in_review", "verified", "retired"] as const)(
      "rejects a %s profile even when allowDraftProfile is set — only status === 'draft' is previewable",
      async (status) => {
        await expectCode(
          () => resolveAndRenderTemplate(
            { ...profileFor("generated_letter"), status },
            requestData,
            registry(),
            { allowDraftProfile: true },
          ),
          "PROFILE_NOT_DRAFT",
        );
      },
    );

    it("still enforces every other check (structural validation, identity match, template preflight) with the bypass set", async () => {
      await expectCode(
        () => resolveAndRenderTemplate(
          { ...profileFor("acroform"), status: "draft", base_pdf_object_id: null },
          requestData,
          registry(),
          { allowDraftProfile: true },
        ),
        "INVALID_PROFILE",
      );

      await expectCode(
        () => resolveAndRenderTemplate(
          { ...profileFor("generated_letter"), status: "draft" },
          { ...requestData, profile: { ...requestData.profile, id: "50000000-0000-4000-8000-000000000005" } },
          registry(),
          { allowDraftProfile: true },
        ),
        "PROFILE_REQUEST_MISMATCH",
      );
    });
  });

  it.each([
    { profile: { id: "50000000-0000-4000-8000-000000000005" } },
    { profile: { version: 2 } },
    { government_entity: { id: "60000000-0000-4000-8000-000000000006" } },
  ])("rejects profile/request identity mismatches", async (change) => {
    const changedData = {
      ...requestData,
      ...(change.profile ? { profile: { ...requestData.profile, ...change.profile } } : {}),
      ...(change.government_entity
        ? { government_entity: { ...requestData.government_entity, ...change.government_entity } }
        : {}),
    };
    await expectCode(
      () => resolveAndRenderTemplate(profileFor("generated_letter"), changedData, registry()),
      change.government_entity ? "INVALID_REQUEST_DATA" : "PROFILE_REQUEST_MISMATCH",
    );
  });

  it("rejects generated letters with no blocks", async () => {
    const profile = profileFor("generated_letter");
    profile.template_schema.blocks = [];
    await expectCode(() => resolveAndRenderTemplate(profile, requestData, registry()), "INVALID_TEMPLATE_LAYOUT");
  });

  it("rejects unknown template tokens during preflight", async () => {
    const profile = profileFor("generated_letter");
    profile.template_schema.blocks[0] = {
      id: "body",
      type: "paragraph",
      text: "{{request.__proto__}}",
      locked: false,
    };
    await expectCode(() => resolveAndRenderTemplate(profile, requestData, registry()), "TEMPLATE_PREFLIGHT_FAILED");
  });

  it("does not fall back when the selected renderer fails", async () => {
    const failed = vi.fn(async () => { throw new Error("failed"); });
    const renderers = registry({ overlay: failed });
    await expectCode(
      () => resolveAndRenderTemplate(profileFor("overlay"), requestData, renderers),
      "RENDERER_FAILED",
    );
    expect(failed).toHaveBeenCalledOnce();
    expect(renderers.acroform).not.toHaveBeenCalled();
    expect(renderers.generated_letter).not.toHaveBeenCalled();
  });

  it("rejects non-PDF renderer output", async () => {
    const invalid: PdfRenderer = vi.fn(async () => ({
      pdfBytes: new TextEncoder().encode("not a pdf"),
      warnings: [],
      diagnostics: [],
    }));
    await expectCode(
      () => resolveAndRenderTemplate(profileFor("acroform"), requestData, registry({ acroform: invalid })),
      "INVALID_RENDERER_OUTPUT",
    );
  });
});
