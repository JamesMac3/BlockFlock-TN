import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(
  new URL("../src/components/CountyContactForm.css", import.meta.url),
  "utf8",
);

const mobileBlock = css.match(/@media \(max-width: 600px\) \{[\s\S]*$/)?.[0] ?? "";

test("the panel sits below the fixed site header, not at the viewport edge (base rule)", () => {
  assert.match(css, /\.county-contact-form \{[\s\S]*?top: var\(--site-header-height, 4\.75rem\);/);
  assert.match(css, /\.county-contact-form \{[\s\S]*?height: calc\(100dvh - var\(--site-header-height, 4\.75rem\)\);/);
});

test("the mobile panel also sits below the header instead of covering it", () => {
  assert.match(mobileBlock, /\.county-contact-form \{[\s\S]*?top: var\(--site-header-height, 4\.75rem\);/);
  assert.match(mobileBlock, /\.county-contact-form \{[\s\S]*?height: calc\(100dvh - var\(--site-header-height, 4\.75rem\)\);/);
  assert.doesNotMatch(
    mobileBlock.match(/\.county-contact-form \{[\s\S]*?\n {2}\}/)?.[0] ?? "not-found",
    /\n {4}bottom: 0;/
  );
});

test("the panel background is fully opaque — no backdrop-filter", () => {
  const panelBlock = css.match(/\.county-contact-form \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.notEqual(panelBlock, "");
  assert.doesNotMatch(panelBlock, /backdrop-filter/);
  assert.match(panelBlock, /background: linear-gradient\(160deg, #102236, #07111f 72%\);/);
});

test("the panel's width accounts for its own padding/border (border-box)", () => {
  assert.match(css, /\.county-contact-form \{[\s\S]*?box-sizing: border-box;/);
  assert.match(css, /\.county-contact-form \{[\s\S]*?max-width: 100vw;/);
});

test("inputs and selects are fully opaque, not translucent white over the panel", () => {
  assert.match(
    css,
    /\.county-contact-content input,\r?\n\.county-contact-content select \{[\s\S]*?background: #dbe6f0;/
  );
  assert.doesNotMatch(css, /background: rgba\(255, 255, 255, 0\.18\);/);
});

test("the focused-field background is also fully opaque", () => {
  assert.match(
    css,
    /\.county-contact-content input:focus,\r?\n\.county-contact-content select:focus \{[\s\S]*?background: #eef5fb;/
  );
  assert.doesNotMatch(css, /background: rgba\(255, 255, 255, 0\.28\);/);
});

test("the content area is the one scrolling surface inside the panel", () => {
  assert.match(css, /\.county-contact-content \{[\s\S]*?overflow-y: auto;/);
  assert.match(css, /\.county-contact-content \{[\s\S]*?height: 100%;/);
});
