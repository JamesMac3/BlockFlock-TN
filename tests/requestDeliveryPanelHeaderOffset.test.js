import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(
  new URL("../src/components/records-request-goals/RequestDeliveryPanel.css", import.meta.url),
  "utf8",
);

test("the backdrop starts at --site-header-height, not the viewport edge", () => {
  assert.match(css, /\.delivery-panel-backdrop \{[\s\S]*?top: var\(--site-header-height, 4\.75rem\);/);
});

test("the panel's max-height is capped against the same header-height variable", () => {
  assert.match(css, /max-height: calc\(100dvh - var\(--site-header-height, 4\.75rem\) - 3rem\);/);
});

test("z-index sits below the site header (100) but above AdminPopout (95), since this panel can open nested inside an already-open goal editor", () => {
  assert.match(css, /\.delivery-panel-backdrop \{[\s\S]*?z-index: 98;/);
});

test("the header stays sticky at the top of the panel's own scroll port", () => {
  assert.match(css, /\.delivery-panel__header \{[\s\S]*?position: sticky;[\s\S]*?top: 0;/);
});
