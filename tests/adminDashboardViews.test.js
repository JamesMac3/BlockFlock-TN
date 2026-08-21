import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ADMIN_DASHBOARD_VIEWS,
  getAdminDashboardCounts,
  getAdminDashboardItems,
} from "../src/utils/adminDashboardViews.js";

const NOW = new Date("2026-08-03T12:00:00Z");
// Live posts_status_check permits exactly draft/pending/approved/rejected —
// there is no separate 'returned'/'revision_requested' status.
const POSTS = [
  { id: 1, status: "pending", content_type: "announcement" },
  { id: 2, status: "draft", content_type: "announcement" },
  { id: 3, status: "approved", content_type: "announcement" },
  { id: 4, status: "rejected", content_type: "announcement" },
  { id: 6, status: "draft", content_type: "meeting", event_start: "2026-08-05T12:00:00Z" },
  { id: 7, status: "approved", content_type: "meeting", event_start: "2026-08-04T12:00:00Z" },
  { id: 8, status: "approved", content_type: "meeting", event_start: "2026-07-01T12:00:00Z" },
];

test("dashboard definitions contain only the five summary-card views", () => {
  assert.deepEqual(ADMIN_DASHBOARD_VIEWS.map((view) => view.id), ["pending", "drafts", "published", "returned", "meetings"]);
  assert.equal(ADMIN_DASHBOARD_VIEWS.some((view) => ["overview", "posts", "all"].includes(view.id)), false);
});

test("each post view applies its existing status predicate", () => {
  assert.deepEqual(getAdminDashboardItems(POSTS, "pending", NOW).map(({ id }) => id), [1]);
  assert.deepEqual(getAdminDashboardItems(POSTS, "drafts", NOW).map(({ id }) => id), [2, 6]);
  assert.deepEqual(getAdminDashboardItems(POSTS, "published", NOW).map(({ id }) => id), [3, 7, 8]);
  assert.deepEqual(getAdminDashboardItems(POSTS, "returned", NOW).map(({ id }) => id), [4]);
});

test("upcoming meetings are rendered in ascending date order", () => {
  assert.deepEqual(getAdminDashboardItems(POSTS, "meetings", NOW).map(({ id }) => id), [7, 6]);
});

test("counts remain complete and stable regardless of selected view", () => {
  const counts = getAdminDashboardCounts(POSTS, NOW);
  assert.deepEqual(counts, { pending: 1, drafts: 2, published: 3, returned: 1, meetings: 2 });
  for (const view of ADMIN_DASHBOARD_VIEWS) {
    getAdminDashboardItems(POSTS, view.id, NOW);
    assert.deepEqual(getAdminDashboardCounts(POSTS, NOW), counts);
  }
});

test("dashboard source uses semantic pressed buttons and has no obsolete navigation", async () => {
  const source = await readFile(new URL("../src/components/admin/AdminPostDashboard.jsx", import.meta.url), "utf8");
  const tableSource = await readFile(new URL("../src/components/admin/ContentManagementTable.jsx", import.meta.url), "utf8");
  assert.match(source, /aria-pressed=/);
  assert.match(source, /useState\("pending"\)/);
  assert.match(tableSource, />Preview<|>Edit</);
  assert.match(tableSource, /No records are currently in this workflow/);
  assert.doesNotMatch(source, /admin-dashboard-tabs|admin-post-filters|>All</);
});

test("empty queues return an empty list and responsive cards do not require horizontal scrolling", async () => {
  assert.deepEqual(getAdminDashboardItems([], "pending", NOW), []);
  const styles = await readFile(new URL("../src/components/admin/AdminPostDashboard.css", import.meta.url), "utf8");
  assert.match(styles, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 360px\)[\s\S]*grid-template-columns:\s*1fr/);
});
