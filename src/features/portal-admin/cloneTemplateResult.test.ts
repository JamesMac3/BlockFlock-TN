import { describe, expect, it, vi } from "vitest";
import {
  cloneTemplateToCounty,
  describeCloneTemplateError,
  formatCloneResultMessage,
  normalizeCloneId,
  parseCloneTemplateResult,
  type RpcClient,
} from "./cloneTemplateResult";

describe("normalizeCloneId", () => {
  it("accepts a positive safe-integer number", () => {
    expect(normalizeCloneId(42)).toBe(42);
  });

  it("accepts a positive integer string (bigint returned as text)", () => {
    expect(normalizeCloneId("42")).toBe(42);
    expect(normalizeCloneId(" 42 ")).toBe(42);
  });

  it("rejects zero, negative, non-integer, and non-numeric values", () => {
    expect(normalizeCloneId(0)).toBeNull();
    expect(normalizeCloneId(-5)).toBeNull();
    expect(normalizeCloneId(1.5)).toBeNull();
    expect(normalizeCloneId("abc")).toBeNull();
    expect(normalizeCloneId(null)).toBeNull();
    expect(normalizeCloneId(undefined)).toBeNull();
    expect(normalizeCloneId({})).toBeNull();
  });
});

describe("parseCloneTemplateResult", () => {
  it("accepts the documented single-object shape for created: true", () => {
    const result = parseCloneTemplateResult({ created: true, goal_id: 501, county_id: 10, template_id: 3 });
    expect(result).toEqual({ created: true, goalId: 501, countyId: 10, templateId: 3 });
  });

  it("accepts the documented single-object shape for created: false (already existed)", () => {
    const result = parseCloneTemplateResult({ created: false, goal_id: 501, county_id: 10, template_id: 3 });
    expect(result).toEqual({ created: false, goalId: 501, countyId: 10, templateId: 3 });
  });

  it("accepts bigint IDs returned as numeric strings", () => {
    const result = parseCloneTemplateResult({ created: true, goal_id: "501", county_id: "10", template_id: "3" });
    expect(result).toEqual({ created: true, goalId: 501, countyId: 10, templateId: 3 });
  });

  it("rejects an array response (never a row set)", () => {
    expect(parseCloneTemplateResult([{ created: true, goal_id: 501, county_id: 10, template_id: 3 }])).toBeNull();
  });

  it("rejects a bare integer response", () => {
    expect(parseCloneTemplateResult(501)).toBeNull();
  });

  it("rejects a full goal row instead of the clone-result shape", () => {
    expect(
      parseCloneTemplateResult({
        id: 501,
        county_id: 10,
        title: "Birth Certificate Request",
        status: "profile_needed",
        is_public: false,
      })
    ).toBeNull();
  });

  it("rejects a response missing a required field", () => {
    expect(parseCloneTemplateResult({ created: true, county_id: 10, template_id: 3 })).toBeNull();
  });

  it("rejects null/undefined", () => {
    expect(parseCloneTemplateResult(null)).toBeNull();
    expect(parseCloneTemplateResult(undefined)).toBeNull();
  });
});

describe("describeCloneTemplateError", () => {
  it("maps every documented error code to a specific message", () => {
    expect(describeCloneTemplateError({ code: "22023" })).toMatch(/must both be selected/);
    expect(describeCloneTemplateError({ code: "P0002" })).toMatch(/county could not be found|template is missing or inactive/);
    expect(describeCloneTemplateError({ code: "42501" })).toMatch(/not authorized/);
    expect(describeCloneTemplateError({ code: "28000" })).toMatch(/session has expired/);
    expect(describeCloneTemplateError({ code: "40001" })).toMatch(/changed while cloning/);
  });

  it("maps a network-shaped message when the code is unrecognized", () => {
    expect(describeCloneTemplateError({ message: "Failed to fetch" })).toMatch(/network error/i);
  });

  it("falls back to the raw message, then a generic message, for anything else", () => {
    expect(describeCloneTemplateError({ message: "Something unusual happened" })).toBe("Something unusual happened");
    expect(describeCloneTemplateError({})).toBe("The template could not be cloned. Please try again.");
    expect(describeCloneTemplateError(null)).toBe("The template could not be cloned. Please try again.");
  });
});

describe("formatCloneResultMessage", () => {
  it("reports a new goal", () => {
    expect(formatCloneResultMessage({ created: true, goalId: 1, countyId: 2, templateId: 3 }, "Wilson County")).toBe(
      "Goal added to Wilson County."
    );
  });

  it("reports an already-existing goal", () => {
    expect(formatCloneResultMessage({ created: false, goalId: 1, countyId: 2, templateId: 3 }, "Wilson County")).toBe(
      "This template already exists in Wilson County."
    );
  });
});

describe("cloneTemplateToCounty (RPC call site)", () => {
  it("calls rrg_clone_template_to_county with exactly p_county_id and p_template_id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { created: true, goal_id: 501, county_id: 10, template_id: 3 }, error: null });
    const client: RpcClient = { rpc };

    await cloneTemplateToCounty(client, { countyId: 10, templateId: 3 });

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fnName, args] = rpc.mock.calls[0];
    expect(fnName).toBe("rrg_clone_template_to_county");
    expect(args).toEqual({ p_county_id: 10, p_template_id: 3 });
    expect(Object.keys(args).sort()).toEqual(["p_county_id", "p_template_id"]);
  });

  it("returns the parsed result for created: true", async () => {
    const client: RpcClient = {
      rpc: vi.fn().mockResolvedValue({ data: { created: true, goal_id: 501, county_id: 10, template_id: 3 }, error: null }),
    };

    const outcome = await cloneTemplateToCounty(client, { countyId: 10, templateId: 3 });
    expect(outcome).toEqual({ result: { created: true, goalId: 501, countyId: 10, templateId: 3 } });
  });

  it("returns the parsed result for created: false (existing goal preserved)", async () => {
    const client: RpcClient = {
      rpc: vi.fn().mockResolvedValue({ data: { created: false, goal_id: 501, county_id: 10, template_id: 3 }, error: null }),
    };

    const outcome = await cloneTemplateToCounty(client, { countyId: 10, templateId: 3 });
    expect(outcome).toEqual({ result: { created: false, goalId: 501, countyId: 10, templateId: 3 } });
  });

  it("checks error before ever touching data — an error response never falls through to result parsing", async () => {
    const client: RpcClient = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } }),
    };

    const outcome = await cloneTemplateToCounty(client, { countyId: 10, templateId: 3 });
    expect(outcome.error).toMatch(/not authorized/);
    expect(outcome.result).toBeUndefined();
  });

  it("reports a clear error when the RPC succeeds but the response is not the documented shape", async () => {
    const client: RpcClient = {
      rpc: vi.fn().mockResolvedValue({ data: [{ created: true, goal_id: 501, county_id: 10, template_id: 3 }], error: null }),
    };

    const outcome = await cloneTemplateToCounty(client, { countyId: 10, templateId: 3 });
    expect(outcome.result).toBeUndefined();
    expect(outcome.error).toMatch(/not in the expected format/);
  });

  it("surfaces the 40001 retry case distinctly", async () => {
    const client: RpcClient = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "40001", message: "could not serialize access" } }),
    };

    const outcome = await cloneTemplateToCounty(client, { countyId: 10, templateId: 3 });
    expect(outcome.error).toMatch(/try again/i);
  });
});
