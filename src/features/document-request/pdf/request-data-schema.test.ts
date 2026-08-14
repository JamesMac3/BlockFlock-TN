import { describe, expect, it } from "vitest";
import { allowedPlaceholderPaths, requestDocumentDataSchema } from "./request-data-schema";
import { PlaceholderResolutionError, resolvePlaceholders } from "./placeholder-resolver";

const input = {
  government_entity: {
    id: "10000000-0000-4000-8000-000000000001",
    legal_name: "Example Tennessee City",
    display_name: "Example City",
  },
  request: {
    goal_language: "Request records documenting the acquisition and operation of the system.",
    records_description: "Contracts, amendments, invoices, policies, and audit records for the selected system.",
    vendor_or_system: "Approved system label",
    department_or_division: "Records Division",
    record_category_label: "Contracts and policies",
    date_from: "2025-01-01",
    date_to: "2026-08-01",
    delivery_method: "electronic" as const,
  },
  profile: {
    id: "20000000-0000-4000-8000-000000000002",
    version: 1,
    government_entity_id: "10000000-0000-4000-8000-000000000001",
  },
};

describe("no-PII request document contract", () => {
  it("accepts only approved non-personal request inputs", () => {
    expect(requestDocumentDataSchema.safeParse(input).success).toBe(true);
  });

  it("rejects requester identity and request-date objects as unknown properties", () => {
    expect(requestDocumentDataSchema.safeParse({ ...input, requester: {} }).success).toBe(false);
    expect(requestDocumentDataSchema.safeParse({
      ...input,
      request: { ...input.request, request_date: "2026-08-06" },
    }).success).toBe(false);
  });

  it("contains no identity or request-date placeholder paths", () => {
    expect(allowedPlaceholderPaths.some((path) => path.startsWith("requester."))).toBe(false);
    expect(allowedPlaceholderPaths).not.toContain("request.request_date");
    expect(allowedPlaceholderPaths).not.toContain("request.request_date_mm_dd_yyyy");
  });

  it.each([
    "{{requester.full_name}}",
    "{{requester.email}}",
    "{{requester.phone}}",
    "{{requester.street_address}}",
    "{{requester.is_tennessee_citizen}}",
    "{{request.request_date}}",
    "{{request.request_date_mm_dd_yyyy}}",
  ])("rejects removed placeholder %s as UNKNOWN_TOKEN", (template) => {
    try {
      resolvePlaceholders(template, input);
      throw new Error("Expected removed placeholder to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PlaceholderResolutionError);
      expect((error as PlaceholderResolutionError).diagnostics[0].code).toBe("UNKNOWN_TOKEN");
    }
  });
});
