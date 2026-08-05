import { resolveMediaAltText } from "./mediaAltText.js";

export class MediaPersistenceError extends Error {
  constructor(message, { media, failedKey, stage, cause }) {
    super(message, { cause });
    this.name = "MediaPersistenceError";
    this.media = media;
    this.failedKey = failedKey;
    this.stage = stage;
  }
}

export function mediaItemKey(item) {
  return item.id ?? item.localId;
}

export function hydratePersistedMedia(media, getPublicUrl) {
  return media.map((item) => ({
    ...item,
    publicUrl: item.media_type === "image" && item.storage_path
      ? getPublicUrl(item.storage_path)
      : item.publicUrl,
  }));
}

function mediaPayload(item, postId, position, userId, storagePath) {
  return {
    post_id: postId,
    media_type: item.media_type,
    position,
    is_primary: false,
    storage_path: storagePath,
    external_url: item.external_url ?? null,
    provider: item.provider ?? null,
    provider_media_id: item.provider_media_id ?? null,
    component_key: item.component_key ?? null,
    configuration: item.configuration ?? null,
    alt_text: item.media_type === "image" ? item.alt_text : item.alt_text?.trim() || null,
    caption: item.caption?.trim() || null,
    credit: item.credit?.trim() || null,
    source_url: item.source_url?.trim() || null,
    created_by: item.created_by ?? userId,
  };
}

function withDisplayUrl(item, storagePath, adapter) {
  return {
    ...item,
    storage_path: storagePath,
    publicUrl: storagePath ? adapter.getPublicUrl(storagePath) : item.publicUrl,
    file: null,
    uploadState: null,
  };
}

export async function persistPostMedia({
  postId,
  media,
  originalMediaIds = [],
  postTitle,
  userId,
  storageSegment,
  adapter,
  onProgress = () => {},
}) {
  const resolved = resolveMediaAltText(media, postTitle);
  const working = [...resolved];
  const persisted = [];
  const imageTotal = resolved.filter((item) => item.media_type === "image" && item.file).length;
  let imageNumber = 0;

  await adapter.clearPrimary(postId);

  for (let position = 0; position < resolved.length; position += 1) {
    const item = resolved[position];
    const key = mediaItemKey(item);
    let storagePath = item.storage_path ?? null;
    let uploadedPath = null;
    let stage = "saving media";

    try {
      if (item.media_type === "image" && item.file) {
        imageNumber += 1;
        onProgress(`Processing image ${imageNumber} of ${imageTotal}…`);
        storagePath = `status/${storageSegment}/${postId}/${crypto.randomUUID()}.webp`;
        stage = "uploading image";
        onProgress(`Uploading image ${imageNumber} of ${imageTotal}…`);
        await adapter.uploadImage({ file: item.file, storagePath });
        uploadedPath = storagePath;
      }

      onProgress("Saving media…");
      stage = "saving media";
      const payload = mediaPayload(item, postId, position, userId, storagePath);
      const saved = item.id
        ? await adapter.updateMedia(item.id, payload)
        : await adapter.insertMedia(payload);
      const savedItem = withDisplayUrl({ ...item, ...saved }, storagePath, adapter);
      persisted.push(savedItem);
      working[position] = savedItem;
    } catch (cause) {
      if (uploadedPath) {
        try {
          await adapter.removeImage({ storagePath: uploadedPath });
        } catch {
          // The original database failure remains the actionable error.
        }
      }
      working[position] = { ...item, storage_path: item.storage_path ?? null, uploadState: "failed" };
      throw new MediaPersistenceError(`${stage} failed for media item ${position + 1}.`, {
        media: working,
        failedKey: key,
        stage,
        cause,
      });
    }
  }

  const retainedIds = new Set(persisted.map((item) => String(item.id)));
  const removedIds = originalMediaIds.filter((id) => !retainedIds.has(String(id)));
  const primaryIndex = resolved.findIndex((item) => item.is_primary);
  try {
    if (removedIds.length) await adapter.deleteMedia(removedIds);
    if (primaryIndex >= 0 && persisted[primaryIndex]?.id) {
      await adapter.setPrimary(persisted[primaryIndex].id);
      persisted[primaryIndex] = { ...persisted[primaryIndex], is_primary: true };
    }
  } catch (cause) {
    throw new MediaPersistenceError("finalizing saved media failed.", {
      media: persisted,
      failedKey: null,
      stage: "finalizing saved media",
      cause,
    });
  }

  return persisted.map((item, position) => ({ ...item, position, is_primary: position === primaryIndex }));
}

export function createSupabaseMediaAdapter({ supabase, uploadAdapter }) {
  function expectData(result) {
    if (result.error || !result.data) throw result.error ?? new Error("Media record was not returned.");
    return result.data;
  }

  return {
    uploadImage: (input) => uploadAdapter.uploadImage(input),
    removeImage: (input) => uploadAdapter.removeImage(input),
    getPublicUrl(storagePath) {
      return supabase.storage.from("filebucket").getPublicUrl(storagePath).data.publicUrl;
    },
    async clearPrimary(postId) {
      const result = await supabase.from("post_media").update({ is_primary: false }).eq("post_id", postId).eq("is_primary", true);
      if (result.error) throw result.error;
    },
    async insertMedia(payload) {
      return expectData(await supabase.from("post_media").insert(payload).select("*").single());
    },
    async updateMedia(id, payload) {
      const updates = { ...payload };
      delete updates.created_by;
      return expectData(await supabase.from("post_media").update(updates).eq("id", id).select("*").single());
    },
    async deleteMedia(ids) {
      const result = await supabase.from("post_media").delete().in("id", ids);
      if (result.error) throw result.error;
    },
    async setPrimary(id) {
      const result = await supabase.from("post_media").update({ is_primary: true }).eq("id", id);
      if (result.error) throw result.error;
    },
  };
}
