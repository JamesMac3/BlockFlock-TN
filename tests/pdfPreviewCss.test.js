import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(
  new URL("../src/components/pdf/PdfPreview.css", import.meta.url),
  "utf8",
);

test("the page stack has no fixed height or auto/scroll overflow of its own — it must not trap a nested scroll region on mobile", () => {
  assert.doesNotMatch(css, /overflow(-y)?:\s*(auto|scroll)/);
  assert.doesNotMatch(css, /height:\s*\d/);
});
