import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildYouTubeEmbed } from "../src/utils/youtubeEmbed.js";

const VALID_MEDIA = {
  media_type: "external_video",
  provider: "youtube",
  provider_media_id: "AbCdEf12345",
  external_url: "https://attacker.example/raw-url-must-not-be-used",
};

test("validated YouTube media builds a privacy-enhanced embed from only its video ID", () => {
  const embed = buildYouTubeEmbed(VALID_MEDIA, "County camera update");
  assert.equal(embed.src, "https://www.youtube-nocookie.com/embed/AbCdEf12345");
  assert.equal(embed.src.includes(VALID_MEDIA.external_url), false);
  assert.equal(embed.title, "County camera update video");
});

test("embed titles prefer captions and retain a useful generic fallback", () => {
  assert.equal(buildYouTubeEmbed({ ...VALID_MEDIA, caption: "Council testimony" }, "Post").title, "Council testimony");
  assert.equal(buildYouTubeEmbed(VALID_MEDIA).title, "YouTube video");
});

test("invalid provider, type, and video IDs never create embeds", () => {
  assert.equal(buildYouTubeEmbed({ ...VALID_MEDIA, provider: "lookalike" }), null);
  assert.equal(buildYouTubeEmbed({ ...VALID_MEDIA, media_type: "external_link" }), null);
  assert.equal(buildYouTubeEmbed({ ...VALID_MEDIA, provider_media_id: "bad id<script>" }), null);
  assert.equal(buildYouTubeEmbed({ ...VALID_MEDIA, provider_media_id: "x" }), null);
});

test("shared renderer immediately renders a responsive lazy iframe without consent UI", () => {
  const renderer = readFileSync(new URL("../src/components/post-composer/PostMediaRenderer.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/components/post-composer/PostContent.css", import.meta.url), "utf8");
  assert.match(renderer, /<iframe src=\{embed\.src\}/);
  assert.match(renderer, /loading="lazy"/);
  assert.match(renderer, /allowFullScreen/);
  assert.doesNotMatch(renderer, /item\.external_url.*iframe|iframe.*item\.external_url/);
  assert.doesNotMatch(renderer, /Load video|This video is hosted by YouTube|Open on YouTube|youtube-consent/);
  assert.match(styles, /youtube-embed \{[^}]*width: 100%[^}]*aspect-ratio: 16 \/ 9/);
  assert.doesNotMatch(styles, /youtube-consent/);
});

test("ordinary external links retain the existing leaving-site warning wrapper", () => {
  const renderer = readFileSync(new URL("../src/components/post-composer/PostMediaRenderer.jsx", import.meta.url), "utf8");
  const warning = readFileSync(new URL("../src/components/post-composer/ExternalLinkWarning.jsx", import.meta.url), "utf8");
  assert.match(renderer, /<ExternalLinkWarning>/);
  assert.match(renderer, /post-external-link-card/);
  assert.match(warning, /You are leaving Flock Block Tennessee/);
});
