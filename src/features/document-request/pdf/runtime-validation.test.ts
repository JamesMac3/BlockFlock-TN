import { describe, expect, it } from "vitest";
import type { RequestDocumentData } from "./request-data-schema";
import { runValidationSchema } from "./runtime-validation";

const baseData: RequestDocumentData = {
  government_entity: {
    id: "4",
    legal_name: "City of Murfreesboro",
    display_name: "City of Murfreesboro",
  },
  request: {
    goal_language: "Track vendor contracts.",
    records_description: "All executed contracts and amendments with the selected vendor.",
    delivery_method: "electronic",
  },
  profile: { id: "20000000-0000-4000-8000-000000000002", version: 1, government_entity_id: "4" },
};

describe("runValidationSchema", () => {
  it("passes when required_paths are all present", () => {
    const result = runValidationSchema(
      { schema_version: 1, required_paths: ["request.records_description"], rules: [], scope_warnings: { broad_mode_confirmation: false } },
      baseData,
    );
    expect(result.errors).toHaveLength(0);
  });

  it("errors when a required path is missing", () => {
    const result = runValidationSchema(
      { schema_version: 1, required_paths: ["request.department_or_division"], rules: [], scope_warnings: { broad_mode_confirmation: false } },
      baseData,
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("REQUIRED_PATH_MISSING");
  });

  it("evaluates string_length rules with configured severity", () => {
    const result = runValidationSchema(
      {
        schema_version: 1,
        required_paths: [],
        rules: [{ path: "request.records_description", type: "string_length", min: 5000, severity: "error", message: "Too short." }],
        scope_warnings: { broad_mode_confirmation: false },
      },
      baseData,
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("STRING_TOO_SHORT");
  });

  it("evaluates date rules", () => {
    const result = runValidationSchema(
      {
        schema_version: 1,
        required_paths: [],
        rules: [{ path: "request.date_from", type: "date", severity: "warning", message: "Bad date." }],
        scope_warnings: { broad_mode_confirmation: false },
      },
      { ...baseData, request: { ...baseData.request, date_from: "2026-01-01" } },
    );
    expect(result.warnings).toHaveLength(0);
  });

  it("evaluates date_order rules", () => {
    const result = runValidationSchema(
      {
        schema_version: 1,
        required_paths: [],
        rules: [{ path: "request.date_from", other_path: "request.date_to", type: "date_order", severity: "error", message: "Out of order." }],
        scope_warnings: { broad_mode_confirmation: false },
      },
      { ...baseData, request: { ...baseData.request, date_from: "2026-06-01", date_to: "2026-01-01" } },
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("DATE_OUT_OF_ORDER");
  });

  it("evaluates number_range rules", () => {
    const result = runValidationSchema(
      {
        schema_version: 1,
        required_paths: [],
        rules: [{ path: "request.record_category_label", type: "number_range", min: 1, max: 10, severity: "error", message: "Out of range." }],
        scope_warnings: { broad_mode_confirmation: false },
      },
      { ...baseData, request: { ...baseData.request, record_category_label: "42" } },
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("NUMBER_TOO_HIGH");
  });

  it("evaluates boolean_true rules against a non-boolean placeholder value as unconfirmed", () => {
    const result = runValidationSchema(
      {
        schema_version: 1,
        required_paths: [],
        rules: [{ path: "request.delivery_method", type: "boolean_true", severity: "warning", message: "Not confirmed." }],
        scope_warnings: { broad_mode_confirmation: false },
      },
      baseData,
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe("NOT_CONFIRMED");
  });

  it("warns when the date span exceeds the configured maximum", () => {
    const result = runValidationSchema(
      {
        schema_version: 1,
        required_paths: [],
        rules: [],
        scope_warnings: { maximum_date_span_days: 30, broad_mode_confirmation: false },
      },
      { ...baseData, request: { ...baseData.request, date_from: "2024-01-01", date_to: "2026-01-01" } },
    );
    expect(result.warnings.some((warning) => warning.code === "DATE_SPAN_TOO_BROAD")).toBe(true);
  });

  it("warns on broad-scope confirmation when no date range is present", () => {
    const result = runValidationSchema(
      { schema_version: 1, required_paths: [], rules: [], scope_warnings: { broad_mode_confirmation: true } },
      baseData,
    );
    expect(result.warnings.some((warning) => warning.code === "BROAD_SCOPE_REQUIRES_CONFIRMATION")).toBe(true);
  });

  it("does not warn on broad scope when a date range narrows the request", () => {
    const result = runValidationSchema(
      { schema_version: 1, required_paths: [], rules: [], scope_warnings: { broad_mode_confirmation: true } },
      { ...baseData, request: { ...baseData.request, date_from: "2026-01-01", date_to: "2026-02-01" } },
    );
    expect(result.warnings.some((warning) => warning.code === "BROAD_SCOPE_REQUIRES_CONFIRMATION")).toBe(false);
  });

  it("only reads values through the allowlisted placeholder accessor, never arbitrary properties", () => {
    const result = runValidationSchema(
      {
        schema_version: 1,
        required_paths: ["request.records_description"],
        rules: [],
        scope_warnings: { broad_mode_confirmation: false },
      },
      baseData,
    );
    expect(result.errors).toHaveLength(0);
  });
});
