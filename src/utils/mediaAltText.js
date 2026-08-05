export function resolveImageAltText({ altText, caption, postTitle, imageNumber, imageCount }) {
  const description = altText?.trim();
  if (description) return description;

  const captionText = caption?.trim();
  if (captionText) return captionText;

  const title = postTitle?.trim() || "this post";
  const imageLabel = imageCount > 1 ? `Image ${imageNumber}` : "Image";
  return `${imageLabel} accompanying “${title}”`;
}

export function resolveMediaAltText(media, postTitle) {
  const imageCount = media.filter((item) => item.media_type === "image").length;
  let imageNumber = 0;
  return media.map((item) => {
    if (item.media_type !== "image") return item;
    imageNumber += 1;
    return {
      ...item,
      alt_text: resolveImageAltText({
        altText: item.alt_text,
        caption: item.caption,
        postTitle,
        imageNumber,
        imageCount,
      }),
    };
  });
}
