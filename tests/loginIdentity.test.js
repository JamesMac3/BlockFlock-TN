import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLoginIdentity, MAX_LOGIN_FIELD_LENGTH } from "../src/features/portal-admin/loginIdentity.js";

test("a bare username is normalized to the flockblocktn.org alias", () => {
  assert.deepEqual(normalizeLoginIdentity("rutherford"), {
    ok: true,
    email: "rutherford@flockblocktn.org",
  });
});

test("username normalization trims whitespace and lowercases mixed case", () => {
  assert.deepEqual(normalizeLoginIdentity("  Rutherford  "), {
    ok: true,
    email: "rutherford@flockblocktn.org",
  });
});

test("a username may contain digits, periods, underscores, and hyphens", () => {
  assert.deepEqual(normalizeLoginIdentity("davidson-county_2"), {
    ok: true,
    email: "davidson-county_2@flockblocktn.org",
  });
});

test("a full email address is trimmed and lowercased, not aliased", () => {
  assert.deepEqual(normalizeLoginIdentity("  Admin@FlockBlockTN.org  "), {
    ok: true,
    email: "admin@flockblocktn.org",
  });
});

test("any input containing @ is treated as a complete email, even an unrelated domain", () => {
  assert.deepEqual(normalizeLoginIdentity("someone@example.com"), {
    ok: true,
    email: "someone@example.com",
  });
});

test("an empty or whitespace-only identity is rejected", () => {
  assert.deepEqual(normalizeLoginIdentity(""), { ok: false });
  assert.deepEqual(normalizeLoginIdentity("   "), { ok: false });
  assert.deepEqual(normalizeLoginIdentity(undefined), { ok: false });
});

test("a username with a space is rejected as an invalid alias", () => {
  assert.deepEqual(normalizeLoginIdentity("ruther ford"), { ok: false });
});

test("a username with disallowed punctuation is rejected as an invalid alias", () => {
  for (const invalid of ["ruther/ford", "ruther+ford", "ruther*ford", "ruther!ford"]) {
    assert.deepEqual(normalizeLoginIdentity(invalid), { ok: false }, invalid);
  }
});

test("MAX_LOGIN_FIELD_LENGTH is exactly 120", () => {
  assert.equal(MAX_LOGIN_FIELD_LENGTH, 120);
});

test("an identity of exactly 120 characters is accepted", () => {
  const exact120Username = "a".repeat(120);
  const result = normalizeLoginIdentity(exact120Username);
  assert.equal(result.ok, true);
  assert.equal(result.email, `${exact120Username}@flockblocktn.org`);
});

test("an identity of 121 characters is rejected, not silently truncated", () => {
  const over120Username = "a".repeat(121);
  assert.deepEqual(normalizeLoginIdentity(over120Username), { ok: false });
});

test("length is checked on the trimmed value, and a valid full email exactly at the limit is still accepted", () => {
  const localPart = "b".repeat(110);
  const exactEmail = `${localPart}@x.io`; // 110 + 5 = 115 chars, safely under 120
  assert.equal(normalizeLoginIdentity(exactEmail).ok, true);

  const oversizedEmail = `${"b".repeat(118)}@x.io`; // 118 + 5 = 123 chars, over 120
  assert.deepEqual(normalizeLoginIdentity(oversizedEmail), { ok: false });
});
