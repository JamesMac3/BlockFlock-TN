import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import type { RequestProfile } from "./profile-schema";
import type { RequestDocumentData } from "./request-data-schema";
import type { TemplateSource } from "./supabase-template-loader";
import { evaluateOperatorPreviewReadiness } from "./operator-preview-readiness";
import { generateOperatorPreviewDocument } from "./generate-operator-preview-document";

/**
 * Live-shaped fixture integration test for the confirmed-live Flock goal
 * (id 3) — NOT an end-to-end or live-data test. What this actually proves:
 *   - evaluateOperatorPreviewReadiness (the same gate the operator-preview
 *     button calls) accepts the exact saved fill_payload and draft acroform
 *     profile shape, and carries the exact saved request text through
 *     unmodified.
 *   - generateOperatorPreviewDocument (the same function the button calls)
 *     renders that data into populated PDF form fields using pdf-lib's
 *     real fill logic — not a stub of the rendering itself.
 *   - The draft-only gate still rejects a verified/in-review/retired
 *     profile for this same fixture.
 *
 * What this does NOT prove, and this file makes no claim otherwise:
 *   - That the real live-Supabase-hosted base PDF for this goal downloads
 *     and verifies successfully — the PDF bytes here are synthetically
 *     built with pdf-lib (no real Murfreesboro source PDF exists in this
 *     repository to test against), the Supabase client is a hand-written
 *     fake exposing only storage.from().getPublicUrl(), and the network
 *     fetch of the "template" is a mocked Response. None of that is a
 *     substitute for the real storage round-trip.
 *   - That the operator-facing browser UI (OperatorDraftPreviewButton,
 *     RequestDeliveryPanel, the iframe/Open/Download controls) actually
 *     renders and displays the result. That requires manually opening the
 *     admin dashboard, clicking "Preview Draft Request Form" on goal 3,
 *     and confirming the panel appears with the populated PDF — see the
 *     manual verification steps in this task's completion report.
 */

const GOAL_ID = 3;
const PROFILE_ID = "10dc495d-417d-4027-8ac4-4cb9fbd5b966";
const ENTITY_ID = 5;
const SOURCE_ID = "fe502656-cbb9-427f-82cd-4428ecac4318";

// Exactly the live-confirmed saved fill_payload for goal 3 — not a
// paraphrase or placeholder.
const LIVE_RECORDS_DESCRIPTION =
  "Please provide all contracts, amendments, purchase orders, invoices, and renewal records for Flock Safety or any Flock-related ALPR or camera deployment used by the Murfreesboro Police Department.";

const goal = {
  id: GOAL_ID,
  title: "Flock Contracts and Invoice Trail",
  public_summary: "Track the city's Flock Safety camera contracts and invoices.",
  locked: false,
  government_entity_id: ENTITY_ID,
  request_profile_id: PROFILE_ID,
  fill_payload: {
    request: {
      delivery_method: "electronic",
      records_description: LIVE_RECORDS_DESCRIPTION,
      record_category_label: "Contracts",
    },
  },
};

const entityRow = {
  id: ENTITY_ID,
  legal_name: "Murfreesboro Police Department",
  display_name: "Murfreesboro Police Department",
};

const data: RequestDocumentData = {
  government_entity: { id: String(ENTITY_ID), legal_name: entityRow.legal_name, display_name: entityRow.display_name },
  request: {
    goal_language: goal.public_summary,
    delivery_method: "electronic",
    records_description: LIVE_RECORDS_DESCRIPTION,
    record_category_label: "Contracts",
  },
  profile: { id: PROFILE_ID, version: 1, government_entity_id: String(ENTITY_ID) },
};

