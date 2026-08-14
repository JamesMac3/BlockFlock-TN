import { describe, expect, it } from "vitest";
import type { RequestDocumentData } from "./request-data-schema";
import { PlaceholderResolutionError, resolvePlaceholders } from "./placeholder-resolver";

const data: RequestDocumentData = {
  government_entity: {
    id: "10000000-0000-4000-8000-000000000001",
    legal_name: "Example City",
    display_name: "Example City",
  },
  request: {
    goal_language: "Request records documenting the acquisition and operation of the system.",
    records_description: "The executed contract and amendments for the selected system.",
    date_from: "2025-01-02",
    date_to: "2026-08-05",
    delivery_method: "electronic",
  },
  profile: {
    id: "20000000-0000-4000-8000-000000000002",
    version: 1,
    government_entity_id: "10000000-0000-4000-8000-000000000001",
  },
};

function expectCode(action: () => unknown, code: string) {
  try {
    action();
    throw new Error("Expected placeholder resolution to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(PlaceholderResolutionError);
    expect((error as PlaceholderResolutionError).diagnostics.map((item) => item.code)).toContain(code);
  }
}

describe("resolvePlaceholders", () => {
  it("resolves allowlisted values and reports tokens", () => {
    const result = resolvePlaceholders(
      "To {{government_entity.legal_name}}: {{request.goal_language}}",
      data,
    );
    expect(result.text).toBe("To Example City: Request records documenting the acquisition and operation of the system.");
    expect(result.tokens).toEqual([
      "government_entity.legal_name",
      "request.goal_language",
    ]);
  });

  it("preserves repeated tokens", () => {
    expect(resolvePlaceholders("{{request.goal_language}} / {{request.goal_language}}", data).text)
      .toBe(`${data.request.goal_language} / ${data.request.goal_language}`);
  });

  it("formats derived date values", () => {
    expect(resolvePlaceholders(
      "From {{request.date_from_mm_dd_yyyy}} to {{request.date_to_mm_dd_yyyy}}",
      data,
    ).text).toBe("From 01/02/2025 to 08/05/2026");
  });

  it("blocks an absent optional value by default", () => {
    expectCode(() => resolvePlaceholders("{{request.vendor_or_system}}", data), "MISSING_VALUE");
  });

  it("allows an explicit empty-value mode for optional structured lines", () => {
    expect(resolvePlaceholders("{{request.vendor_or_system}}", data, { missing: "empty" }).text).toBe("");
  });

  it.each([
    "{{requester.full_name}}",
    "{{request.request_date}}",
    "{{request.request_date_mm_dd_yyyy}}",
    "{{request.title}}",
    "{{request.__proto__}}",
    "{{request[title]}}",
    "{{ request.goal_language }}",
    "{{request.goal_language || request.records_description}}",
    "{{#request.goal_language}}",
  ])("rejects unknown or expression-like token %s", (template) => {
    expectCode(() => resolvePlaceholders(template, data), "UNKNOWN_TOKEN");
  });

  it.each([
    "{{request.goal_language}",
    "{request.goal_language}}",
    "{{{request.goal_language}}}",
    "{{request.{{goal_language}}}}",
  ])("rejects malformed token braces %s", (template) => {
    expectCode(() => resolvePlaceholders(template, data), "MALFORMED_TOKEN");
  });

  it("rejects placeholder syntax injected through permitted request data", () => {
    const injected: RequestDocumentData = {
      ...data,
      request: { ...data.request, goal_language: "{{request.records_description}}" },
    };
    expectCode(() => resolvePlaceholders("{{request.goal_language}}", injected), "UNSAFE_VALUE");
  });

  it("does not mutate the request data", () => {
    const before = JSON.stringify(data);
    resolvePlaceholders("{{request.goal_language}}", data);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("rejects excessive template length", () => {
    expectCode(() => resolvePlaceholders("x".repeat(50_001), data), "TEMPLATE_TOO_LONG");
  });

  it("rejects excessive token count", () => {
    expectCode(
      () => resolvePlaceholders("{{request.goal_language}}".repeat(251), data),
      "TOO_MANY_TOKENS",
    );
  });
});
