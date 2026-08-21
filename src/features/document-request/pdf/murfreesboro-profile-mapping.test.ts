import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { requestProfileSchema, type RequestProfile } from "./profile-schema";
import { requestDocumentDataSchema } from "./request-data-schema";
import { adaptGovernmentEntityRow, adaptRequestProfileRow } from "./profile-adapter";
import { buildRequestDocumentDataInput, adaptGoalFillPayload, type RawGoalRow } from "./goal-adapter";
import { evaluateGoalReadiness } from "./readiness";
import { createAcroformRenderer } from "./acroform-renderer";
import { resolveAndRenderTemplate, type RendererRegistry } from "./template-resolver";
import { validateRenderedOutput, inspectWithPdfJs } from "./output-validator";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import migrationSql from "../../../../supabase/migrations/20260820193724_murfreesboro_profile_field_mapping_fix.sql?raw";

/**
 * Regression coverage for the field mappings proposed in
 * supabase/migrations/20260820193724_murfreesboro_profile_field_mapping_fix.sql.
 * Uses small synthetic AcroForm fixtures (the exact field names from the
 * migration, not the real Murfreesboro PDFs) so this suite runs anywhere,
 * unlike the real-PDF verification script used to produce the reviewed
 * sample documents.
 */

const CITY_PROFILE_ID = "56edbf40-ee40-40b9-bba3-d522cd6550cf";
const POLICE_PROFILE_ID = "10dc495d-417d-4027-8ac4-4cb9fbd5b966";
const INSPECTION_FIELD =
  "Inspection Only  No copies The TPRA does not permit fees or require a written request for";

const CITY_FIELD_SCHEMA = {
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
} as const;

const POLICE_FIELD_SCHEMA = {
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
} as const;

const VALIDATION_SCHEMA = {
  schema_version: 1,
  required_paths: ["request.records_description"],
  rules: [],
  scope_warnings: { broad_mode_confirmation: false },
} as const;

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

function cityProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CITY_PROFILE_ID,
    government_entity_id: 4,
    ...baseProfileFields(),
    renderer_type: "acroform",
    base_pdf_object_id: "28bc3e20-31b1-41b1-bd1b-87e7c73aa2af",
    field_schema: CITY_FIELD_SCHEMA,
    validation_schema: VALIDATION_SCHEMA,
    ...overrides,
  };
}

function policeProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: POLICE_PROFILE_ID,
    government_entity_id: 5,
    ...baseProfileFields(),
    renderer_type: "acroform",
    base_pdf_object_id: "fe502656-cbb9-427f-82cd-4428ecac4318",
    field_schema: POLICE_FIELD_SCHEMA,
    validation_schema: VALIDATION_SCHEMA,
    ...overrides,
  };
}

async function synthCityForm(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const form = document.getForm();
  form.createTextField("First Name and Last Name").addToPage(page, { x: 72, y: 740, width: 300, height: 16 });
  form.createCheckBox("Electronic Copy").addToPage(page, { x: 72, y: 700, width: 12, height: 12 });
  form.createCheckBox("OnSite Pickup Copy").addToPage(page, { x: 72, y: 680, width: 12, height: 12 });
  form.createCheckBox("USPS First Class Mail Copy").addToPage(page, { x: 72, y: 660, width: 12, height: 12 });
  form.createCheckBox(INSPECTION_FIELD).addToPage(page, { x: 72, y: 640, width: 12, height: 12 });
  form.createCheckBox("Purchasing").addToPage(page, { x: 72, y: 620, width: 12, height: 12 });
  form.createTextField("Type Dept").addToPage(page, { x: 200, y: 620, width: 200, height: 14 });
  form.createTextField("Description of Request").addToPage(page, { x: 72, y: 500, width: 468, height: 100 });
  return document.save();
}

async function synthPoliceForm(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const form = document.getForm();
  form.createTextField("First Name and Last Name").addToPage(page, { x: 72, y: 740, width: 300, height: 16 });
  form.createCheckBox("Electronic Copy").addToPage(page, { x: 72, y: 700, width: 12, height: 12 });
  form.createCheckBox("OnSite Pickup Copy").addToPage(page, { x: 72, y: 680, width: 12, height: 12 });
  form.createCheckBox("USPS First Class Mail Copy").addToPage(page, { x: 72, y: 660, width: 12, height: 12 });
  form.createCheckBox(INSPECTION_FIELD).addToPage(page, { x: 72, y: 640, width: 12, height: 12 });
  form.createCheckBox("Other").addToPage(page, { x: 72, y: 620, width: 12, height: 12 });
  form.createTextField("Other Records").addToPage(page, { x: 200, y: 620, width: 200, height: 14 });
  form.createTextField("Date of Event").addToPage(page, { x: 72, y: 600, width: 120, height: 14 });
  form.createTextField("Request Description").addToPage(page, { x: 72, y: 480, width: 468, height: 100 });
  return document.save();
}

