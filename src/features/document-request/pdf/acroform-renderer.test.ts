import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { requestProfileSchema, type RequestProfile } from "./profile-schema";
import type { RequestDocumentData } from "./request-data-schema";
import {
  AcroformRendererError,
  createAcroformRenderer,
  type BasePdfLoader,
} from "./acroform-renderer";

const entityId = "10000000-0000-4000-8000-000000000001";
const profileId = "20000000-0000-4000-8000-000000000002";
const sourceId = "30000000-0000-4000-8000-000000000003";
type AcroformField = Extract<
  RequestProfile["field_schema"],
  { renderer_type: "acroform" }
>["fields"][number];

const data: RequestDocumentData = {
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

function profile(fields: AcroformField[]): RequestProfile {
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
    eligibility_mode: "citizenship_required",
    eligibility_jurisdiction: "TN",
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
    field_schema: { schema_version: 1, renderer_type: "acroform", fields },
    template_schema: { schema_version: 1, blocks: [] },
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
      filename_pattern: "request.pdf",
      page_size: "LETTER",
      margin_points: 72,
      default_font_key: "body",
      minimum_font_size: 8,
      show_page_numbers: false,
      allow_continuation: false,
    },
    verified_by: "40000000-0000-4000-8000-000000000004",
    verified_at: "2026-08-01T12:00:00Z",
  };
}

async function sourcePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const form = document.getForm();
  form.createTextField("RequesterName").addToPage(page, { x: 72, y: 700, width: 250, height: 20 });
  form.createTextField("RecordsDescription").addToPage(page, { x: 72, y: 500, width: 468, height: 120 });
  form.createCheckBox("TennesseeCitizen").addToPage(page, { x: 72, y: 660, width: 15, height: 15 });
  const dropdown = form.createDropdown("DeliveryMethod");
  dropdown.addOptions(["electronic", "inspection", "paper"]);
  dropdown.addToPage(page, { x: 72, y: 620, width: 140, height: 20 });
  return document.save();
}

async function twoPagePrivacySource(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const first = document.addPage([612, 792]);
  const second = document.addPage([612, 792]);
  const form = document.getForm();
  form.createTextField("RecordsDescription").addToPage(first, { x: 72, y: 500, width: 468, height: 140 });
  form.createCheckBox("ElectronicDelivery").addToPage(first, { x: 72, y: 450, width: 15, height: 15 });
  for (const [index, name] of ["Name", "Email", "Phone", "Address", "RequestDate", "Signature"].entries()) {
    form.createTextField(name).addToPage(second, { x: 72, y: 700 - index * 40, width: 300, height: 22 });
  }
  form.createCheckBox("TennesseeCitizenship").addToPage(second, { x: 72, y: 410, width: 15, height: 15 });
  return document.save();
}

