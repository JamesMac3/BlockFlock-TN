import test from "node:test";
import assert from "node:assert/strict";
import { chicagoWallTimeToUtcIso, toChicagoDateTimeLocalValue, formatChicagoDateTime } from "../src/features/portal-admin/chicagoTime.js";
import {
  formatMeetingBanner,
  dedupeMeetingsById,
  sortMeetingsByStartsAt,
  formatMeetingRow,
} from "../src/features/portal-admin/nextMeeting.js";

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

test("sortMeetingsByStartsAt orders strictly chronologically — pinning a meeting statewide must never move it ahead of an earlier one", () => {
  const later = { id: "b", starts_at: "2026-09-20T18:00:00Z", is_pinned_statewide: true };
  const earlier = { id: "a", starts_at: "2026-09-10T18:00:00Z", is_pinned_statewide: false };
  const sorted = sortMeetingsByStartsAt([later, earlier]);
  assert.deepEqual(sorted.map((meeting) => meeting.id), ["a", "b"]);
});

test("sortMeetingsByStartsAt breaks an exact tie by id, deterministically", () => {
  const sameInstant = "2026-09-10T18:00:00Z";
  const sorted = sortMeetingsByStartsAt([
    { id: "z", starts_at: sameInstant },
    { id: "a", starts_at: sameInstant },
  ]);
  assert.deepEqual(sorted.map((meeting) => meeting.id), ["a", "z"]);
});

test("dedupeMeetingsById removes a repeated id, keeping the first occurrence", () => {
  const rows = [
    { id: "m1", title: "First copy" },
    { id: "m2", title: "Different meeting" },
    { id: "m1", title: "Second copy — should be dropped" },
  ];
  const deduped = dedupeMeetingsById(rows);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].title, "First copy");
  assert.equal(deduped.map((meeting) => meeting.id).includes("m1"), true);
  assert.equal(deduped.map((meeting) => meeting.id).includes("m2"), true);
});

test("dedupeMeetingsById handles an empty or missing list without throwing", () => {
  assert.deepEqual(dedupeMeetingsById([]), []);
  assert.deepEqual(dedupeMeetingsById(undefined), []);
  assert.deepEqual(dedupeMeetingsById(null), []);
});

test("formatMeetingRow returns null for a missing meeting", () => {
  assert.equal(formatMeetingRow(null), null);
  assert.equal(formatMeetingRow(undefined), null);
});

test("formatMeetingRow shows city and county, date, time, and location as separate fields", () => {
  const row = formatMeetingRow({
    id: "m3",
    title: "Nashville Metro Council public comments",
    starts_at: "2026-09-15T23:30:00Z",
    is_pinned_statewide: false,
    county_name: "Davidson County",
    location_name: "David Scobey Council Chamber, Historic Metro Courthouse",
    street_address: "1 Public Square",
    city: "Nashville",
    state: "TN",
  });
  assert.equal(row.cityCountyText, "Nashville, Davidson County");
  assert.match(row.dateText, /Sep/);
  assert.match(row.timeText, /6:30\s*PM/);
  assert.match(row.locationText, /David Scobey Council Chamber/);
  assert.match(row.locationText, /1 Public Square/);
});

test("formatMeetingRow shows 'Statewide' in place of a city/county for a pinned meeting", () => {
  const row = formatMeetingRow({
    id: "m4",
    title: "Flock Block Tennessee Statewide Meeting",
    starts_at: "2026-09-01T22:00:00Z",
    is_pinned_statewide: true,
    county_name: null,
    city: "Lebanon",
  });
  assert.equal(row.cityCountyText, "Statewide");
});

test("formatMeetingRow omits the comment panel entirely when no public-comment field is set — never inferred from the title", () => {
  const row = formatMeetingRow({
    id: "m5",
    title: "Rutherford County Commission public comments",
    starts_at: "2026-09-20T23:00:00Z",
    is_pinned_statewide: false,
  });
  assert.equal(row.comment, null);
});

test("formatMeetingRow includes only the public-comment fields that are actually set, and keeps the signup deadline distinguishable from the meeting-start countdown", () => {
  const row = formatMeetingRow({
    id: "m6",
    title: "Nashville Metro Council public comments",
    starts_at: "2026-09-15T23:30:00Z",
    is_pinned_statewide: false,
    comment_speaking_limit: "Up to 2 minutes; agenda speakers prioritized.",
    comment_signup_instructions: "In-person signup 5-6 PM at the meeting; Tennessee residency proof required.",
    comment_signup_deadline: "2026-09-15T23:00:00Z",
    comment_source_url: "https://www.nashville.gov/departments/council/public-comment-period",
  });
  assert.ok(row.comment);
  assert.equal(row.comment.speakingLimit, "Up to 2 minutes; agenda speakers prioritized.");
  assert.match(row.comment.signupDeadlineText, /6:00\s*PM/);
  // The signup deadline (6:00 PM) is a distinct value from the meeting
  // start (6:30 PM) — never the same formatted string as row.timeText.
  assert.notEqual(row.comment.signupDeadlineText, row.timeText);
  assert.equal(row.comment.sourceUrl, "https://www.nashville.gov/departments/council/public-comment-period");
});

test("formatMeetingRow still builds a comment panel when only one comment field (e.g. just a source link) is set", () => {
  const row = formatMeetingRow({
    id: "m7",
    title: "Lebanon City Council public comments",
    starts_at: "2026-09-15T23:00:00Z",
    is_pinned_statewide: false,
    comment_source_url: "https://www.lebanontn.org/311/City-Council",
  });
  assert.ok(row.comment);
  assert.equal(row.comment.speakingLimit, null);
  assert.equal(row.comment.signupInstructions, null);
  assert.equal(row.comment.signupDeadlineText, null);
  assert.equal(row.comment.sourceUrl, "https://www.lebanontn.org/311/City-Council");
});

