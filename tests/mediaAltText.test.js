import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveImageAltText, resolveMediaAltText } from "../src/utils/mediaAltText.js";

test("manual descriptions and caption fallbacks are preserved", () => {
  assert.equal(resolveImageAltText({ altText: "  People entering a library  ", caption: "Ignored", postTitle: "Meeting", imageNumber: 1, imageCount: 1 }), "People entering a library");
  assert.equal(resolveImageAltText({ altText: "", caption: "  Community meeting room  ", postTitle: "Meeting", imageNumber: 1, imageCount: 1 }), "Community meeting room");
});

test("blank optional metadata creates title and order-aware fallback text", () => {
  const resolved = resolveMediaAltText([
    { localId: "first", media_type: "image", alt_text: "", caption: "" },
    { localId: "link", media_type: "external_link" },
    { localId: "second", media_type: "image", alt_text: "   ", caption: "   " },
  ], "Rutherford County Community Meeting");
  assert.equal(resolved[0].alt_text, "Image 1 accompanying “Rutherford County Community Meeting”");
  assert.equal(resolved[2].alt_text, "Image 2 accompanying “Rutherford County Community Meeting”");
  assert.equal(resolved[1].alt_text, undefined);
});

test("reordering changes generated numbering without overwriting existing descriptions", () => {
  const saved = { id: 1, media_type: "image", alt_text: "Existing description" };
  const local = { localId: "new", media_type: "image", alt_text: "" };
  const reordered = resolveMediaAltText([local, saved], "County update");
  assert.equal(reordered[0].alt_text, "Image 1 accompanying “County update”");
  assert.equal(reordered[1].alt_text, "Existing description");
});

test("single image fallback omits a redundant number", () => {
  assert.equal(resolveMediaAltText([{ media_type: "image", alt_text: "", caption: "" }], "Update")[0].alt_text, "Image accompanying “Update”");
});

test("composer retains hydration, limits, retry handling, and accessible overlay controls", () => {
  const manager = readFileSync(new URL("../src/components/post-composer/PostMediaManager.jsx", import.meta.url), "utf8");
  const composer = readFileSync(new URL("../src/components/post-composer/PostComposer.jsx", import.meta.url), "utf8");
  assert.match(composer, /initialPost\?\.post_media \?\? \[\]/);
  assert.match(manager, /onChange\(\[\.\.\.media, \.\.\.additions\]\)/);
  assert.match(manager, /const MAX_IMAGES = 6/);
  assert.match(manager, /const MAX_IMAGE_BYTES = 500000/);
  assert.match(composer, /Retry upload/);
  assert.match(manager, /post-media-remove" aria-label=/);
  assert.match(manager, /aria-label=\{`Move media/);
  assert.match(manager, /aria-label=\{`Make media/);
  assert.match(manager, /aria-label=\{`Edit details/);
  assert.doesNotMatch(manager, /Alt text is required|Alt text required/);
  assert.doesNotMatch(composer, /needs alternative text/);
});

test("public renderer defensively supplies empty alt text and mobile grid avoids overflow", () => {
  const renderer = readFileSync(new URL("../src/components/post-composer/PostMediaRenderer.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/components/admin/AdminPostDashboard.css", import.meta.url), "utf8");
  assert.match(renderer, /alt=\{image\.alt_text\?\.trim\(\) \|\| ""\}/);
  assert.match(styles, /post-media-strip \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /post-media-thumbnail \{ min-width: 0/);
});
