import { describe, expect, it } from "vitest";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { extractFunctionInvokeError } from "./functionInvokeErrors";

function httpError(status, jsonBody) {
  return new FunctionsHttpError(new Response(JSON.stringify(jsonBody), { status }));
}

describe("extractFunctionInvokeError: FunctionsHttpError — reads the real JSON body via .context, not .message", () => {
  it("a FunctionsHttpError's own .message is always the generic SDK string — proves this must read .context instead", () => {
    const error = httpError(403, { error: "This goal has no linked government entity." });
    expect(error.message).toBe("Edge Function returned a non-2xx status code");
  });

  it("extracts the function's own safe error message from the JSON body", async () => {
    const result = await extractFunctionInvokeError(httpError(403, { error: "This goal has no linked government entity." }));
    expect(result.message).toBe("This goal has no linked government entity.");
    expect(result.known).toBe(true);
  });

  it("defaults retryable to true when the body doesn't specify it", async () => {
    const result = await extractFunctionInvokeError(httpError(403, { error: "This goal is locked and cannot receive resources." }));
    expect(result.retryable).toBe(true);
  });

  it("respects an explicit retryable: false in the body", async () => {
    const result = await extractFunctionInvokeError(
      httpError(500, { error: "The document could not be completed, and the uploaded copy could not be fully rolled back. Contact an administrator.", retryable: false }),
    );
    expect(result.retryable).toBe(false);
  });

  it("respects an explicit retryable: true in the body", async () => {
    const result = await extractFunctionInvokeError(httpError(400, { error: "Some transient DB error.", retryable: true }));
    expect(result.retryable).toBe(true);
  });

  it("falls back to a safe generic message for a non-JSON body (e.g. a raw gateway HTML error page), never surfacing raw HTML", async () => {
    const error = new FunctionsHttpError(new Response("<html><body>502 Bad Gateway</body></html>", { status: 502 }));
    const result = await extractFunctionInvokeError(error);
    expect(result.message).toBe("This could not be completed right now. Please try again.");
    expect(result.message).not.toMatch(/<html>/i);
    expect(result.known).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it("falls back to the generic message when the JSON body has no 'error' field", async () => {
    const result = await extractFunctionInvokeError(httpError(500, { message: "wrong field name" }));
    expect(result.message).toBe("This could not be completed right now. Please try again.");
    expect(result.known).toBe(false);
  });

  it("falls back to the generic message when 'error' is present but empty/whitespace", async () => {
    const result = await extractFunctionInvokeError(httpError(400, { error: "   " }));
    expect(result.message).toBe("This could not be completed right now. Please try again.");
  });

  it("works the same way for a FunctionsRelayError, whose .context is also the raw Response", async () => {
    const error = new FunctionsRelayError(new Response(JSON.stringify({ error: "Relay could not reach the function." }), { status: 546 }));
    const result = await extractFunctionInvokeError(error);
    expect(result.message).toBe("Relay could not reach the function.");
    expect(result.known).toBe(true);
  });
});

describe("extractFunctionInvokeError: FunctionsFetchError — a genuine network failure, no response body exists at all", () => {
  it("gives a readable network-specific fallback, not the generic 'try again' message", async () => {
    const error = new FunctionsFetchError({ message: "fetch failed" });
    const result = await extractFunctionInvokeError(error);
    expect(result.message).toBe("A network error occurred while contacting the server. Check your connection and try again.");
    expect(result.retryable).toBe(true);
    expect(result.known).toBe(false);
  });
});

describe("extractFunctionInvokeError: degrades safely for anything else", () => {
  it("a null/undefined error still returns a safe fallback rather than throwing", async () => {
    const result = await extractFunctionInvokeError(null);
    expect(result.message).toBe("This could not be completed right now. Please try again.");
  });

  it("an unrecognized error shape (not one of the three FunctionsError subclasses) still returns a safe fallback", async () => {
    const result = await extractFunctionInvokeError(new Error("some unrelated JS error"));
    expect(result.message).toBe("This could not be completed right now. Please try again.");
    expect(result.known).toBe(false);
  });
});
