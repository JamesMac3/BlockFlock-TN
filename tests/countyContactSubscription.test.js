import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidEmail,
  normalizeEmail,
  subscribeToCountyUpdates,
} from "../src/features/document-request/countyContactSubscription.js";

// Deliberately not a real contact address.
const TEST_EMAIL = "example-subscriber@test.invalid";

function fakeSupabase(insertResult) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.strictEqual(table, "county_contacts");
      return {
        async insert(row) {
          calls.push(row);
          return insertResult;
        },
      };
    },
  };
}

test("County Contact Subscription - email normalization", async (t) => {
  await t.test("trims and lowercases the address", () => {
    assert.strictEqual(normalizeEmail("  EXAMPLE@Test.INVALID  "), "example@test.invalid");
  });

  await t.test("returns an empty string for non-string input", () => {
    assert.strictEqual(normalizeEmail(undefined), "");
    assert.strictEqual(normalizeEmail(null), "");
  });

  await t.test("validates a well-formed email", () => {
    assert.strictEqual(isValidEmail("example@test.invalid"), true);
    assert.strictEqual(isValidEmail("not-an-email"), false);
    assert.strictEqual(isValidEmail(""), false);
  });
});

test("County Contact Subscription - insert shape", async (t) => {
  await t.test("inserts normalized email, county_id, and phone: null (never fill_payload/PDF fields)", async () => {
    const supabase = fakeSupabase({ error: null });
    const result = await subscribeToCountyUpdates({ supabase, countyId: 10, email: "  EXAMPLE@Test.INVALID  " });

    assert.strictEqual(result.subscribed, true);
    assert.strictEqual(supabase.calls.length, 1);
    assert.deepStrictEqual(supabase.calls[0], {
      email: "example@test.invalid",
      county_id: 10,
      phone: null,
    });
  });

  await t.test("rejects an invalid email without inserting", async () => {
    const supabase = fakeSupabase({ error: null });
    const result = await subscribeToCountyUpdates({ supabase, countyId: 10, email: "not-an-email" });

    assert.strictEqual(result.subscribed, false);
    assert.strictEqual(supabase.calls.length, 0);
  });

  await t.test("rejects a missing county without inserting", async () => {
    const supabase = fakeSupabase({ error: null });
    const result = await subscribeToCountyUpdates({ supabase, countyId: null, email: TEST_EMAIL });

    assert.strictEqual(result.subscribed, false);
    assert.strictEqual(supabase.calls.length, 0);
  });
});

test("County Contact Subscription - duplicate handling", async (t) => {
  await t.test("treats Postgres unique-violation 23505 as a success, not an error", async () => {
    const supabase = fakeSupabase({ error: { code: "23505", message: "duplicate key value" } });
    const result = await subscribeToCountyUpdates({ supabase, countyId: 10, email: TEST_EMAIL });

    assert.strictEqual(result.subscribed, true);
    assert.strictEqual(result.error, undefined);
  });

  await t.test("a genuine insert failure is reported without blocking on subscription semantics", async () => {
    const supabase = fakeSupabase({ error: { code: "42501", message: "permission denied" } });
    const result = await subscribeToCountyUpdates({ supabase, countyId: 10, email: TEST_EMAIL });

    assert.strictEqual(result.subscribed, false);
    assert.strictEqual(typeof result.error, "string");
  });

  await t.test("new and existing subscriptions return the same shape (no reveal of prior registration)", async () => {
    const freshSupabase = fakeSupabase({ error: null });
    const duplicateSupabase = fakeSupabase({ error: { code: "23505", message: "duplicate key value" } });

    const fresh = await subscribeToCountyUpdates({ supabase: freshSupabase, countyId: 10, email: TEST_EMAIL });
    const duplicate = await subscribeToCountyUpdates({ supabase: duplicateSupabase, countyId: 10, email: TEST_EMAIL });

    assert.deepStrictEqual(fresh, duplicate);
  });
});

test("County Contact Subscription - PDF access independence", async (t) => {
  await t.test("a subscription failure result never carries a flag that would block PDF access", async () => {
    const supabase = fakeSupabase({ error: { code: "42501", message: "permission denied" } });
    const result = await subscribeToCountyUpdates({ supabase, countyId: 10, email: TEST_EMAIL });

    // The delivery panel renders the PDF link unconditionally; this only
    // documents that the subscription result carries no such gate.
    assert.strictEqual("subscribed" in result, true);
    assert.strictEqual(Object.keys(result).every((key) => ["subscribed", "error"].includes(key)), true);
  });
});
