import { describe, expect, it, vi } from "vitest";
import { subscribeToCountyUpdates, normalizeEmail, isValidEmail } from "./countyContactSubscription.js";

function makeSupabaseMock({ data = { subscribed: true }, error = null } = {}) {
  const invoke = vi.fn().mockResolvedValue({ data, error });
  return { supabase: { functions: { invoke } }, invoke };
}

describe("subscribeToCountyUpdates: token required, correct payload, generic outcomes", () => {
  it("never calls the edge function without a Turnstile token", async () => {
    const { supabase, invoke } = makeSupabaseMock();
    const result = await subscribeToCountyUpdates({ supabase, countyId: 1, email: "a@b.com", turnstileToken: "" });
    expect(result.subscribed).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("never calls the edge function for an invalid email", async () => {
    const { supabase, invoke } = makeSupabaseMock();
    const result = await subscribeToCountyUpdates({ supabase, countyId: 1, email: "not-an-email", turnstileToken: "tok" });
    expect(result.subscribed).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("never calls the edge function without a county", async () => {
    const { supabase, invoke } = makeSupabaseMock();
    const result = await subscribeToCountyUpdates({ supabase, countyId: 0, email: "a@b.com", turnstileToken: "tok" });
    expect(result.subscribed).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("invokes exactly newsletter-subscribe with the normalized email, county_id, and turnstile_token", async () => {
    const { supabase, invoke } = makeSupabaseMock();
    await subscribeToCountyUpdates({ supabase, countyId: 42, email: "  Test@Example.COM  ", turnstileToken: "tok-123" });
    expect(invoke).toHaveBeenCalledWith("newsletter-subscribe", {
      body: { email: "test@example.com", county_id: 42, turnstile_token: "tok-123" },
    });
  });

  it("includes phone only when provided, never a null/empty placeholder", async () => {
    const { supabase, invoke } = makeSupabaseMock();
    await subscribeToCountyUpdates({ supabase, countyId: 42, email: "a@b.com", turnstileToken: "tok", phone: "615-555-0100" });
    expect(invoke).toHaveBeenCalledWith("newsletter-subscribe", {
      body: { email: "a@b.com", county_id: 42, turnstile_token: "tok", phone: "615-555-0100" },
    });

    invoke.mockClear();
    await subscribeToCountyUpdates({ supabase, countyId: 42, email: "a@b.com", turnstileToken: "tok" });
    expect(invoke).toHaveBeenCalledWith("newsletter-subscribe", {
      body: { email: "a@b.com", county_id: 42, turnstile_token: "tok" },
    });
  });

  it("the same email can subscribe to different counties — each call is independent, no client-side global-uniqueness gate", async () => {
    const { supabase, invoke } = makeSupabaseMock();
    const first = await subscribeToCountyUpdates({ supabase, countyId: 1, email: "same@example.com", turnstileToken: "tok" });
    const second = await subscribeToCountyUpdates({ supabase, countyId: 2, email: "same@example.com", turnstileToken: "tok" });
    expect(first.subscribed).toBe(true);
    expect(second.subscribed).toBe(true);
    expect(invoke).toHaveBeenNthCalledWith(1, "newsletter-subscribe", { body: { email: "same@example.com", county_id: 1, turnstile_token: "tok" } });
    expect(invoke).toHaveBeenNthCalledWith(2, "newsletter-subscribe", { body: { email: "same@example.com", county_id: 2, turnstile_token: "tok" } });
  });

  it("treats a duplicate/already-subscribed response identically to a brand-new one — both are the same generic success", async () => {
    const { supabase } = makeSupabaseMock({ data: { subscribed: true }, error: null });
    const result = await subscribeToCountyUpdates({ supabase, countyId: 1, email: "a@b.com", turnstileToken: "tok" });
    expect(result).toEqual({ subscribed: true });
  });

  it("a function error never leaks raw provider/database details to the caller", async () => {
    const { supabase } = makeSupabaseMock({ data: null, error: { message: "duplicate key value violates unique constraint county_contacts_pkey (postgres)" } });
    const result = await subscribeToCountyUpdates({ supabase, countyId: 1, email: "a@b.com", turnstileToken: "tok" });
    expect(result.subscribed).toBe(false);
    expect(result.error).not.toMatch(/postgres|constraint|county_contacts/i);
  });
});

describe("normalizeEmail / isValidEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@Bar.com ")).toBe("foo@bar.com");
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("accepts a well-formed address", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
  });
});
