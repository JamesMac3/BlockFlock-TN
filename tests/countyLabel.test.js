import test from "node:test";
import assert from "node:assert/strict";
import { formatCountyLabel } from "../src/features/document-request/countyLabel.js";

test("County Label - avoids doubling County", async (t) => {
  await t.test("appends County when the name does not already end in it", () => {
    assert.strictEqual(formatCountyLabel("Rutherford"), "Rutherford County");
  });

  await t.test("leaves a name that already ends in County unchanged", () => {
    assert.strictEqual(formatCountyLabel("Rutherford County"), "Rutherford County");
  });

  await t.test("matches County case-insensitively without doubling", () => {
    assert.strictEqual(formatCountyLabel("Rutherford county"), "Rutherford county");
  });

  await t.test("trims surrounding whitespace", () => {
    assert.strictEqual(formatCountyLabel("  Rutherford  "), "Rutherford County");
  });

  await t.test("passes through empty or missing names unchanged", () => {
    assert.strictEqual(formatCountyLabel(""), "");
    assert.strictEqual(formatCountyLabel(null), null);
    assert.strictEqual(formatCountyLabel(undefined), undefined);
  });

  await t.test("does not treat a name merely containing 'county' mid-word as already suffixed", () => {
    assert.strictEqual(formatCountyLabel("Countyline"), "Countyline County");
  });
});