function draftProfileRow(): RequestProfile {
  return {
    id: PROFILE_ID,
    government_entity_id: String(ENTITY_ID),
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
    base_pdf_object_id: SOURCE_ID,
    continuation_profile_id: null,
    field_schema: {
      schema_version: 1,
      renderer_type: "acroform",
      fields: [
        { source: "request.delivery_method", pdf_field: "Electronic Copy", kind: "checkbox", required: true, option_value: "electronic" },
        { source: "request.record_category_label", pdf_field: "Other", kind: "checkbox", required: false, option_value: "Contracts" },
        { source: "request.records_description", pdf_field: "Request Description", kind: "text", required: true, multiline: true, max_length: 12000 },
      ],
    },
    template_schema: { schema_version: 1, blocks: [] },
    validation_schema: {
      schema_version: 1,
      required_paths: ["request.records_description", "request.delivery_method"],
      rules: [],
      scope_warnings: { broad_mode_confirmation: false },
    },
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

// Synthetic stand-in for the real Murfreesboro base PDF — no real source
// PDF exists in this repository. Field names match this fixture's own
// field_schema so the rendering pipeline can be exercised end-to-end
// in-process; this is not the actual live document.
async function syntheticSource(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const form = document.getForm();
  form.createCheckBox("Electronic Copy").addToPage(page, { x: 72, y: 700, width: 15, height: 15 });
  form.createCheckBox("Other").addToPage(page, { x: 72, y: 670, width: 15, height: 15 });
  form.createTextField("Request Description").addToPage(page, { x: 72, y: 400, width: 468, height: 200 });
  return document.save();
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

// Hand-written fake exposing only the one method generateOperatorPreviewDocument
// calls (storage.from().getPublicUrl()) — not a real Supabase client and
// not a substitute for the real storage round-trip.
function fakeStorageClient() {
  return {
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example.test/${path}` } }),
      })),
    },
  };
}

describe("Flock goal 3: live-shaped fixture integration test (synthetic PDF, fake storage client, mocked fetch — see file header)", () => {
  it("evaluateOperatorPreviewReadiness accepts the saved goal against the draft profile, carrying the exact saved request data unmodified", () => {
    const readiness = evaluateOperatorPreviewReadiness({ goal, profileRow: draftProfileRow(), entityRow });
    expect(readiness.ready).toBe(true);
    if (readiness.ready) {
      expect(readiness.data.request.records_description).toBe(LIVE_RECORDS_DESCRIPTION);
      expect(readiness.data.request.delivery_method).toBe("electronic");
      expect(readiness.data.request.record_category_label).toBe("Contracts");
    }
  });

  it("the rendering pipeline populates PDF form fields with the saved description, electronic delivery, and Contracts category, using pdf-lib's real fill logic against a synthetic source PDF", async () => {
    const readiness = evaluateOperatorPreviewReadiness({ goal, profileRow: draftProfileRow(), entityRow });
    expect(readiness.ready).toBe(true);
    if (!readiness.ready) return;

    const sourceBytes = await syntheticSource();
    const hash = await sha256Hex(sourceBytes);
    const evidence: TemplateSource = {
      bucket_id: "request-templates",
      object_path: "entities/5/forms/flock-request-template.pdf",
      mime_type: "application/pdf",
      size_bytes: sourceBytes.length,
      sha256_hex: hash,
    };

    const supabase = fakeStorageClient();
    const fetcher = vi.fn(async () => new Response(new Blob([new Uint8Array(sourceBytes)]), { status: 200 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetcher as unknown as typeof fetch;

    try {
      const result = await generateOperatorPreviewDocument(readiness.profile, readiness.data, { supabase, evidence });

      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.type).toBe("application/pdf");

      const rendered = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()));
      const form = rendered.getForm();

      expect(form.getTextField("Request Description").getText()).toBe(LIVE_RECORDS_DESCRIPTION);
      expect(form.getCheckBox("Electronic Copy").isChecked()).toBe(true);
      expect(form.getCheckBox("Other").isChecked()).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("still refuses a verified/in-review/retired profile for this same fixture — the draft-preview route never widens for live-shaped data", async () => {
    const sourceBytes = await syntheticSource();
    const hash = await sha256Hex(sourceBytes);
    const evidence: TemplateSource = {
      bucket_id: "request-templates",
      object_path: "entities/5/forms/flock-request-template.pdf",
      mime_type: "application/pdf",
      size_bytes: sourceBytes.length,
      sha256_hex: hash,
    };
    const supabase = fakeStorageClient();
    const verifiedProfile = {
      ...draftProfileRow(),
      status: "verified" as const,
      effective_from: "2020-01-01",
      verified_by: "40000000-0000-4000-8000-000000000004",
      verified_at: "2026-01-01T00:00:00Z",
    };
    const readiness = evaluateOperatorPreviewReadiness({ goal, profileRow: verifiedProfile, entityRow });
    expect(readiness.ready).toBe(false);

    const fetcher = vi.fn(async () => new Response(new Blob([new Uint8Array(sourceBytes)]), { status: 200 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetcher as unknown as typeof fetch;
    try {
      await expect(
        generateOperatorPreviewDocument(verifiedProfile, data, { supabase, evidence }),
      ).rejects.toThrow(/draft/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
