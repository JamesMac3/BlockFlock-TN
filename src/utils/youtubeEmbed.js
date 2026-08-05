import { isValidYouTubeVideoId } from "./urlValidation.js";

export function buildYouTubeEmbed(media, postTitle = "") {
  if (
    media?.media_type !== "external_video" ||
    media?.provider !== "youtube" ||
    !isValidYouTubeVideoId(media?.provider_media_id)
  ) {
    return null;
  }

  const providerMediaId = media.provider_media_id;
  return {
    src: `https://www.youtube-nocookie.com/embed/${providerMediaId}`,
    title: media.caption?.trim() || (postTitle?.trim() ? `${postTitle.trim()} video` : "YouTube video"),
  };
}
