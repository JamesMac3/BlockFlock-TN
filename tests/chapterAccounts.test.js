import test from "node:test";
import assert from "node:assert/strict";
import {
  describeAccountState,
  describePostApprovalBehavior,
  normalizeForwardingEmail,
} from "../src/features/portal-admin/chapterAccounts.js";

test("trusted = active status and review_required false", () => {
  assert.deepEqual(describeAccountState({ status: "active", review_required: false }), { state: "trusted", label: "Trusted" });
});

test("restricted = active status and review_required true", () => {
  assert.deepEqual(describeAccountState({ status: "active", review_required: true }), { state: "restricted", label: "Restricted" });
});

test("suspended overrides review_required entirely", () => {
  assert.deepEqual(describeAccountState({ status: "suspended", review_required: false }), { state: "suspended", label: "Suspended" });
  assert.deepEqual(describeAccountState({ status: "suspended", review_required: true }), { state: "suspended", label: "Suspended" });
});

test("post approval behavior matches the account state", () => {
  assert.equal(describePostApprovalBehavior({ status: "active", review_required: false }), "Publishes immediately");
  assert.equal(describePostApprovalBehavior({ status: "active", review_required: true }), "Requires admin review");
  assert.equal(describePostApprovalBehavior({ status: "suspended", review_required: false }), "No access (suspended)");
});

test("forwarding email is normalized to trimmed lowercase", () => {
  assert.equal(normalizeForwardingEmail("  Chief@Example.COM  "), "chief@example.com");
});

test("forwarding email rejects an invalid shape", () => {
  assert.throws(() => normalizeForwardingEmail("not-an-email"));
  assert.throws(() => normalizeForwardingEmail(""));
});
