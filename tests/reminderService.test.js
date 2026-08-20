import test from "node:test";
import assert from "node:assert/strict";
import {
  REMINDER_BACKEND_AVAILABLE,
  requestChapterReminder,
} from "../src/features/document-request/reminderService.js";

const TEST_EMAIL = "example-subscriber@test.invalid";

test("Reminder Service - truthful unavailability", async (t) => {
  await t.test("reports the backend as unavailable", () => {
    assert.strictEqual(REMINDER_BACKEND_AVAILABLE, false);
  });

  await t.test("never claims a reminder was scheduled for a well-formed request", () => {
    const result = requestChapterReminder({
      email: TEST_EMAIL,
      countyId: 10,
      goalId: 42,
      requestProfileId: "20000000-0000-4000-8000-000000000002",
      consentedAt: new Date("2026-08-20T00:00:00Z").toISOString(),
    });

    assert.strictEqual(result.scheduled, false);
    assert.strictEqual(result.reason, "backend_unavailable");
  });
});

test("Reminder Service - input validation", async (t) => {
  await t.test("rejects a missing email without pretending to schedule anything", () => {
    const result = requestChapterReminder({
      email: "",
      countyId: 10,
      goalId: 42,
      requestProfileId: "20000000-0000-4000-8000-000000000002",
      consentedAt: new Date().toISOString(),
    });

    assert.strictEqual(result.scheduled, false);
    assert.strictEqual(result.reason, "invalid_request");
  });

  await t.test("rejects a missing county, goal, or profile id", () => {
    const base = {
      email: TEST_EMAIL,
      countyId: 10,
      goalId: 42,
      requestProfileId: "20000000-0000-4000-8000-000000000002",
      consentedAt: new Date().toISOString(),
    };

    for (const key of ["countyId", "goalId", "requestProfileId", "consentedAt"]) {
      const result = requestChapterReminder({ ...base, [key]: undefined });
      assert.strictEqual(result.scheduled, false, `expected no schedule when ${key} is missing`);
      assert.strictEqual(result.reason, "invalid_request");
    }
  });
});
