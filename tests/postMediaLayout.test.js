import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getEffectivePrimaryMedia,
  getPostMediaLayout,
  isValidatedYouTubeMedia,
} from "../src/utils/postMediaLayout.js";

const video = { id: 2, position: 2, media_type: "external_video", provider: "youtube", provider_media_id: "AbCdEf12345" };
const image = { id: 1, position: 1, media_type: "image", storage_path: "status/global/image.webp" };
const link = { id: 3, position: 3, media_type: "external_link", external_url: "https://example.org" };

test("explicit validated YouTube primary selects video-first layout", () => {
  const layout = getPostMediaLayout([image, { ...video, is_primary: true }, link]);
  assert.equal(layout.isVideoPrimary, true);
  assert.equal(layout.primaryMedia.id, video.id);
  assert.deepEqual(layout.remainingMedia.map(({ id }) => id), [image.id, link.id]);
});

test("first positioned media is effective primary when no explicit primary exists", () => {
  assert.equal(getEffectivePrimaryMedia([link, video, image]).id, image.id);
  assert.equal(getPostMediaLayout([{ ...video, position: 0 }, image]).isVideoPrimary, true);
});

test("secondary YouTube media does not force video-first layout", () => {
  const layout = getPostMediaLayout([{ ...image, is_primary: true }, video]);
  assert.equal(layout.isVideoPrimary, false);
  assert.deepEqual(layout.remainingMedia.map(({ id }) => id), [video.id]);
});

test("image-primary, text-only, and invalid-video posts retain normal layout", () => {
  assert.equal(getPostMediaLayout([image, video]).isVideoPrimary, false);
  assert.equal(getPostMediaLayout([]).isVideoPrimary, false);
  assert.equal(isValidatedYouTubeMedia({ ...video, provider_media_id: "invalid id" }), false);
  assert.equal(isValidatedYouTubeMedia({ ...video, provider: "other" }), false);
});

test("primary exclusion never duplicates video and remaining media preserves order", () => {
  const layout = getPostMediaLayout([link, { ...video, position: 0, is_primary: true }, image]);
  assert.equal(layout.remainingMedia.some(({ id }) => id === video.id), false);
  assert.deepEqual(layout.remainingMedia.map(({ id }) => id), [image.id, link.id]);
});

test("shared status card supplies public feeds and previews with the same video-first structure", () => {
  const card = readFileSync(new URL("../src/components/status/StatusPostCard.jsx", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../src/pages/AdminPostPreview.jsx", import.meta.url), "utf8");
  const composer = readFileSync(new URL("../src/components/post-composer/PostComposer.jsx", import.meta.url), "utf8");
  assert.match(card, /getPostMediaLayout/);
  assert.match(card, /status-post-card__primary-video[\s\S]*writtenContent[\s\S]*status-post-card__secondary-media/);
  assert.match(card, /remainingMedia[\s\S]*preserveOrder/);
  assert.match(preview, /<StatusPostCard/);
  assert.match(composer, /<StatusPostCard post=\{previewPost\}/);
});

test("video-first CSS fills the card at 16:9 and remains mobile-safe", () => {
  const statusStyles = readFileSync(new URL("../src/pages/CountyStatusPage.css", import.meta.url), "utf8");
  const mediaStyles = readFileSync(new URL("../src/components/post-composer/PostContent.css", import.meta.url), "utf8");
  assert.match(statusStyles, /status-post-card__primary-video \{[\s\S]*width: 100%[\s\S]*aspect-ratio: 16 \/ 9[\s\S]*background: #000/);
  assert.match(statusStyles, /status-post-card--video-primary[\s\S]*max-width: 68\.75rem/);
  assert.match(statusStyles, /@media \(max-width: 680px\)[\s\S]*status-post-card--video-primary \.status-post-card__content[\s\S]*padding: 1\.25rem/);
  assert.match(mediaStyles, /youtube-embed iframe \{[^}]*width: 100%[^}]*height: 100%[^}]*border: 0/);
});