async function render(profile: RequestProfile, data: ReturnType<typeof requestDocumentDataSchema.parse>, source: Uint8Array) {
  const loadBasePdf = async () => source;
  const renderers: RendererRegistry = {
    acroform: createAcroformRenderer({ loadBasePdf }),
    overlay: createAcroformRenderer({ loadBasePdf }),
    generated_letter: createAcroformRenderer({ loadBasePdf }),
  };
  const verifiedProfile: RequestProfile = { ...profile, status: "verified", verified_by: "40000000-0000-4000-8000-000000000004", verified_at: "2026-01-01T00:00:00Z" };
  const rendered = await resolveAndRenderTemplate(verifiedProfile, data, renderers);
  const validated = await validateRenderedOutput(rendered, verifiedProfile, data, { inspectPdf: inspectWithPdfJs });
  return PDFDocument.load(validated.pdfBytes);
}

function buildData(profileRow: Record<string, unknown>, entityRow: Record<string, unknown>, goal: RawGoalRow) {
  const adaptedProfile = adaptRequestProfileRow(profileRow);
  const profile = requestProfileSchema.parse(adaptedProfile);
  const adaptedEntity = adaptGovernmentEntityRow(entityRow);
  const input = buildRequestDocumentDataInput(
    goal,
    { id: profile.id, version: profile.version, government_entity_id: profile.government_entity_id },
    adaptedEntity,
  );
  const data = requestDocumentDataSchema.parse(input);
  return { profile, data };
}

const cityEntityRow = { id: 4, legal_name: "City of Murfreesboro", display_name: "City of Murfreesboro" };
const policeEntityRow = { id: 5, legal_name: "Murfreesboro Police Department", display_name: "Murfreesboro Police Department" };

describe("City of Murfreesboro profile field mapping", () => {
  it("passes structural validation with only supported placeholder sources (no request.delivery_is_*/has_* derived sources)", () => {
    const parsed = requestProfileSchema.safeParse(adaptRequestProfileRow(cityProfileRow()));
    expect(parsed.success).toBe(true);
  });

  it("checks exactly the delivery checkbox matching request.delivery_method and leaves the rest unchecked", async () => {
    const goal: RawGoalRow = {
      title: "City Contract Register",
      public_summary: "Track city vendor contracts.",
      government_entity_id: 4,
      fill_payload: { request: { records_description: "All executed vendor contracts.", department_or_division: "Purchasing", delivery_method: "usps_mail" } },
    };
    const { profile, data } = buildData(cityProfileRow(), cityEntityRow, goal);
    const doc = await render(profile, data, await synthCityForm());
    const form = doc.getForm();
    expect(form.getCheckBox("USPS First Class Mail Copy").isChecked()).toBe(true);
    expect(form.getCheckBox("Electronic Copy").isChecked()).toBe(false);
    expect(form.getCheckBox("OnSite Pickup Copy").isChecked()).toBe(false);
    expect(form.getCheckBox(INSPECTION_FIELD).isChecked()).toBe(false);
  });

  it("maps records_description to Description of Request exactly, verbatim", async () => {
    const goal: RawGoalRow = {
      title: "City Contract Register",
      public_summary: "Different purpose text that must not appear in the form.",
      government_entity_id: 4,
      fill_payload: { request: { records_description: "The exact approved request language for the city.", delivery_method: "electronic" } },
    };
    const { profile, data } = buildData(cityProfileRow(), cityEntityRow, goal);
    const doc = await render(profile, data, await synthCityForm());
    const text = doc.getForm().getTextField("Description of Request").getText();
    expect(text).toBe("The exact approved request language for the city.");
    expect(text).not.toContain("Different purpose text");
  });

  it("checks Purchasing and fills Type Dept only when department_or_division is Purchasing", async () => {
    const goal: RawGoalRow = {
      title: "City Contract Register",
      public_summary: "Purpose",
      government_entity_id: 4,
      fill_payload: { request: { records_description: "All executed vendor contracts and amendments.", department_or_division: "Purchasing", delivery_method: "electronic" } },
    };
    const { profile, data } = buildData(cityProfileRow(), cityEntityRow, goal);
    const doc = await render(profile, data, await synthCityForm());
    const form = doc.getForm();
    expect(form.getCheckBox("Purchasing").isChecked()).toBe(true);
    expect(form.getTextField("Type Dept").getText()).toBe("Purchasing");
  });

  it("leaves Purchasing unchecked and Type Dept blank when no department is approved", async () => {
    const goal: RawGoalRow = {
      title: "Some other city goal",
      public_summary: "Purpose",
      government_entity_id: 4,
      fill_payload: { request: { records_description: "All executed vendor contracts and amendments.", delivery_method: "electronic" } },
    };
    const { profile, data } = buildData(cityProfileRow(), cityEntityRow, goal);
    const doc = await render(profile, data, await synthCityForm());
    const form = doc.getForm();
    expect(form.getCheckBox("Purchasing").isChecked()).toBe(false);
    expect(form.getTextField("Type Dept").getText()).toBeUndefined();
  });

  it("never touches identity fields not present in field_schema", async () => {
    const goal: RawGoalRow = {
      title: "City Contract Register",
      public_summary: "Purpose",
      government_entity_id: 4,
      fill_payload: { request: { records_description: "All executed vendor contracts and amendments.", delivery_method: "electronic" } },
    };
    const { profile, data } = buildData(cityProfileRow(), cityEntityRow, goal);
    const doc = await render(profile, data, await synthCityForm());
    expect(doc.getForm().getTextField("First Name and Last Name").getText()).toBeUndefined();
  });
});

