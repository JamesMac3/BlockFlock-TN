import test from "node:test";
import assert from "node:assert/strict";
import { sortStatusPosts } from "../src/utils/statusPostUtils.js";

test("sorts pinned statewide, pinned local, then newest", () => {
  const posts = [
    { id: 1, scope: "county", county_id: 4, is_pinned: false, approved_at: "2026-01-03" },
    { id: 2, scope: "county", county_id: 4, is_pinned: true, approved_at: "2026-01-01" },
    { id: 3, scope: "global", is_pinned: true, approved_at: "2026-01-01" },
    { id: 4, scope: "global", is_pinned: false, approved_at: "2026-01-04" },
  ];
  assert.deepEqual(sortStatusPosts(posts, 4).map((post) => post.id), [3, 2, 4, 1]);
});
