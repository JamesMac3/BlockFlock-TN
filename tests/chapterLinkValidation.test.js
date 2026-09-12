import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChapterLinksPayload, validateChapterLinkSlot } from "../src/features/portal-admin/chapterLinkValidation.js";

function slot(label, url, color = "light_blue") {
  return { label, url, color };
}

test("an entirely empty slot is treated as empty, not an error", () => {
  const result = validateChapterLinkSlot(slot("", ""));
  assert.equal(result.empty, true);
  assert.equal(result.error, undefined);
});

test("a slot with only a label and no URL is rejected with an inline explanation", () => {
  const result = validateChapterLinkSlot(slot("Our website", ""));
  assert.match(result.error, /both button text and a URL/i);
});

test("a slot with only a URL and no label is rejected with an inline explanation", () => {
  const result = validateChapterLinkSlot(slot("", "https://example.com"));
  assert.match(result.error, /both button text and a URL/i);
});

test("a label over 60 characters is rejected", () => {
  const longLabel = "x".repeat(61);
  const result = validateChapterLinkSlot(slot(longLabel, "https://example.com"));
  assert.match(result.error, /60 characters or fewer/);
});

test("a label of exactly 60 characters is accepted", () => {
  const label = "x".repeat(60);
  const result = validateChapterLinkSlot(slot(label, "https://example.com"));
  assert.equal(result.value.label, label);
});

test("leading/trailing whitespace is trimmed from both label and URL", () => {
  const result = validateChapterLinkSlot(slot("  Our website  ", "  https://example.com  "));
  assert.equal(result.value.label, "Our website");
  assert.equal(result.value.url, "https://example.com/");
});

test("an http:// URL is rejected — https only", () => {
  const result = validateChapterLinkSlot(slot("Our website", "http://example.com"));
  assert.match(result.error, /https/i);
});

test("a URL with embedded credentials is rejected", () => {
  const result = validateChapterLinkSlot(slot("Our website", "https://user:pass@example.com"));
  assert.match(result.error, /credentials/i);
});

test("an unparsable URL is rejected", () => {
  const result = validateChapterLinkSlot(slot("Our website", "not a url"));
  assert.ok(result.error);
});

test("a URL over 2048 characters is rejected", () => {
  const longUrl = `https://example.com/${"a".repeat(2048)}`;
  const result = validateChapterLinkSlot(slot("Our website", longUrl));
  assert.ok(result.error);
});

test("a well-formed slot is accepted and passes its color through unchanged", () => {
  const result = validateChapterLinkSlot(slot("Our website", "https://example.com", "navy"));
  assert.deepEqual(result.value, { label: "Our website", url: "https://example.com/", color: "navy" });
});

test("buildChapterLinksPayload omits fully empty slots from the payload entirely", () => {
  const { payload, errors } = buildChapterLinksPayload([
    slot("Our website", "https://example.com", "light_blue"),
    slot("", ""),
    slot("", ""),
  ]);
  assert.deepEqual(errors, [null, null, null]);
  assert.deepEqual(payload, [{ slot: 1, label: "Our website", url: "https://example.com/", color: "light_blue" }]);
});

test("buildChapterLinksPayload returns three link objects for three filled slots, numbered by position", () => {
  const { payload } = buildChapterLinksPayload([
    slot("Website", "https://one.example.com", "light_blue"),
    slot("Facebook", "https://two.example.com", "navy"),
    slot("Donate", "https://three.example.com", "red"),
  ]);
  assert.equal(payload.length, 3);
  assert.deepEqual(payload.map((link) => link.slot), [1, 2, 3]);
});

test("buildChapterLinksPayload returns [] (not an error) when every slot is empty", () => {
  const { payload, errors } = buildChapterLinksPayload([slot("", ""), slot("", ""), slot("", "")]);
  assert.deepEqual(payload, []);
  assert.deepEqual(errors, [null, null, null]);
});

test("buildChapterLinksPayload returns no payload at all when any slot fails validation, with one error entry per slot", () => {
  const { payload, errors } = buildChapterLinksPayload([
    slot("Website", "https://example.com"),
    slot("Broken", ""),
    slot("", ""),
  ]);
  assert.equal(payload, undefined);
  assert.equal(errors[0], null);
  assert.ok(errors[1]);
  assert.equal(errors[2], null);
});