describe("Murfreesboro Police Department profile field mapping", () => {
  it("passes structural validation with only supported placeholder sources", () => {
    const parsed = requestProfileSchema.safeParse(adaptRequestProfileRow(policeProfileRow()));
    expect(parsed.success).toBe(true);
  });

  it("checks exactly the delivery checkbox matching request.delivery_method", async () => {
    const goal: RawGoalRow = {
      title: "Murfreesboro Police Contract Register",
      public_summary: "Purpose",
      government_entity_id: 5,
      fill_payload: { request: { records_description: "All executed vendor contracts and amendments.", record_category_label: "Contracts", delivery_method: "inspection" } },
    };
    const { profile, data } = buildData(policeProfileRow(), policeEntityRow, goal);
    const doc = await render(profile, data, await synthPoliceForm());
    const form = doc.getForm();
    expect(form.getCheckBox(INSPECTION_FIELD).isChecked()).toBe(true);
    expect(form.getCheckBox("Electronic Copy").isChecked()).toBe(false);
    expect(form.getCheckBox("OnSite Pickup Copy").isChecked()).toBe(false);
    expect(form.getCheckBox("USPS First Class Mail Copy").isChecked()).toBe(false);
  });

  it("maps records_description to Request Description exactly, verbatim", async () => {
    const goal: RawGoalRow = {
      title: "Flock Contracts and Invoice Trail",
      public_summary: "Purpose text that must not appear in the form.",
      government_entity_id: 5,
      fill_payload: { request: { records_description: "All Flock Safety contracts and invoices.", record_category_label: "Contracts", delivery_method: "electronic" } },
    };
    const { profile, data } = buildData(policeProfileRow(), policeEntityRow, goal);
    const doc = await render(profile, data, await synthPoliceForm());
    const text = doc.getForm().getTextField("Request Description").getText();
    expect(text).toBe("All Flock Safety contracts and invoices.");
    expect(text).not.toContain("Purpose text");
  });

  it("checks Other and fills Other Records only when record_category_label is Contracts", async () => {
    const goal: RawGoalRow = {
      title: "Murfreesboro Police Contract Register",
      public_summary: "Purpose",
      government_entity_id: 5,
      fill_payload: { request: { records_description: "All executed vendor contracts and amendments.", record_category_label: "Contracts", delivery_method: "electronic" } },
    };
    const { profile, data } = buildData(policeProfileRow(), policeEntityRow, goal);
    const doc = await render(profile, data, await synthPoliceForm());
    const form = doc.getForm();
    expect(form.getCheckBox("Other").isChecked()).toBe(true);
    expect(form.getTextField("Other Records").getText()).toBe("Contracts");
  });

  it("populates Date of Event only when an approved date exists", async () => {
    const withDate: RawGoalRow = {
      title: "Murfreesboro Police Contract Register",
      public_summary: "Purpose",
      government_entity_id: 5,
      fill_payload: { request: { records_description: "All executed vendor contracts and amendments.", delivery_method: "electronic", date_from_mm_dd_yyyy: "03/14/2026" } },
    };
    const withoutDate: RawGoalRow = {
      title: "Murfreesboro Police Contract Register",
      public_summary: "Purpose",
      government_entity_id: 5,
      fill_payload: { request: { records_description: "All executed vendor contracts and amendments.", delivery_method: "electronic" } },
    };
    const { profile: profileWith, data: dataWith } = buildData(policeProfileRow(), policeEntityRow, withDate);
    const docWith = await render(profileWith, dataWith, await synthPoliceForm());
    expect(docWith.getForm().getTextField("Date of Event").getText()).toBe("03/14/2026");

    const { profile: profileWithout, data: dataWithout } = buildData(policeProfileRow(), policeEntityRow, withoutDate);
    const docWithout = await render(profileWithout, dataWithout, await synthPoliceForm());
    expect(docWithout.getForm().getTextField("Date of Event").getText()).toBeUndefined();
  });

  it("never touches identity fields not present in field_schema", async () => {
    const goal: RawGoalRow = {
      title: "Murfreesboro Police Contract Register",
      public_summary: "Purpose",
      government_entity_id: 5,
      fill_payload: { request: { records_description: "All executed vendor contracts and amendments.", delivery_method: "electronic" } },
    };
    const { profile, data } = buildData(policeProfileRow(), policeEntityRow, goal);
    const doc = await render(profile, data, await synthPoliceForm());
    expect(doc.getForm().getTextField("First Name and Last Name").getText()).toBeUndefined();
  });
});

