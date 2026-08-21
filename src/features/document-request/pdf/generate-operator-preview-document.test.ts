import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import type { RequestProfile } from "./profile-schema";
import type { RequestDocumentData } from "./request-data-schema";
import type { TemplateSource } from "./supabase-template-loader";
import { generateOperatorPreviewDocument } from "./generate-operator-preview-document";

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

function draftAcroformProfile(): RequestProfile {
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
    form_mode: "required",
    form_explanation: null,
    fee_rule: null,
    aggregation_rule: null,
    submission_instructions: null,
    template_family: "municipal_form",
    renderer_type: "acroform",
    base_pdf_object_id: sourceId,
    continuation_profile_id: null,
    field_schema: {
      schema_version: 1,
      renderer_type: "acroform",
      fields: [
        { source: "request.records_description", pdf_field: "RecordsDescription", kind: "text", required: true, multiline: true },
      ],
    },
    template_schema: { schema_version: 1, blocks: [] },
    validation_schema: { schema_version: 1, required_paths: [], rules: [], scope_warnings: { broad_mode_confirmation: false } },
    output_options: {
      schema_version: 1,
      flatten_acroform: false,
      preserve_source_metadata: false,
      pdf_title_pattern: "Draft Preview - {{government_entity.display_name}}",
      filename_pattern: "draft-preview-request.pdf",
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

async function fillableSource(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const form = document.getForm();
  form.createTextField("RequesterName").addToPage(page, { x: 72, y: 700, width: 250, height: 20 });
  form.createTextField("RecordsDescription").addToPage(page, { x: 72, y: 560, width: 468, height: 120 });
  form.createCheckBox("TennesseeCitizen").addToPage(page, { x: 72, y: 660, width: 15, height: 15 });
  form.createTextField("Signature").addToPage(page, { x: 72, y: 100, width: 250, height: 20 });
  form.createTextField("RequestDate").addToPage(page, { x: 72, y: 70, width: 150, height: 20 });
  return document.save();
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function fakeStorageClient() {
  return {
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example.test/${path}` } }),
      })),
    },
  };
}

describe("generateOperatorPreviewDocument", () => {
  it("generates an editable PDF from a draft profile using the real fill_payload, with identity/citizenship/signature/date fields blank", async () => {
    const sourceBytes = await fillableSource();
    const hash = await sha256Hex(sourceBytes);
    const evidence: TemplateSource = {
      bucket_id: "request-templates",
      object_path: "entities/4/forms/draft.pdf",
      mime_type: "application/pdf",
      size_bytes: sourceBytes.length,
      sha256_hex: hash,
    };
    const supabase = fakeStorageClient();
    const fetcher = vi.fn(async () => new Response(new Blob([new Uint8Array(sourceBytes)]), { status: 200 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetcher as unknown as typeof fetch;

    try {
      const result = await generateOperatorPreviewDocument(draftAcroformProfile(), data, { supabase, evidence });

      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.type).toBe("application/pdf");
      expect(result.pageCount).toBe(1);
      expect(result.filename).toBe("draft-preview-request.pdf");

      const completed = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()));
      const form = completed.getForm();
      expect(form.getTextField("RecordsDescription").getText()).toBe(data.request.records_description);
      expect(form.getTextField("RequesterName").getText()).toBeUndefined();
      expect(form.getCheckBox("TennesseeCitizen").isChecked()).toBe(false);
      expect(form.getTextField("Signature").getText()).toBeUndefined();
      expect(form.getTextField("RequestDate").getText()).toBeUndefined();
      // Not flattened: still a live, editable form.
      expect(form.getFields().length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("never calls the public get_public_request_template_source RPC (no rpc method needed at all)", async () => {
    const sourceBytes = await fillableSource();
    const hash = await sha256Hex(sourceBytes);
    const evidence: TemplateSource = {
      bucket_id: "request-templates",
      object_path: "entities/4/forms/draft.pdf",
      mime_type: "application/pdf",
      size_bytes: sourceBytes.length,
      sha256_hex: hash,
    };
    // Deliberately storage-only client: if the implementation ever called
    // .rpc(), this test would throw with "supabase.rpc is not a function".
    const supabase = fakeStorageClient();
    const fetcher = vi.fn(async () => new Response(new Blob([new Uint8Array(sourceBytes)]), { status: 200 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetcher as unknown as typeof fetch;

    try {
      await expect(generateOperatorPreviewDocument(draftAcroformProfile(), data, { supabase, evidence })).resolves.toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fails when no evidence is supplied for an acroform profile that needs one", async () => {
    const supabase = fakeStorageClient();
    await expect(
      generateOperatorPreviewDocument(draftAcroformProfile(), data, { supabase, evidence: null }),
    ).rejects.toThrow();
  });

  it.each(["in_review", "verified", "retired"] as const)(
    "rejects a %s profile — this path only renders profiles with status === 'draft'",
    async (status) => {
      const sourceBytes = await fillableSource();
      const hash = await sha256Hex(sourceBytes);
      const evidence: TemplateSource = {
        bucket_id: "request-templates",
        object_path: "entities/4/forms/draft.pdf",
        mime_type: "application/pdf",
        size_bytes: sourceBytes.length,
        sha256_hex: hash,
      };
      const supabase = fakeStorageClient();
      const profile = {
        ...draftAcroformProfile(),
        status,
        // Verified profiles require verifier metadata for structural
        // validation; populated here so this exercises the draft-status
        // gate specifically, not an unrelated structural failure.
        verified_by: status === "verified" ? "40000000-0000-4000-8000-000000000004" : null,
        verified_at: status === "verified" ? "2026-08-01T12:00:00Z" : null,
      };
      await expect(
        generateOperatorPreviewDocument(profile, data, { supabase, evidence }),
      ).rejects.toThrow(/draft/i);
    },
  );
});
