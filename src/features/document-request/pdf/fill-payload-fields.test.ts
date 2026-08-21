import { describe, expect, it } from "vitest";
import { requestProfileSchema, type RequestProfile } from "./profile-schema";
import { requestDocumentDataSchema } from "./request-data-schema";
import { adaptRequestProfileRow } from "./profile-adapter";
import {
  deriveSupportedRequestFieldKeys,
  describeField,
  deriveFieldDescriptors,
  pruneUnsupportedFillPayloadKeys,
} from "./fill-payload-fields";

const CITY_PROFILE_ID = "56edbf40-ee40-40b9-bba3-d522cd6550cf";
const POLICE_PROFILE_ID = "10dc495d-417d-4027-8ac4-4cb9fbd5b966";
const INSPECTION_FIELD = "Inspection Only  No copies The TPRA does not permit fees or require a written request for";

function baseProfileFields() {
  return {
    version: 1,
    schema_version: 1 as const,
    status: "draft" as const,
    effective_from: "2020-01-01",
    effective_to: null,
    policy_source_url: "https://example.test/policy",
    archived_policy_object_id: null,
    policy_summary: null,
    eligibility_mode: "unknown" as const,
    eligibility_jurisdiction: null,
    eligibility_explanation: null,
    form_mode: "required" as const,
    form_explanation: null,
    fee_rule: null,
    aggregation_rule: null,
    submission_instructions: null,
    template_family: "municipal_form" as const,
    continuation_profile_id: null,
    template_schema: { schema_version: 1 as const, blocks: [] },
    validation_schema: { schema_version: 1 as const, required_paths: ["request.records_description"], rules: [], scope_warnings: { broad_mode_confirmation: false } },
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
      show_page_numbers: false,
      allow_continuation: false,
    },
    verified_by: null,
    verified_at: null,
  };
}

function cityProfile(): RequestProfile {
  const row = {
    id: CITY_PROFILE_ID,
    government_entity_id: 4,
    ...baseProfileFields(),
    renderer_type: "acroform" as const,
    base_pdf_object_id: "28bc3e20-31b1-41b1-bd1b-87e7c73aa2af",
    field_schema: {
      schema_version: 1,
      renderer_type: "acroform",
      fields: [
        { source: "request.delivery_method", pdf_field: "Electronic Copy", kind: "checkbox", required: true, option_value: "electronic" },
        { source: "request.delivery_method", pdf_field: "OnSite Pickup Copy", kind: "checkbox", required: true, option_value: "onsite_pickup" },
        { source: "request.delivery_method", pdf_field: "USPS First Class Mail Copy", kind: "checkbox", required: true, option_value: "usps_mail" },
        { source: "request.delivery_method", pdf_field: INSPECTION_FIELD, kind: "checkbox", required: true, option_value: "inspection" },
        { source: "request.department_or_division", pdf_field: "Purchasing", kind: "checkbox", required: false, option_value: "Purchasing" },
        { source: "request.department_or_division", pdf_field: "Type Dept", kind: "text", required: false, max_length: 200 },
        { source: "request.records_description", pdf_field: "Description of Request", kind: "text", required: true, multiline: true, max_length: 12000 },
      ],
    },
  };
  return requestProfileSchema.parse(adaptRequestProfileRow(row));
}

function policeProfile(): RequestProfile {
  const row = {
    id: POLICE_PROFILE_ID,
    government_entity_id: 5,
    ...baseProfileFields(),
    renderer_type: "acroform" as const,
    base_pdf_object_id: "fe502656-cbb9-427f-82cd-4428ecac4318",
    field_schema: {
      schema_version: 1,
      renderer_type: "acroform",
      fields: [
        { source: "request.delivery_method", pdf_field: "Electronic Copy", kind: "checkbox", required: true, option_value: "electronic" },
        { source: "request.delivery_method", pdf_field: "OnSite Pickup Copy", kind: "checkbox", required: true, option_value: "onsite_pickup" },
        { source: "request.delivery_method", pdf_field: "USPS First Class Mail Copy", kind: "checkbox", required: true, option_value: "usps_mail" },
        { source: "request.delivery_method", pdf_field: INSPECTION_FIELD, kind: "checkbox", required: true, option_value: "inspection" },
        { source: "request.record_category_label", pdf_field: "Other", kind: "checkbox", required: false, option_value: "Contracts" },
        { source: "request.record_category_label", pdf_field: "Other Records", kind: "text", required: false, max_length: 200 },
        { source: "request.date_from_mm_dd_yyyy", pdf_field: "Date of Event", kind: "text", required: false, max_length: 10 },
        { source: "request.records_description", pdf_field: "Request Description", kind: "text", required: true, multiline: true, max_length: 12000 },
      ],
    },
  };
  return requestProfileSchema.parse(adaptRequestProfileRow(row));
}

function letterProfile(): RequestProfile {
  const row = {
    id: "60000000-0000-4000-8000-000000000006",
    government_entity_id: 4,
    ...baseProfileFields(),
    renderer_type: "generated_letter" as const,
    base_pdf_object_id: null,
    field_schema: { schema_version: 1, renderer_type: "generated_letter", fields: [] },
    template_schema: {
      schema_version: 1,
      blocks: [
        { id: "body", type: "paragraph", text: "We request {{request.records_description}}, delivered via {{request.delivery_method}}.", locked: false },
      ],
    },
  };
  return requestProfileSchema.parse(adaptRequestProfileRow(row));
}

