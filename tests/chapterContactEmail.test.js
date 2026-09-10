import test from "node:test";
import assert from "node:assert/strict";
import { getChapterContactEmail, FALLBACK_CHAPTER_EMAIL } from "../src/utils/chapterContactEmail.js";
import { ACTIVE_CHAPTER_COUNTY_SLUGS } from "../src/config/activeChapterCounties.js";

const [activeSlug] = ACTIVE_CHAPTER_COUNTY_SLUGS;

test("uses the configured contact email for an active chapter county", () => {
  const county = { slug: activeSlug, chapter_contact_email: "chapter@example.org" };
  assert.equal(getChapterContactEmail(county), "chapter@example.org");
});

test("trims whitespace around a configured active-chapter email", () => {
  const county = { slug: activeSlug, chapter_contact_email: "  chapter@example.org  " };
  assert.equal(getChapterContactEmail(county), "chapter@example.org");
});

test("falls back to the admin address when the county has no active chapter", () => {
  const county = { slug: "a-county-with-no-active-chapter", chapter_contact_email: "someone@example.org" };
  assert.equal(getChapterContactEmail(county), FALLBACK_CHAPTER_EMAIL);
});

test("falls back to the admin address when the active chapter has no configured email", () => {
  const county = { slug: activeSlug, chapter_contact_email: null };
  assert.equal(getChapterContactEmail(county), FALLBACK_CHAPTER_EMAIL);
});

test("falls back to the admin address when the active chapter's email is blank/whitespace", () => {
  const county = { slug: activeSlug, chapter_contact_email: "   " };
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
