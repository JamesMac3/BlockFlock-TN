import test from "node:test";
import assert from "node:assert/strict";
import { isChapterClaimed } from "../src/utils/chapterStatus.js";

test("true only for chapter_status === 'claimed'", () => {
  assert.equal(isChapterClaimed({ chapter_status: "claimed" }), true);
});

test("false for 'unclaimed'", () => {
  assert.equal(isChapterClaimed({ chapter_status: "unclaimed" }), false);
});

test("false when chapter_status is missing, null, or some other value", () => {
  assert.equal(isChapterClaimed({}), false);
  assert.equal(isChapterClaimed({ chapter_status: null }), false);
  assert.equal(isChapterClaimed({ chapter_status: "pending" }), false);
});

test("never throws on a missing/malformed county — public status check must fail closed", () => {
  assert.equal(isChapterClaimed(null), false);
  assert.equal(isChapterClaimed(undefined), false);
});

test("does not consult anything portal/account-related — takes only the plain county row", () => {
  // A county row can legitimately carry no auth/session data at all; this
  // check must not require it. This test is a signature/behavior guard,
  // not a mock of a real auth object.
  const publicCountyRow = { id: 1, slug: "example-county", chapter_status: "claimed" };
  assert.equal(isChapterClaimed(publicCountyRow), true);
});
