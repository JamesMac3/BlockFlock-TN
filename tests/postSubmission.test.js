import test from "node:test";
import assert from "node:assert/strict";
import { resolvePostSubmission, canManageGoalsRegardlessOfTrust } from "../src/features/portal-admin/postSubmission.js";

const chapterUserId = "chapter-uuid";
const otherUserId = "other-uuid";

function chapterActor(overrides = {}) {
  return { role: "chapter_master", status: "active", user_id: chapterUserId, county_id: 4, review_required: false, ...overrides };
}

function adminActor(overrides = {}) {
  return { role: "admin", status: "active", user_id: "admin-uuid", county_id: null, ...overrides };
}

function post(overrides = {}) {
  return { status: "draft", author_user_id: chapterUserId, county_id: 4, ...overrides };
}

test("trusted chapter master publishes immediately (approved)", () => {
  const result = resolvePostSubmission({ actor: chapterActor({ review_required: false }), post: post() });
  assert.deepEqual(result, { allowed: true, targetStatus: "approved" });
});

test("restricted chapter master is routed to pending review", () => {
  const result = resolvePostSubmission({ actor: chapterActor({ review_required: true }), post: post() });
  assert.deepEqual(result, { allowed: true, targetStatus: "pending" });
});

test("admin always publishes directly, including approving a pending or rejected post", () => {
  for (const status of ["draft", "pending", "rejected"]) {
    const result = resolvePostSubmission({ actor: adminActor(), post: post({ status, author_user_id: otherUserId }) });
    assert.deepEqual(result, { allowed: true, targetStatus: "approved" });
  }
});

test("a chapter master may resubmit a rejected post", () => {
  const result = resolvePostSubmission({ actor: chapterActor(), post: post({ status: "rejected" }) });
  assert.deepEqual(result, { allowed: true, targetStatus: "approved" });
});

test("a chapter master can never start from pending — only an admin can move pending to approved", () => {
  const result = resolvePostSubmission({ actor: chapterActor(), post: post({ status: "pending" }) });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "INVALID_CURRENT_STATUS");
});

test("a chapter master cannot submit another author's post", () => {
  const result = resolvePostSubmission({ actor: chapterActor(), post: post({ author_user_id: otherUserId }) });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "NOT_AUTHOR");
});

test("a chapter master cannot submit a post outside their own county", () => {
  const result = resolvePostSubmission({ actor: chapterActor({ county_id: 4 }), post: post({ county_id: 5 }) });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "COUNTY_MISMATCH");
});

test("a chapter master cannot submit a global post (no county)", () => {
  const result = resolvePostSubmission({ actor: chapterActor(), post: post({ county_id: null }) });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "COUNTY_MISMATCH");
});

test("a suspended actor is denied outright, regardless of role", () => {
  const result = resolvePostSubmission({ actor: chapterActor({ status: "suspended" }), post: post() });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "NOT_AUTHORIZED");
});

test("an already-approved post cannot be resubmitted by a chapter master", () => {
  const result = resolvePostSubmission({ actor: chapterActor(), post: post({ status: "approved" }) });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "INVALID_CURRENT_STATUS");
});

test("restricted status never affects goal management — only post publication is gated", () => {
  assert.equal(canManageGoalsRegardlessOfTrust({ status: "active" }), true);
  assert.equal(canManageGoalsRegardlessOfTrust({ status: "suspended" }), false);
});
