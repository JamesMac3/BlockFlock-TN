import test from "node:test";
import assert from "node:assert/strict";
import { getChapterContactEmail, FALLBACK_CHAPTER_EMAIL } from "../src/utils/chapterContactEmail.js";

test("uses the configured contact email for a claimed chapter county", () => {
  const county = { chapter_status: "claimed", chapter_contact_email: "chapter@example.org" };
  assert.equal(getChapterContactEmail(county), "chapter@example.org");
});

test("trims whitespace around a configured claimed-chapter email", () => {
  const county = { chapter_status: "claimed", chapter_contact_email: "  chapter@example.org  " };
  assert.equal(getChapterContactEmail(county), "chapter@example.org");
});

test("falls back to the admin address when the county is unclaimed", () => {
  const county = { chapter_status: "unclaimed", chapter_contact_email: "someone@example.org" };
  assert.equal(getChapterContactEmail(county), FALLBACK_CHAPTER_EMAIL);
});

test("falls back to the admin address when chapter_status is missing entirely", () => {
  const county = { chapter_contact_email: "someone@example.org" };
  assert.equal(getChapterContactEmail(county), FALLBACK_CHAPTER_EMAIL);
});

test("falls back to the admin address when the claimed chapter has no configured email", () => {
  const county = { chapter_status: "claimed", chapter_contact_email: null };
  assert.equal(getChapterContactEmail(county), FALLBACK_CHAPTER_EMAIL);
});

test("falls back to the admin address when the claimed chapter's email is blank/whitespace", () => {
  const county = { chapter_status: "claimed", chapter_contact_email: "   " };
  assert.equal(getChapterContactEmail(county), FALLBACK_CHAPTER_EMAIL);
});

test("never throws on a missing/malformed county", () => {
  assert.equal(getChapterContactEmail(null), FALLBACK_CHAPTER_EMAIL);
  assert.equal(getChapterContactEmail(undefined), FALLBACK_CHAPTER_EMAIL);
  assert.equal(getChapterContactEmail({}), FALLBACK_CHAPTER_EMAIL);
});

test("the fallback address is the documented statewide admin address", () => {
  assert.equal(FALLBACK_CHAPTER_EMAIL, "admin@flockblocktn.org");
});
