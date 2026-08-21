import test from "node:test";
import assert from "node:assert/strict";
import { clampPageSize, totalPagesFor, resetPageOnQueryChange, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "../src/features/portal-admin/pagination.js";
import { classifyRpcError } from "../src/features/portal-admin/rpcErrors.js";

test("page size is clamped to a hard maximum of 100", () => {
  assert.equal(clampPageSize(500), MAX_PAGE_SIZE);
  assert.equal(clampPageSize(100), 100);
  assert.equal(clampPageSize(101), 100);
});

test("page size falls back to the default for invalid input", () => {
  assert.equal(clampPageSize(0), DEFAULT_PAGE_SIZE);
  assert.equal(clampPageSize(-5), DEFAULT_PAGE_SIZE);
  assert.equal(clampPageSize(NaN), DEFAULT_PAGE_SIZE);
  assert.equal(clampPageSize(undefined), DEFAULT_PAGE_SIZE);
});

test("total pages is computed from the accurate total count, not the returned page length", () => {
  assert.equal(totalPagesFor(250, 100), 3);
  assert.equal(totalPagesFor(0, 25), 1);
  assert.equal(totalPagesFor(1, 25), 1);
});

test("any filter/search/sort/page-size change resets the current page to 1", () => {
  const current = { search: "", page: 7, pageSize: 50 };
  assert.deepEqual(resetPageOnQueryChange(current, { search: "murfreesboro" }), { search: "murfreesboro", page: 1, pageSize: 50 });
  assert.deepEqual(resetPageOnQueryChange(current, { pageSize: 100 }), { search: "", page: 1, pageSize: 100 });
});

test("classifies a missing/unapplied migration (PostgREST schema-cache miss) distinctly", () => {
  assert.equal(classifyRpcError({ code: "PGRST202", message: "Could not find the function public.rrg_admin_list_chapter_accounts in the schema cache" }), "missing-migration");
  assert.equal(classifyRpcError({ message: "schema cache" }), "missing-migration");
});

test("classifies an authorization failure distinctly from a missing migration", () => {
  assert.equal(classifyRpcError({ code: "42501", message: "Not authorized." }), "not-authorized");
});

test("classifies an expired/missing session distinctly", () => {
  assert.equal(classifyRpcError({ code: "PGRST301", message: "JWT expired" }), "authentication-required");
});

test("falls back to a generic retryable network classification for anything else", () => {
  assert.equal(classifyRpcError({ message: "fetch failed" }), "network");
  assert.equal(classifyRpcError(null), null);
});
