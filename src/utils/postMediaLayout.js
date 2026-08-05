import { isValidYouTubeVideoId } from "./urlValidation.js";

export function orderPostMedia(media = []) {
  return [...media].sort((first, second) => (first.position ?? 0) - (second.position ?? 0));
}

export function getEffectivePrimaryMedia(media = []) {
  const ordered = orderPostMedia(media);
  return ordered.find((item) => item.is_primary) ?? ordered[0] ?? null;
}

export function isValidatedYouTubeMedia(media) {
  return media?.media_type === "external_video" &&
    media?.provider === "youtube" &&
    isValidYouTubeVideoId(media?.provider_media_id);
}

export function getPostMediaLayout(media = []) {
  const ordered = orderPostMedia(media);
  const primaryMedia = ordered.find((item) => item.is_primary) ?? ordered[0] ?? null;
  const primaryKey = primaryMedia?.id ?? primaryMedia?.localId;
  return {
    ordered,
    primaryMedia,
    isVideoPrimary: isValidatedYouTubeMedia(primaryMedia),
    remainingMedia: primaryMedia
      ? ordered.filter((item) => (item.id ?? item.localId) !== primaryKey)
      : [],
  };
}