describe("calibrated goal payload adaptation", () => {
  it("adapts the calibrated City Contract Register payload with department_or_division=Purchasing and delivery_method=electronic", () => {
    const goal: RawGoalRow = {
      title: "City Contract Register",
      public_summary: "Investigative purpose, not request language.",
      government_entity_id: 4,
      fill_payload: {
        request: {
          records_description: "The city's exact approved request language, preserved unchanged.",
          department_or_division: "Purchasing",
          delivery_method: "electronic",
        },
      },
    };
    const request = adaptGoalFillPayload(goal);
    expect(request.department_or_division).toBe("Purchasing");
    expect(request.delivery_method).toBe("electronic");
    expect(request.records_description).toBe("The city's exact approved request language, preserved unchanged.");
    expect(request.goal_language).toBe(goal.public_summary);
  });

  it.each([
    "Murfreesboro Police Contract Register",
    "Flock Contracts and Invoice Trail",
    "Axon Contracts and Pricing",
    "Motorola Contracts and Maintenance",
    "Leonardo / ELSAG Contracts and Invoices",
  ])("adapts the calibrated %s payload with record_category_label=Contracts and delivery_method=electronic", (title) => {
    const goal: RawGoalRow = {
      title,
      public_summary: "Investigative purpose.",
      government_entity_id: 5,
      fill_payload: {
        request: {
          records_description: `Approved request language for ${title}.`,
          record_category_label: "Contracts",
          delivery_method: "electronic",
        },
      },
    };
    const request = adaptGoalFillPayload(goal);
    expect(request.record_category_label).toBe("Contracts");
    expect(request.delivery_method).toBe("electronic");
    expect(request.records_description).toBe(`Approved request language for ${title}.`);
  });
});

