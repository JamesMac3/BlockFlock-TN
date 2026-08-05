import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MediaPersistenceError,
  hydratePersistedMedia,
  persistPostMedia,
} from "../src/utils/postMediaPersistence.js";

function createAdapter({ failUpload = false, failInsert = false } = {}) {
  const events = [];
  let nextId = 100;
  return {
    events,
    getPublicUrl: (path) => `https://storage.example/filebucket/${path}`,
    async clearPrimary(postId) { events.push(["clear-primary", postId]); },
    async uploadImage({ storagePath }) {
      events.push(["upload", storagePath]);
      if (failUpload) throw new Error("storage unavailable");
    },
    async removeImage({ storagePath }) { events.push(["remove-upload", storagePath]); },
    async insertMedia(payload) {
      events.push(["insert", payload]);
      if (failInsert) throw new Error("row rejected");
      return { ...payload, id: nextId++ };
    },
    async updateMedia(id, payload) { events.push(["update", id, payload]); return { ...payload, id }; },
    async deleteMedia(ids) { events.push(["delete", ids]); },
    async setPrimary(id) { events.push(["set-primary", id]); },
  };
}

const LOCAL_IMAGE = {
  localId: "local-one",
  media_type: "image",
  file: { name: "camera.webp" },
  previewUrl: "blob:temporary-preview",
  alt_text: "",
  caption: "",
  is_primary: true,
};

test("draft persistence uploads before inserting and reopens from the real Storage URL", async () => {
  const adapter = createAdapter();
  const saved = await persistPostMedia({ postId: 42, media: [LOCAL_IMAGE], postTitle: "County update", userId: "admin", storageSegment: "rutherford", adapter });
  assert.equal(adapter.events.findIndex(([event]) => event === "upload") < adapter.events.findIndex(([event]) => event === "insert"), true);
  assert.equal(saved[0].id, 100);
  assert.match(saved[0].storage_path, /^status\/rutherford\/42\/.+\.webp$/);
  assert.equal(saved[0].file, null);
  assert.equal(saved[0].alt_text, "Image accompanying “County update”");

  const reopened = hydratePersistedMedia([{ ...saved[0], publicUrl: undefined }], adapter.getPublicUrl);
  assert.equal(reopened[0].publicUrl, `https://storage.example/filebucket/${saved[0].storage_path}`);
});

test("editing does not reupload saved images and adding a second uploads only the new image", async () => {
  const existing = { id: 7, media_type: "image", storage_path: "status/global/42/saved.webp", alt_text: "Saved", is_primary: true };
  const adapter = createAdapter();
  const firstSave = await persistPostMedia({ postId: 42, media: [existing], originalMediaIds: [7], postTitle: "Update", userId: "admin", storageSegment: "global", adapter });
  assert.equal(adapter.events.filter(([event]) => event === "upload").length, 0);

  adapter.events.length = 0;
  await persistPostMedia({ postId: 42, media: [...firstSave, { ...LOCAL_IMAGE, is_primary: false }], originalMediaIds: [7], postTitle: "Update", userId: "admin", storageSegment: "global", adapter });
  assert.equal(adapter.events.filter(([event]) => event === "upload").length, 1);
  assert.equal(adapter.events.filter(([event]) => event === "update").length, 1);
  assert.equal(adapter.events.filter(([event]) => event === "insert").length, 1);
});

test("failed upload retains local media and never creates a broken row", async () => {
  const adapter = createAdapter({ failUpload: true });
  await assert.rejects(
    persistPostMedia({ postId: 42, media: [LOCAL_IMAGE], postTitle: "Saved text", userId: "admin", storageSegment: "global", adapter }),
    (error) => {
      assert.equal(error instanceof MediaPersistenceError, true);
      assert.equal(error.media[0].file, LOCAL_IMAGE.file);
      assert.equal(error.media[0].uploadState, "failed");
      return true;
    },
  );
  assert.equal(adapter.events.some(([event]) => event === "insert"), false);
});

test("database failure after upload removes the orphan and retains the local item", async () => {
  const adapter = createAdapter({ failInsert: true });
  await assert.rejects(
    persistPostMedia({ postId: 42, media: [LOCAL_IMAGE], postTitle: "Saved text", userId: "admin", storageSegment: "global", adapter }),
    MediaPersistenceError,
  );
  const upload = adapter.events.find(([event]) => event === "upload");
  const cleanup = adapter.events.find(([event]) => event === "remove-upload");
  assert.equal(cleanup[1], upload[1]);
});

test("Save Draft and Publish share persistence and repeated submissions are locked", () => {
  const composer = readFileSync(new URL("../src/components/post-composer/PostComposer.jsx", import.meta.url), "utf8");
  assert.equal((composer.match(/await persistPostMedia\(/g) ?? []).length, 1);
  assert.match(composer, /if \(submissionLockRef\.current\) return/);
  assert.match(composer, /submissionLockRef\.current = true/);
  assert.doesNotMatch(composer, /from\("post_media"\)\.delete\(\)\.eq\("post_id"/);
  assert.match(composer, /Draft text saved, but 1 image failed to upload/);
});
