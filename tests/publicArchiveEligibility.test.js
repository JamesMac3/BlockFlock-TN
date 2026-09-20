import test from "node:test";
import assert from "node:assert/strict";
import { isGoalPubliclyArchived } from "../src/features/document-request/publicArchiveEligibility.js";

function goal(overrides) {
  return { is_public: true, locked: false, status: "published", ...overrides };
}

test("a public, unlocked, published goal is eligible", () => {
  assert.equal(isGoalPubliclyArchived(goal({ status: "published" })), true);
});

test("ready and received are also eligible statuses, matching get_public_archive_goal's own gate", () => {
  assert.equal(isGoalPubliclyArchived(goal({ status: "ready" })), true);
  assert.equal(isGoalPubliclyArchived(goal({ status: "received" })), true);
});

test("draft, profile_needed, requested, unavailable, and retired are never eligible", () => {
  for (const status of ["draft", "profile_needed", "requested", "unavailable", "retired"]) {
    assert.equal(isGoalPubliclyArchived(goal({ status })), false, `status ${status} should not be eligible`);
  }
});

test("a locked goal is never eligible, even if otherwise public and published", () => {
  assert.equal(isGoalPubliclyArchived(goal({ locked: true })), false);
});

test("a non-public goal is never eligible, even if otherwise unlocked and published", () => {
  assert.equal(isGoalPubliclyArchived(goal({ is_public: false })), false);
});

test("is_public must be exactly true — undefined (not selected by a caller's query) is treated as ineligible, never assumed", () => {
  assert.equal(isGoalPubliclyArchived(goal({ is_public: undefined })), false);
});

test("a missing goal is never eligible", () => {
  assert.equal(isGoalPubliclyArchived(null), false);
  assert.equal(isGoalPubliclyArchived(undefined), false);
});