// Fixture captured 2026-09-13 via a live, anonymous rrg_get_upcoming_meetings
// call against the real database (see docs/meeting-research-manifest-2026-09.md,
// "Live verification" section) — locks in that exact real-world response
// shape as a permanent regression test, without adding a live network
// dependency to the automated suite.
const liveStatewideFixture = [
  {
    id: "61535069-ee54-4ae6-9bd1-5a5aea70ce8f",
    title: "Oak Ridge City Council regular meeting (7 PM Eastern)",
    county_id: 2,
    county_name: "Anderson County",
    starts_at: "2026-09-14T23:00:00+00:00",
    timezone: "America/Chicago",
    location_name: "Oak Ridge Municipal Building, Council Chambers / Court Room",
    street_address: "200 S. Tulane Ave",
    city: "Oak Ridge",
    state: "TN",
    postal_code: "37830",
    is_pinned_statewide: false,
    comment_speaking_limit: null,
    comment_signup_instructions: null,
    comment_signup_deadline: null,
    comment_source_url: null,
  },
  {
    id: "7723fab8-9381-42cc-963b-b64123e217f6",
    title: "Nashville Metro Council public comments (sign up 5-6 PM)",
    county_id: 20,
    county_name: "Davidson County",
    starts_at: "2026-09-15T23:30:00+00:00",
    timezone: "America/Chicago",
    location_name: "David Scobey Council Chamber, Historic Metro Courthouse",
    street_address: "1 Public Square",
    city: "Nashville",
    state: "TN",
    postal_code: "37201",
    is_pinned_statewide: false,
    comment_speaking_limit: "Up to 2 minutes per speaker; 20 minutes total. Agenda speakers prioritized.",
    comment_signup_instructions: "Sign up in person between 5 and 6 PM Central outside the David Scobey Council Chamber. Bring proof of Tennessee residency. General comments are permitted; meeting starts at 6:30 PM.",
    comment_signup_deadline: "2026-09-15T23:00:00+00:00",
    comment_source_url: "https://www.nashville.gov/departments/council/public-comment-period",
  },
  {
    id: "4481ad9e-6c83-4e8c-ac62-c663d3e943df",
    title: "Maryville City Council Work Session - FLOCK ON AGENDA",
    county_id: 6,
    county_name: "Blount County",
    starts_at: "2026-09-18T13:00:00+00:00",
    timezone: "America/Chicago",
    location_name: "Maryville Municipal Center",
    street_address: "400 W. Broadway Ave",
    city: "Maryville",
    state: "TN",
    postal_code: "37801",
    is_pinned_statewide: false,
    comment_speaking_limit: null,
    comment_signup_instructions: null,
    comment_signup_deadline: null,
    comment_source_url: null,
  },
];

test("live fixture: dedupeMeetingsById + sortMeetingsByStartsAt leave an already-chronological, already-unique live response unchanged", () => {
  const result = sortMeetingsByStartsAt(dedupeMeetingsById(liveStatewideFixture));
  assert.deepEqual(result.map((meeting) => meeting.id), liveStatewideFixture.map((meeting) => meeting.id));
});

test("live fixture: Oak Ridge (7 PM Eastern) displays as 6:00 PM Central, preserving the stored instant — the title carries the Eastern time, the display does not convert it", () => {
  const row = formatMeetingRow(liveStatewideFixture[0]);
  assert.equal(row.title, "Oak Ridge City Council regular meeting (7 PM Eastern)");
  assert.match(row.timeText, /6:00\s*PM/);
  assert.equal(row.comment, null);
});

test("live fixture: Nashville's signup deadline (6:00 PM) and meeting start (6:30 PM) are both Central and distinguishable from each other", () => {
  const row = formatMeetingRow(liveStatewideFixture[1]);
  assert.match(row.timeText, /6:30\s*PM/);
  assert.match(row.comment.signupDeadlineText, /6:00\s*PM/);
  assert.notEqual(row.timeText, row.comment.signupDeadlineText);
});

test("live fixture: Maryville (an existing meeting with no comment fields) shows its saved title verbatim and no comment panel", () => {
  const row = formatMeetingRow(liveStatewideFixture[2]);
  assert.equal(row.title, "Maryville City Council Work Session - FLOCK ON AGENDA");
  assert.equal(row.comment, null);
});

test("live fixture: a county-filtered response mixing a county meeting with a statewide-pinned one (from a live call for Davidson County) labels the pinned row 'Statewide' and shows no comment panel for it", () => {
  const pinnedRow = formatMeetingRow({
    id: "62d26af0-cd2a-4390-be7c-c7de52f512f1",
    title: "Murfreesboro City hall comments",
    county_id: null,
    county_name: null,
    starts_at: "2026-10-01T22:30:00+00:00",
    is_pinned_statewide: true,
    location_name: "CITY HALL",
    street_address: "111 W Vine St",
    city: "Murfreessboro",
    state: "TN",
    comment_speaking_limit: null,
    comment_signup_instructions: null,
    comment_signup_deadline: null,
    comment_source_url: null,
  });
  assert.equal(pinnedRow.cityCountyText, "Statewide");
  assert.equal(pinnedRow.comment, null);
  // Saved title preserved verbatim, typo and all — never rewritten.
  assert.equal(pinnedRow.title, "Murfreesboro City hall comments");
});