async function expectCode(action: () => Promise<unknown>, code: string) {
  try {
    await action();
    throw new Error("Expected AcroForm rendering to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AcroformRendererError);
    expect((error as AcroformRendererError).code).toBe(code);
  }
}

describe("createAcroformRenderer", () => {
  it("preserves blank editable identity fields, widgets, and an action-free two-page form", async () => {
    const source = await twoPagePrivacySource();
    const renderer = createAcroformRenderer({ loadBasePdf: async () => source });
    const result = await renderer({
      profile: profile([
        { source: "request.goal_language", pdf_field: "RecordsDescription", kind: "text", required: true, multiline: true },
        { source: "request.delivery_method", pdf_field: "ElectronicDelivery", kind: "checkbox", required: true, option_value: "electronic" },
      ]),
      data,
    });

    const completed = await PDFDocument.load(result.pdfBytes);
    const form = completed.getForm();
    expect(completed.getPageCount()).toBe(2);
    expect(form.getTextField("RecordsDescription").getText()).toBe(data.request.goal_language);
    expect(form.getCheckBox("ElectronicDelivery").isChecked()).toBe(true);
    for (const name of ["Name", "Email", "Phone", "Address", "RequestDate", "Signature"]) {
      expect(form.getTextField(name).getText()).toBeUndefined();
    }
    expect(form.getCheckBox("TennesseeCitizenship").isChecked()).toBe(false);
    expect(form.getFields()).toHaveLength(9);
    expect(form.getFields().reduce((total, field) => total + field.acroField.getWidgets().length, 0)).toBe(9);

    for (const [, object] of completed.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFDict)) continue;
      expect(object.has(PDFName.of("JS"))).toBe(false);
      expect(object.has(PDFName.of("JavaScript"))).toBe(false);
      expect(object.has(PDFName.of("OpenAction"))).toBe(false);
      if (object.get(PDFName.of("Subtype"))?.toString() === "/Widget") {
        expect(object.has(PDFName.of("A"))).toBe(false);
        expect(object.has(PDFName.of("AA"))).toBe(false);
      }
    }
  });

  it("fills approved request content while leaving identity fields blank and editable", async () => {
    const bytes = await sourcePdf();
    const loadBasePdf = vi.fn<BasePdfLoader>(async () => bytes);
    const renderer = createAcroformRenderer({ loadBasePdf });
    const result = await renderer({
      profile: profile([
        { source: "request.records_description", pdf_field: "RecordsDescription", kind: "text", required: true, multiline: true },
      ]),
      data,
    });

    expect(loadBasePdf).toHaveBeenCalledWith(sourceId);
    const completed = await PDFDocument.load(result.pdfBytes);
    expect(completed.getForm().getTextField("RecordsDescription").getText()).toBe(data.request.records_description);
    expect(completed.getForm().getTextField("RecordsDescription").isMultiline()).toBe(true);
    expect(completed.getForm().getTextField("RequesterName").getText()).toBeUndefined();
    expect(completed.getForm().getCheckBox("TennesseeCitizen").isChecked()).toBe(false);
    expect(completed.getForm().getFields()).toHaveLength(4);
    expect(completed.getTitle()).toBe("Request - Example City");
  });

  it("rejects profiles that request AcroForm flattening", () => {
    const parsed = requestProfileSchema.safeParse({ ...profile([]), output_options: { ...profile([]).output_options, flatten_acroform: true } });
    expect(parsed.success).toBe(false);
  });

  it("fills a dropdown from a normalized string value", async () => {
    const bytes = await sourcePdf();
    const renderer = createAcroformRenderer({ loadBasePdf: async () => bytes });
    const result = await renderer({
      profile: {
        ...profile([]),
        field_schema: {
          schema_version: 1,
          renderer_type: "acroform",
          fields: [{ source: "request.delivery_method", pdf_field: "DeliveryMethod", kind: "dropdown", required: true }],
        },
      },
      data,
    });
    const completed = await PDFDocument.load(result.pdfBytes);
    expect(completed.getForm().getDropdown("DeliveryMethod").getSelected()).toEqual(["electronic"]);
  });

  it("blocks duplicate mappings", async () => {
    const bytes = await sourcePdf();
    const renderer = createAcroformRenderer({ loadBasePdf: async () => bytes });
    await expectCode(() => renderer({
      profile: profile([
        { source: "request.records_description", pdf_field: "RecordsDescription", kind: "text", required: false },
        { source: "request.records_description", pdf_field: "RecordsDescription", kind: "text", required: false },
      ]),
      data,
    }), "DUPLICATE_FIELD_MAPPING");
  });

  it("blocks missing required values", async () => {
    const bytes = await sourcePdf();
    const renderer = createAcroformRenderer({ loadBasePdf: async () => bytes });
    await expectCode(() => renderer({
      profile: profile([{ source: "request.vendor_or_system", pdf_field: "RecordsDescription", kind: "text", required: true }]),
      data,
    }), "FIELD_VALUE_MISSING");
  });

  it("blocks values that exceed a verified field limit", async () => {
    const bytes = await sourcePdf();
    const renderer = createAcroformRenderer({ loadBasePdf: async () => bytes });
    await expectCode(() => renderer({
      profile: profile([{ source: "request.records_description", pdf_field: "RecordsDescription", kind: "text", required: false, max_length: 5 }]),
      data,
    }), "FIELD_VALUE_INVALID");
  });

  it("blocks missing fields and wrong field types", async () => {
    const bytes = await sourcePdf();
    const renderer = createAcroformRenderer({ loadBasePdf: async () => bytes });
    await expectCode(() => renderer({
      profile: profile([{ source: "request.records_description", pdf_field: "TennesseeCitizen", kind: "text", required: false }]),
      data,
    }), "FIELD_NOT_FOUND_OR_WRONG_TYPE");
  });

  it("blocks invalid source bytes", async () => {
    const renderer = createAcroformRenderer({
      loadBasePdf: async () => new TextEncoder().encode("not a pdf"),
    });
    await expectCode(() => renderer({ profile: profile([]), data }), "SOURCE_PDF_INVALID");
  });

  it("blocks an invalid configured custom font", async () => {
    const bytes = await sourcePdf();
    const renderer = createAcroformRenderer({
      loadBasePdf: async () => bytes,
      loadFont: async () => new TextEncoder().encode("not a font"),
    });
    await expectCode(() => renderer({ profile: profile([]), data }), "FONT_INVALID");
  });
});
