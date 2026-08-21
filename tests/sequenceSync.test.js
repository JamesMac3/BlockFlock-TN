import test from "node:test";
import assert from "node:assert/strict";
import { resolveSequenceSetval } from "../src/features/portal-admin/sequenceSync.js";

test("an empty table (max(id) is null) resets the sequence to setval(seq, 1, false)", () => {
  assert.deepEqual(resolveSequenceSetval(null), { value: 1, isCalled: false });
});

test("undefined is treated the same as null (no rows)", () => {
  assert.deepEqual(resolveSequenceSetval(undefined), { value: 1, isCalled: false });
});

test("a populated table sets the sequence to setval(seq, max_id, true)", () => {
  assert.deepEqual(resolveSequenceSetval(42), { value: 42, isCalled: true });
});

test("a single-row table (max(id) = 1) still uses is_called = true, not the empty-table branch", () => {
  assert.deepEqual(resolveSequenceSetval(1), { value: 1, isCalled: true });
});