describe("broad-scope readiness after the approved profile configuration change", () => {
  it("is ready with no date range once broad_mode_confirmation is turned off on the profile", () => {
    const goal = {
      id: 1,
      title: "City Contract Register",
      public_summary: "Purpose",
      locked: false,
      government_entity_id: 4,
      request_profile_id: CITY_PROFILE_ID,
      fill_payload: { request: { records_description: "All executed vendor contracts and amendments.", department_or_division: "Purchasing", delivery_method: "electronic" } },
    };
    const result = evaluateGoalReadiness({
      goal,
      profileRow: cityProfileRow({ status: "verified", verified_by: "40000000-0000-4000-8000-000000000004", verified_at: "2026-01-01T00:00:00Z" }),
      entityRow: cityEntityRow,
      today: "2026-06-01",
    });
    expect(result.ready).toBe(true);
  });

  it("would have been blocked before this calibration (broad_mode_confirmation on, no dates)", () => {
    const goal = {
      id: 1,
      title: "City Contract Register",
      public_summary: "Purpose",
      locked: false,
      government_entity_id: 4,
      request_profile_id: CITY_PROFILE_ID,
      fill_payload: { request: { records_description: "All executed vendor contracts and amendments.", department_or_division: "Purchasing", delivery_method: "electronic" } },
    };
    const result = evaluateGoalReadiness({
      goal,
      profileRow: cityProfileRow({
        status: "verified",
        verified_by: "40000000-0000-4000-8000-000000000004",
        verified_at: "2026-01-01T00:00:00Z",
        validation_schema: { ...VALIDATION_SCHEMA, scope_warnings: { broad_mode_confirmation: true } },
      }),
      entityRow: cityEntityRow,
      today: "2026-06-01",
    });
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.code).toBe("BROAD_SCOPE_UNRESOLVED");
  });
});

describe("profile status remains draft in the migration", () => {
  it("never sets either profile to verified", () => {
    expect(migrationSql).not.toMatch(/status\s*=\s*'verified'/i);
  });

  it("never sets verified_by or verified_at", () => {
    expect(migrationSql).not.toMatch(/verified_by\s*=/i);
    expect(migrationSql).not.toMatch(/verified_at\s*=/i);
  });

  it("targets the exact live City and Police profile UUIDs", () => {
    expect(migrationSql).toContain(CITY_PROFILE_ID);
    expect(migrationSql).toContain(POLICE_PROFILE_ID);
  });

  it("includes a precondition guard that raises an exception on mismatch", () => {
    expect(migrationSql).toMatch(/raise exception/i);
  });

  it("retains rollback-on-precondition-failure behavior: every raise exception lives inside the single transaction before commit", () => {
    const beginIndex = migrationSql.indexOf("begin;");
    const commitIndex = migrationSql.indexOf("commit;");
    const raiseMatches = [...migrationSql.matchAll(/raise exception/gi)];

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(commitIndex).toBeGreaterThan(beginIndex);
    expect(raiseMatches.length).toBeGreaterThanOrEqual(10);
    for (const match of raiseMatches) {
      expect(match.index).toBeGreaterThan(beginIndex);
      expect(match.index).toBeLessThan(commitIndex);
    }
  });
});

