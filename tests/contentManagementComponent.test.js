import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tableSource = readFileSync(new URL("../src/components/admin/ContentManagementTable.jsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../src/components/admin/AdminPostDashboard.jsx", import.meta.url), "utf8");

test("management component provides semantic desktop and responsive mobile presentations", () => {
  assert.match(tableSource, /<table className="management-table">/);
  assert.match(tableSource, /className="management-mobile-list"/);
  assert.match(tableSource, /className="management-mobile-record"/);
});

test("admin and chapter contexts share controls without redundant county controls", () => {
  assert.match(tableSource, /context === "admin" && <label>County/);
  assert.match(tableSource, /context === "admin" && <th>County/);
  assert.match(tableSource, /onEdit && <button/);
});

test("loading, error, workflow-empty, and filtered-empty states are distinct", () => {
  assert.match(tableSource, /Loading records/);
  assert.match(tableSource, /role="alert"/);
  assert.match(tableSource, /No records are currently in this workflow/);
  assert.match(tableSource, /No records match the current filters/);
  assert.match(tableSource, /Clear filters/);
});

test("dashboard uses an explicit lightweight list and defers full records until editing", () => {
  assert.match(dashboardSource, /const POST_LIST_FIELDS/);
  assert.match(dashboardSource, /select\(POST_LIST_FIELDS\)/);
  assert.match(dashboardSource, /async function loadEditablePost/);
  assert.match(dashboardSource, /post_media\(id\)/);
});