describe("deriveSupportedRequestFieldKeys", () => {
  it("always includes the baseline keys the goal-adapter unconditionally requires", () => {
    const keys = deriveSupportedRequestFieldKeys(cityProfile());
    expect(keys).toContain("records_description");
    expect(keys).toContain("delivery_method");
  });

  it("includes department_or_division for the City profile but not record_category_label or dates", () => {
    const keys = deriveSupportedRequestFieldKeys(cityProfile());
    expect(keys).toContain("department_or_division");
    expect(keys).not.toContain("record_category_label");
    expect(keys).not.toContain("date_from_mm_dd_yyyy");
  });

  it("includes record_category_label and date_from for the Police profile but not department_or_division", () => {
    const keys = deriveSupportedRequestFieldKeys(policeProfile());
    expect(keys).toContain("record_category_label");
    expect(keys).toContain("date_from_mm_dd_yyyy");
    expect(keys).not.toContain("department_or_division");
  });

  it("derives supported keys from template placeholder tokens for a generated_letter profile", () => {
    const keys = deriveSupportedRequestFieldKeys(letterProfile());
    expect(keys).toEqual(["records_description", "delivery_method"]);
  });
});

describe("describeField — controlled-choice / free-text / date mapping", () => {
  it("department_or_division is a choice field with an Other free-text fallback, from the City profile's checkbox + text pair", () => {
    const field = describeField(cityProfile(), "department_or_division");
    expect(field.kind).toBe("choice");
    if (field.kind === "choice") {
      expect(field.choices).toEqual(["Purchasing"]);
      expect(field.allowOther).toBe(true);
    }
  });

  it("record_category_label is a choice field for the Police profile, from its Contracts checkbox", () => {
    const field = describeField(policeProfile(), "record_category_label");
    expect(field.kind).toBe("choice");
    if (field.kind === "choice") {
      expect(field.choices).toEqual(["Contracts"]);
      expect(field.allowOther).toBe(true);
    }
  });

  it("date_from_mm_dd_yyyy is a date field", () => {
    const field = describeField(policeProfile(), "date_from_mm_dd_yyyy");
    expect(field.kind).toBe("date");
  });

  it("delivery_method choices come from the profile's own declared option_values, in field-schema order", () => {
    const field = describeField(cityProfile(), "delivery_method");
    expect(field.kind).toBe("choice");
    if (field.kind === "choice") {
      expect(field.choices).toEqual(["electronic", "onsite_pickup", "usps_mail", "inspection"]);
    }
  });

  it("delivery_method falls back to the full allowed set for a generated_letter profile with no field_schema entries", () => {
    const field = describeField(letterProfile(), "delivery_method");
    expect(field.kind).toBe("choice");
    if (field.kind === "choice") {
      expect(field.choices).toEqual(["electronic", "inspection", "onsite_pickup", "usps_mail"]);
    }
  });

  it("records_description is a required textarea with max_length from the profile's declared field", () => {
    const field = describeField(cityProfile(), "records_description");
    expect(field.kind).toBe("textarea");
    if (field.kind === "textarea") {
      expect(field.required).toBe(true);
      expect(field.maxLength).toBe(12000);
    }
  });
});

describe("deriveFieldDescriptors", () => {
  it("returns one descriptor per supported key, in a stable baseline-first order", () => {
    const descriptors = deriveFieldDescriptors(cityProfile());
    expect(descriptors.map((field) => field.key)).toEqual(["records_description", "delivery_method", "department_or_division"]);
  });
});

describe("pruneUnsupportedFillPayloadKeys", () => {
  it("removes a value left over from a previously selected profile that the new profile does not support", () => {
    const stale = { records_description: "All contracts.", delivery_method: "electronic", record_category_label: "Contracts" };
    const pruned = pruneUnsupportedFillPayloadKeys(stale, cityProfile());
    expect(pruned).toEqual({ records_description: "All contracts.", delivery_method: "electronic" });
  });

  it("keeps every key the new profile does support", () => {
    const value = { records_description: "All contracts.", delivery_method: "electronic", department_or_division: "Purchasing" };
    const pruned = pruneUnsupportedFillPayloadKeys(value, cityProfile());
    expect(pruned).toEqual(value);
  });
});

describe("valid fill-data survives round-trip through the real request-document schema", () => {
  const entity = { id: "4", legal_name: "City of Murfreesboro", display_name: "City of Murfreesboro" };
  const profile = cityProfile();

  it("a valid supported payload parses successfully and is returned unchanged", () => {
    const request = {
      goal_language: "Investigative purpose.",
      records_description: "All executed vendor contracts and amendments.",
      department_or_division: "Purchasing",
      delivery_method: "electronic",
    };
    const result = requestDocumentDataSchema.safeParse({
      government_entity: entity,
      request,
      profile: { id: profile.id, version: profile.version, government_entity_id: profile.government_entity_id },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.request.records_description).toBe(request.records_description);
      expect(result.data.request.department_or_division).toBe(request.department_or_division);
      expect(result.data.request.delivery_method).toBe(request.delivery_method);
    }
  });
});

describe("requester identity fields can never be introduced through the goal editor's schema", () => {
  const entity = { id: "4", legal_name: "City of Murfreesboro", display_name: "City of Murfreesboro" };
  const profile = cityProfile();

  it.each([
    "requester_name", "requester_email", "requester_phone", "requester_address",
    "citizenship", "signature", "requester_date", "date_signed",
  ])("rejects an unknown/requester-identity key %s injected into request (Zod .strict() excess-property rejection)", (key) => {
    const request = {
      goal_language: "Investigative purpose.",
      records_description: "All executed vendor contracts and amendments.",
      delivery_method: "electronic",
      [key]: "should never be accepted",
    };
    const result = requestDocumentDataSchema.safeParse({
      government_entity: entity,
      request,
      profile: { id: profile.id, version: profile.version, government_entity_id: profile.government_entity_id },
    });
    expect(result.success).toBe(false);
  });
});
