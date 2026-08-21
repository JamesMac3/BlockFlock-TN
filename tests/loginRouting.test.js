import test from "node:test";
import assert from "node:assert/strict";
import { resolvePostLoginDestination } from "../src/features/portal-admin/loginRouting.js";

test("an admin account routes to the admin dashboard", () => {
  const profile = { account: { role: "admin" }, assignedCounty: null };
  assert.equal(resolvePostLoginDestination({ profile }), "admin");
});

test("a chapter_master account routes to the chapter dashboard", () => {
  const profile = { account: { role: "chapter_master", county_id: 4 }, assignedCounty: { id: 4 } };
  assert.equal(resolvePostLoginDestination({ profile }), "chapter");
});

test("a revoked (suspended) account routes to access-revoked", () => {
  assert.equal(resolvePostLoginDestination({ profile: { revoked: true } }), "access-revoked");
});

test("no valid portal profile is a generic failure (nonexistent account, wrong password never reaching this stage, or an unsupported role)", () => {
  assert.equal(resolvePostLoginDestination({ profile: null }), "failed");
});

test("an authenticated user with an unrecognized role is a generic failure, never a distinct message", () => {
  const profile = { account: { role: "unexpected_role" }, assignedCounty: null };
  assert.equal(resolvePostLoginDestination({ profile }), "failed");
});
