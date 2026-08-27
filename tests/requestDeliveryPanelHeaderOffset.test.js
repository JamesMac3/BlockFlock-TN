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

test("the panel itself has no max-height or overflow-y — it must use its natural document height, not a second nested scroll box", () => {
  const panelBlock = css.match(/\.delivery-panel \{[^}]*\}/)?.[0] ?? "";
  assert.notEqual(panelBlock, "");
  assert.doesNotMatch(panelBlock, /max-height/);
  assert.doesNotMatch(panelBlock, /overflow-y/);
});

test("the backdrop is the one true scrolling surface for the whole modal", () => {
  assert.match(css, /\.delivery-panel-backdrop \{[\s\S]*?overflow-y: auto;/);
});

test("z-index sits below the site header (100) but above AdminPopout (95), since this panel can open nested inside an already-open goal editor", () => {
  assert.match(css, /\.delivery-panel-backdrop \{[\s\S]*?z-index: 98;/);
});

test("the header itself is no longer sticky and has no boxed background — only the close button stays fixed while scrolling", () => {
  const headerBlock = css.match(/\.delivery-panel__header \{[^}]*\}/)?.[0] ?? "";
  assert.notEqual(headerBlock, "");
  assert.doesNotMatch(headerBlock, /position:\s*sticky/);
  assert.doesNotMatch(headerBlock, /background:/);
});

test("the close row is viewport-fixed below the measured site header instead of being bounded by its short header container", () => {
  const closeRowBlock = css.match(/\.delivery-panel__close-row \{[^}]*\}/)?.[0] ?? "";
  assert.notEqual(closeRowBlock, "");
  assert.match(closeRowBlock, /position:\s*fixed/);
  assert.match(closeRowBlock, /top:\s*calc\(var\(--site-header-height, 4\.75rem\) \+ 2\.5rem\)/);
  assert.match(closeRowBlock, /z-index:\s*99/);
  assert.doesNotMatch(closeRowBlock, /position:\s*sticky/);
});
