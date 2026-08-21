import test from "node:test";
import assert from "node:assert/strict";
import { chicagoWallTimeToUtcIso, toChicagoDateTimeLocalValue, formatChicagoDateTime } from "../src/features/portal-admin/chicagoTime.js";
import { formatMeetingBanner } from "../src/features/portal-admin/nextMeeting.js";

test("a Chicago wall-clock time in CDT (summer, UTC-5) converts to the correct UTC instant", () => {
  // September 1, 2026, 5:00 PM America/Chicago is the seed meeting's exact
  // supplied fact: 2026-09-01T22:00:00Z.
  assert.equal(chicagoWallTimeToUtcIso("2026-09-01T17:00"), "2026-09-01T22:00:00.000Z");
});

test("a Chicago wall-clock time in CST (winter, UTC-6) converts to the correct UTC instant", () => {
  assert.equal(chicagoWallTimeToUtcIso("2026-01-15T09:00"), "2026-01-15T15:00:00.000Z");
});

test("round-tripping a UTC instant back to a Chicago datetime-local value recovers the original wall-clock time", () => {
  const utcIso = chicagoWallTimeToUtcIso("2026-09-01T17:00");
  assert.equal(toChicagoDateTimeLocalValue(utcIso), "2026-09-01T17:00");
});

test("an empty/missing value converts to null rather than a bogus timestamp", () => {
  assert.equal(chicagoWallTimeToUtcIso(""), null);
  assert.equal(chicagoWallTimeToUtcIso(null), null);
});

test("formatChicagoDateTime renders the seed meeting's known instant as 5:00 PM Central", () => {
  const formatted = formatChicagoDateTime("2026-09-01T22:00:00Z");
  assert.match(formatted, /5:00\s*PM/);
  assert.match(formatted, /CT$/);
});

test("formatMeetingBanner returns null (no banner) when there is no meeting", () => {
  assert.equal(formatMeetingBanner(null), null);
  assert.equal(formatMeetingBanner(undefined), null);
});

test("formatMeetingBanner marks a pinned statewide meeting and omits a county name for it", () => {
  const banner = formatMeetingBanner({
    id: "m1",
    title: "Flock Block Tennessee Statewide Meeting",
    starts_at: "2026-09-01T22:00:00Z",
    is_pinned_statewide: true,
    county_name: null,
    location_name: "200 North Castle Heights Ave",
    street_address: "200 North Castle Heights Ave",
    city: "Lebanon",
    state: "TN",
  });
  assert.equal(banner.isPinnedStatewide, true);
  assert.equal(banner.countyName, null);
  assert.match(banner.locationText, /Lebanon/);
  assert.match(banner.locationText, /TN/);
});

test("formatMeetingBanner marks a county-specific meeting as not pinned", () => {
  const banner = formatMeetingBanner({
    id: "m2",
    title: "Rutherford County Chapter Meeting",
    starts_at: "2026-10-01T18:00:00Z",
    is_pinned_statewide: false,
    county_name: "Rutherford",
    location_name: "Murfreesboro Library",
    street_address: "123 Main St",
    city: "Murfreesboro",
    state: "TN",
  });
  assert.equal(banner.isPinnedStatewide, false);
  assert.equal(banner.countyName, "Rutherford");
});