describe("validation_schema is preserved, not replaced, in the migration", () => {
  it("never wholesale-replaces validation_schema with jsonb_build_object", () => {
    expect(migrationSql).not.toMatch(/validation_schema\s*=\s*jsonb_build_object/i);
  });

  it("changes validation_schema only via a narrow jsonb_set targeting scope_warnings.broad_mode_confirmation, once per profile", () => {
    const narrowUpdates = [
      ...migrationSql.matchAll(
        /jsonb_set\(\s*validation_schema,\s*'\{scope_warnings,broad_mode_confirmation\}',\s*'false'::jsonb/gi,
      ),
    ];
    expect(narrowUpdates).toHaveLength(2);
  });

  it("never replaces the whole scope_warnings object (which would delete maximum_record_labels/maximum_date_span_days)", () => {
    expect(migrationSql).not.toMatch(/jsonb_set\(\s*validation_schema,\s*'\{scope_warnings\}'/i);
    expect(migrationSql).not.toMatch(/'scope_warnings',\s*jsonb_build_object/i);
  });

  it("never writes required_paths or rules (only reads them for the verification report), so the live records_description/delivery_method required_paths and string_length rules survive untouched", () => {
    // jsonb_set's second argument is a '{path,segments}' array literal; a
    // write to required_paths or rules would show up as one of these path
    // literals. Reading them back for the diagnostic SELECT at the end
    // (validation_schema -> 'required_paths') is fine and expected.
    expect(migrationSql).not.toMatch(/'\{required_paths\}'/i);
    expect(migrationSql).not.toMatch(/'\{rules\}'/i);
    expect(migrationSql).not.toMatch(/'required_paths'\s*,\s*jsonb_build_array/i);
    expect(migrationSql).not.toMatch(/'rules'\s*,\s*jsonb_build_array/i);
  });

  it("includes precondition checks that validation_schema and scope_warnings are JSON objects before the update", () => {
    const typeofChecks = [...migrationSql.matchAll(/jsonb_typeof\(v_validation_schema\)/gi)];
    const scopeWarningsTypeofChecks = [
      ...migrationSql.matchAll(/jsonb_typeof\(v_validation_schema\s*->\s*'scope_warnings'\)/gi),
    ];
    expect(typeofChecks.length).toBeGreaterThanOrEqual(2);
    expect(scopeWarningsTypeofChecks.length).toBeGreaterThanOrEqual(2);
  });
});

describe("field length limits are retained in the replacement field_schema", () => {
  it.each([
    ["Type Dept", 200],
    ["Description of Request", 12000],
  ])("City %s keeps max_length %d", (pdfField, maxLength) => {
    const pattern = new RegExp(`'pdf_field',\\s*'${pdfField}'.*?'max_length',\\s*${maxLength}\\b`);
    expect(migrationSql).toMatch(pattern);
  });

  it.each([
    ["Other Records", 200],
    ["Date of Event", 10],
    ["Request Description", 12000],
  ])("Police %s keeps max_length %d", (pdfField, maxLength) => {
    const pattern = new RegExp(`'pdf_field',\\s*'${pdfField}'.*?'max_length',\\s*${maxLength}\\b`);
    expect(migrationSql).toMatch(pattern);
  });
});

describe("goal records_description values are untouched by the migration", () => {
  it("the City goal merge sets only department_or_division and delivery_method", () => {
    expect(migrationSql).toContain(
      "jsonb_build_object('department_or_division', 'Purchasing', 'delivery_method', 'electronic')",
    );
  });

  it("the Police goal merges set only record_category_label and delivery_method", () => {
    expect(migrationSql).toContain(
      "jsonb_build_object('record_category_label', 'Contracts', 'delivery_method', 'electronic')",
    );
  });

  it("no fill_payload merge object mentions records_description", () => {
    const mergeObjects = [
      ...migrationSql.matchAll(/coalesce\(fill_payload -> 'request', '\{\}'::jsonb\)\s*\|\|\s*jsonb_build_object\([^)]*\)/g),
    ];
    expect(mergeObjects.length).toBeGreaterThanOrEqual(2);
    for (const match of mergeObjects) {
      expect(match[0]).not.toContain("records_description");
    }
  });
});

describe("continuation behavior remains unchanged", () => {
  it("neither Murfreesboro profile declares a continuation profile, so the existing continuation gate never fires for them", () => {
    const cityResult = evaluateGoalReadiness({
      goal: {
        title: "City Contract Register",
        public_summary: "Purpose",
        locked: false,
        government_entity_id: 4,
        request_profile_id: CITY_PROFILE_ID,
        fill_payload: { request: { records_description: "All executed vendor contracts and amendments.", department_or_division: "Purchasing", delivery_method: "electronic" } },
      },
      profileRow: cityProfileRow({ status: "verified", verified_by: "40000000-0000-4000-8000-000000000004", verified_at: "2026-01-01T00:00:00Z" }),
      entityRow: cityEntityRow,
      today: "2026-06-01",
    });
    expect(cityResult.ready).toBe(true);

    // An overlay profile that *does* declare a continuation profile is
    // still rejected — the gate itself is untouched by this change.
    const overlayWithContinuation = evaluateGoalReadiness({
      goal: {
        title: "Some overlay goal",
        public_summary: "Purpose",
        locked: false,
        government_entity_id: 4,
        request_profile_id: "60000000-0000-4000-8000-000000000006",
        fill_payload: { request: { records_description: "All executed vendor contracts and amendments.", delivery_method: "electronic" } },
      },
      profileRow: cityProfileRow({
        id: "60000000-0000-4000-8000-000000000006",
        renderer_type: "overlay",
        continuation_profile_id: "70000000-0000-4000-8000-000000000007",
        status: "verified",
        verified_by: "40000000-0000-4000-8000-000000000004",
        verified_at: "2026-01-01T00:00:00Z",
        field_schema: {
          schema_version: 1,
          renderer_type: "overlay",
          fields: [
            { source: "request.records_description", page: 0, x: 0, y: 0, width: 100, height: 100, font_key: "body", font_size: 10, line_height: 12, max_lines: 5, required: true, overflow: "continuation", continuation_label: "See attached." },
          ],
        },
      }),
      entityRow: cityEntityRow,
      today: "2026-06-01",
    });
    expect(overlayWithContinuation.ready).toBe(false);
    if (!overlayWithContinuation.ready) expect(overlayWithContinuation.code).toBe("CONTINUATION_NOT_SUPPORTED");
  });
});
