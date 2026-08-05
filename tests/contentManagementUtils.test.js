import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SORT_BY_VIEW,
  filterManagementRecords,
  recordCountyLabel,
  shortCountyName,
  sortManagementRecords,
  sourceLabel,
  updateTableCriteria,
} from "../src/utils/contentManagementUtils.js";

const RECORDS = [
  { id: 1, title: "Zebra update", summary: "Rutherford summary", county_id: 4, scope: "county", content_type: "records", submitted_at: "2026-01-03", approved_at: "2026-02-01", event_start: "2026-04-03", counties: { name: "Rutherford County" }, author_user_id: "admin" },
  { id: 2, title: "Alpha meeting", summary: "Davidson notice", county_id: 2, scope: "county", content_type: "meeting", submitted_at: "2026-01-01", approved_at: "2026-03-01", event_start: "2026-04-01", counties: { name: "Davidson County" }, author_user_id: "chapter" },
  { id: 3, title: "Middle announcement", summary: "Across Tennessee", county_id: null, scope: "global", content_type: "announcement", submitted_at: "2026-01-02", approved_at: "2026-01-01", event_start: "2026-04-02", counties: null, author_user_id: "legacy" },
];

test("county display removes only a terminal County suffix and preserves Statewide", () => {
  assert.equal(shortCountyName("Rutherford County"), "Rutherford");
  assert.equal(shortCountyName("County Line County"), "County Line");
  assert.equal(shortCountyName("County Services"), "County Services");
  assert.equal(recordCountyLabel(RECORDS[2]), "Statewide");
});

test("source labels stay compact and do not invent personal names", () => {
  const lookup = { admin: { role: "admin" }, chapter: { role: "chapter_master", countyName: "Davidson County" } };
  assert.equal(sourceLabel(RECORDS[0], lookup), "Admin");
  assert.equal(sourceLabel(RECORDS[1], lookup), "Davidson");
  assert.equal(sourceLabel(RECORDS[2], lookup), "Contributor");
});

test("search matches titles and summaries", () => {
  assert.deepEqual(filterManagementRecords(RECORDS, { search: "alpha" }).map(({ id }) => id), [2]);
  assert.deepEqual(filterManagementRecords(RECORDS, { search: "tennessee" }).map(({ id }) => id), [3]);
});

test("county and type filters work independently", () => {
  assert.deepEqual(filterManagementRecords(RECORDS, { county: "4", type: "all" }).map(({ id }) => id), [1]);
  assert.deepEqual(filterManagementRecords(RECORDS, { county: "all", type: "meeting" }).map(({ id }) => id), [2]);
  assert.deepEqual(filterManagementRecords(RECORDS, { county: "statewide", type: "all" }).map(({ id }) => id), [3]);
});

test("all sort choices return expected order", () => {
  assert.deepEqual(sortManagementRecords(RECORDS, "title-asc", "pending").map(({ id }) => id), [2, 3, 1]);
  assert.deepEqual(sortManagementRecords(RECORDS, "title-desc", "pending").map(({ id }) => id), [1, 3, 2]);
  assert.deepEqual(sortManagementRecords(RECORDS, "county-asc", "pending").map(({ id }) => id), [2, 1, 3]);
  assert.deepEqual(sortManagementRecords(RECORDS, "county-desc", "pending").map(({ id }) => id), [3, 1, 2]);
  assert.deepEqual(sortManagementRecords(RECORDS, "type-asc", "pending").map(({ id }) => id), [3, 2, 1]);
  assert.deepEqual(sortManagementRecords(RECORDS, "activity-asc", "pending").map(({ id }) => id), [2, 3, 1]);
  assert.deepEqual(sortManagementRecords(RECORDS, "activity-desc", "published").map(({ id }) => id), [2, 1, 3]);
});

test("workflow default sorting matches review and meeting priorities", () => {
  assert.equal(DEFAULT_SORT_BY_VIEW.pending, "activity-asc");
  assert.equal(DEFAULT_SORT_BY_VIEW.published, "activity-desc");
  assert.equal(DEFAULT_SORT_BY_VIEW.meetings, "activity-asc");
  assert.deepEqual(sortManagementRecords(RECORDS, DEFAULT_SORT_BY_VIEW.meetings, "meetings").map(({ id }) => id), [2, 3, 1]);
});

test("changing any table criteria resets pagination", () => {
  assert.deepEqual(updateTableCriteria({ search: "", county: "all", type: "all", sort: "title-asc", page: 4 }, { search: "new" }).page, 1);
  assert.deepEqual(updateTableCriteria({ page: 3 }, { county: "2" }).page, 1);
  assert.deepEqual(updateTableCriteria({ page: 2 }, { type: "meeting" }).page, 1);
  assert.deepEqual(updateTableCriteria({ page: 5 }, { sort: "activity-desc" }).page, 1);
});
