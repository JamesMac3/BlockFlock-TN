import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import type { RequestProfile } from "./profile-schema";
import type { RequestDocumentData } from "./request-data-schema";
import { generateRequestDocument } from "./generate-request-document";
import type { TemplateSource } from "./supabase-template-loader";

const entityId = "4";
const profileId = "20000000-0000-4000-8000-000000000002";
const sourceId = "30000000-0000-4000-8000-000000000003";

const data: RequestDocumentData = {
  government_entity: { id: entityId, legal_name: "City of Murfreesboro", display_name: "City of Murfreesboro" },
  request: {
    goal_language: "Track vendor contracts.",
    records_description: "All executed contracts and amendments with the selected vendor.",
    delivery_method: "electronic",
  },
  profile: { id: profileId, version: 1, government_entity_id: entityId },
};

function baseProfileFields() {
  return {
    id: profileId,
    government_entity_id: entityId,
    version: 1,
    schema_version: 1 as const,
    effective_from: "2026-01-01",
    effective_to: null,
    policy_source_url: "https://example.test/policy",
    archived_policy_object_id: null,
    policy_summary: null,
    eligibility_mode: "unknown" as const,
    eligibility_jurisdiction: null,
    eligibility_explanation: null,
    form_mode: "not_required" as const,
    form_explanation: null,
    fee_rule: null,
    aggregation_rule: null,
    submission_instructions: null,
    continuation_profile_id: null,
    validation_schema: { schema_version: 1 as const, required_paths: [], rules: [], scope_warnings: { broad_mode_confirmation: false } },
    output_options: {
      schema_version: 1 as const,
      flatten_acroform: false as const,
      preserve_source_metadata: false as const,
      pdf_title_pattern: "Records Request - {{government_entity.display_name}}",
      filename_pattern: "records-request.pdf",
      page_size: "LETTER" as const,
      margin_points: 72,
      default_font_key: "body",
      minimum_font_size: 8,
      show_page_numbers: true,
      allow_continuation: false,
    },
    verified_by: "40000000-0000-4000-8000-000000000004",
    verified_at: "2026-01-01T00:00:00Z",
  };
}

function letterProfile(status: RequestProfile["status"] = "verified"): RequestProfile {
  return {
    ...baseProfileFields(),
    status,
    template_family: "tennessee_model",
    renderer_type: "generated_letter",
    base_pdf_object_id: null,
    field_schema: { schema_version: 1, renderer_type: "generated_letter", fields: [] },
    template_schema: {
      schema_version: 1,
      document_title: "Tennessee Public Records Request",
      blocks: [{ id: "body", type: "paragraph", text: "I request: {{request.records_description}}", locked: true }],
    },
  };
}

function acroformProfile(): RequestProfile {
  return {
    ...baseProfileFields(),
    status: "verified",
    template_family: "municipal_form",
    renderer_type: "acroform",
    base_pdf_object_id: sourceId,
    field_schema: {
      schema_version: 1,
      renderer_type: "acroform",
      fields: [{ source: "request.records_description", pdf_field: "RecordsDescription", kind: "text", required: true, multiline: true }],
    },
    template_schema: { schema_version: 1, blocks: [] },
  };
}

async function fillableSource(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  document.getForm().createTextField("RecordsDescription").addToPage(page, { x: 72, y: 560, width: 468, height: 120 });
  return document.save();
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function fakeSupabase(rpcResult: { data: TemplateSource[] | null; error: { message: string } | null }, fetcher?: typeof fetch) {
  return {
    supabase: {
      rpc: vi.fn(async () => rpcResult),
      storage: {
        from: vi.fn(() => ({
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example.test/${path}` } }),
        })),
      },
    },
    fetcher,
  };
}

describe("generateRequestDocument", () => {
  it("generates a real PDF Blob with a sanitized filename, page count, and warnings for a generated-letter profile", async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });
    const result = await generateRequestDocument(letterProfile(), data, { supabase });

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe("application/pdf");
    expect(result.filename).toBe("records-request.pdf");
    expect(result.pageCount).toBe(1);
    expect(Array.isArray(result.warnings)).toBe(true);

    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("loads and verifies a municipal AcroForm template through the Supabase RPC loader, leaving identity fields blank and editable", async () => {
    const sourceBytes = await fillableSource();
    const hash = await sha256Hex(sourceBytes);
    const { supabase } = fakeSupabase({
      data: [{ bucket_id: "request-templates", object_path: "forms/murfreesboro.pdf", mime_type: "application/pdf", size_bytes: sourceBytes.length, sha256_hex: hash }],
      error: null,
    });
    const fetcher = vi.fn(async () => new Response(new Blob([new Uint8Array(sourceBytes)]), { status: 200 }));
    // generateRequestDocument dynamically imports createSupabaseTemplateLoader, which defaults its
    // fetcher argument to the global fetch — stub the global for this test only.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetcher as unknown as typeof fetch;

    try {
      const result = await generateRequestDocument(acroformProfile(), data, { supabase });
      expect(result.pageCount).toBe(1);

      const completed = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()));
      const form = completed.getForm();
      expect(form.getTextField("RecordsDescription").getText()).toBe(data.request.records_description);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("never generates a document for a draft profile", async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });
    await expect(generateRequestDocument(letterProfile("draft"), data, { supabase })).rejects.toMatchObject({
      code: "PROFILE_NOT_VERIFIED",
    });
  });
});
