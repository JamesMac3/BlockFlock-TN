import test from "node:test";
import assert from "node:assert/strict";
import { computeCountdownParts, formatCountdown } from "../src/features/portal-admin/meetingCountdown.js";

test("computes days/hours/minutes/seconds remaining for a future instant", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const startsAt = new Date(now + (19 * 86400 + 4 * 3600 + 12 * 60 + 8) * 1000).toISOString();
  const parts = computeCountdownParts(startsAt, now);
  assert.deepEqual(parts, { status: "upcoming", days: 19, hours: 4, minutes: 12, seconds: 8 });
});

test("formatCountdown renders the exact required compact format", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const startsAt = new Date(now + (19 * 86400 + 4 * 3600 + 12 * 60 + 8) * 1000).toISOString();
  assert.equal(formatCountdown(startsAt, now), "19d 4h 12m 08s");
});

test("pads single-digit seconds but not days/hours/minutes", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const startsAt = new Date(now + (0 * 86400 + 0 * 3600 + 0 * 60 + 5) * 1000).toISOString();
  assert.equal(formatCountdown(startsAt, now), "0d 0h 0m 05s");
});

test("boundary: one second before start still counts down (0d 0h 0m 01s)", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const startsAt = new Date(now + 1000).toISOString();
  assert.equal(formatCountdown(startsAt, now), "0d 0h 0m 01s");
});

test("boundary: exactly at start time reports started, not 0d 0h 0m 00s", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.deepEqual(computeCountdownParts(now, now), { status: "started" });
  assert.equal(formatCountdown(new Date(now).toISOString(), now), "Scheduled start reached");
});

test("never shows negative time for a start time already in the past", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const startsAt = new Date(now - 3600_000).toISOString();
  const parts = computeCountdownParts(startsAt, now);
  assert.equal(parts.status, "started");
  assert.equal(formatCountdown(startsAt, now), "Scheduled start reached");
});

test("a missing starts_at is invalid, not a crash or NaN countdown", () => {
  assert.deepEqual(computeCountdownParts(null), { status: "invalid" });
  assert.deepEqual(computeCountdownParts(undefined), { status: "invalid" });
  assert.deepEqual(computeCountdownParts(""), { status: "invalid" });
  assert.equal(formatCountdown(null), null);
  assert.equal(formatCountdown(undefined), null);
});

test("an unparseable starts_at is invalid, not a crash or NaN countdown", () => {
  assert.deepEqual(computeCountdownParts("not a date"), { status: "invalid" });
  assert.equal(formatCountdown("not a date"), null);
});

test("the countdown across a US spring-forward daylight-saving transition still counts real elapsed time correctly", () => {
  // 2026-03-08 02:00 America/Chicago is the DST spring-forward instant
  // (clocks jump to 03:00 CDT). The countdown is a pure UTC millisecond
  // difference between two fixed instants, so it must report the true
  // ~25.5 real hours remaining here regardless of the wall-clock jump —
  // DST only affects how a date is *displayed* (chicagoTime.js), never
  // this arithmetic.
  const now = Date.parse("2026-03-07T00:30:00Z"); // 2026-03-06 18:30 CST
  const startsAt = "2026-03-08T02:00:00Z"; // 2026-03-07 20:00 CST
  const parts = computeCountdownParts(startsAt, now);
  assert.equal(parts.status, "upcoming");
  const totalHours = parts.days * 24 + parts.hours;
  assert.equal(totalHours, 25);
  assert.equal(parts.minutes, 30);
});

test("the countdown across a US fall-back daylight-saving transition still counts real elapsed time correctly", () => {
  // 2026-11-01 02:00 America/Chicago is the DST fall-back instant.
  const now = Date.parse("2026-10-31T12:00:00Z");
  const startsAt = "2026-11-02T12:00:00Z";
  const parts = computeCountdownParts(startsAt, now);
  assert.equal(parts.status, "upcoming");
  assert.equal(parts.days, 2);
  assert.equal(parts.hours, 0);
  assert.equal(parts.minutes, 0);
  assert.equal(parts.seconds, 0);
});
