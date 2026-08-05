import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { buildYouTubeEmbed } from "../../utils/youtubeEmbed";
import { getEffectivePrimaryMedia, orderPostMedia } from "../../utils/postMediaLayout";
import ExternalLinkWarning from "./ExternalLinkWarning";
import "./PostContent.css";

function mediaUrl(item) {
  if (item.previewUrl || item.publicUrl) return item.previewUrl ?? item.publicUrl;
  if (!item.storage_path) return null;
  return supabase.storage.from("filebucket").getPublicUrl(item.storage_path).data.publicUrl;
}

function ImageGallery({ images }) {
  const [index, setIndex] = useState(0);
  const image = images[index];
  return (
    <figure className="post-image-gallery" onKeyDown={(event) => {
      if (event.key === "ArrowRight") setIndex((index + 1) % images.length);
      if (event.key === "ArrowLeft") setIndex((index - 1 + images.length) % images.length);
    }} tabIndex="0">
      <img src={mediaUrl(image)} alt={image.alt_text?.trim() || ""} />
      {(image.caption || image.credit || image.source_url) && <figcaption>{image.caption}{image.credit ? ` — ${image.credit}` : ""}{image.source_url && <> <a href={image.source_url}>Source</a></>}</figcaption>}
      {images.length > 1 && <div className="post-image-gallery__controls">
        <button type="button" onClick={() => setIndex((index - 1 + images.length) % images.length)}>Previous</button>
        <span>{index + 1} of {images.length}</span>
        <button type="button" onClick={() => setIndex((index + 1) % images.length)}>Next</button>
      </div>}
    </figure>
  );
}

function YouTubeMediaCard({ item, postTitle }) {
  const embed = buildYouTubeEmbed(item, postTitle);
  if (!embed) return null;
  return <div className="youtube-embed"><iframe src={embed.src} title={embed.title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture" allowFullScreen /></div>;
}

function OrderedSecondaryMedia({ media, postTitle }) {
  const groups = media.reduce((result, item) => {
    const previous = result.at(-1);
    if (item.media_type === "image" && Array.isArray(previous)) previous.push(item);
    else result.push(item.media_type === "image" ? [item] : item);
    return result;
  }, []);

  return groups.map((group, index) => {
    if (Array.isArray(group)) return <ImageGallery key={`images-${group[0].id ?? group[0].localId ?? index}`} images={group} />;
    if (group.media_type === "external_video") return <YouTubeMediaCard key={group.id ?? group.localId ?? index} item={group} postTitle={postTitle} />;
    if (group.media_type === "external_link") return <a className="post-external-link-card" key={group.id ?? group.localId ?? index} href={group.external_url}>{group.caption || group.external_url}</a>;
    if (group.media_type === "component") return <p key={group.id ?? group.localId ?? index}>This referenced component is not currently available.</p>;
    return null;
  });
}

export default function PostMediaRenderer({ media = [], postTitle = "", preserveOrder = false }) {
  const supported = orderPostMedia(media);
  if (!supported.length) return null;
  if (preserveOrder) return <ExternalLinkWarning><div className="post-media-renderer"><OrderedSecondaryMedia media={supported} postTitle={postTitle} /></div></ExternalLinkWarning>;

  const primary = getEffectivePrimaryMedia(supported);
  const images = supported
    .filter((item) => item.media_type === "image")
    .sort((first, second) => Number(second === primary) - Number(first === primary));
  const others = supported.filter((item) => item.media_type !== "image" && item !== primary);
  return <ExternalLinkWarning><div className="post-media-renderer">
    {primary?.media_type === "external_video" && <YouTubeMediaCard item={primary} postTitle={postTitle} />}
    {primary?.media_type === "external_link" && <a className="post-external-link-card" href={primary.external_url}>{primary.caption || primary.external_url}</a>}
    {primary?.media_type === "component" && <p>This referenced component is not currently available.</p>}
    {images.length > 0 && <ImageGallery images={images} />}
    {others.map((item) => {
      if (item.media_type === "external_video") return <YouTubeMediaCard key={item.id ?? item.localId} item={item} postTitle={postTitle} />;
      if (item.media_type === "external_link") return <a className="post-external-link-card" key={item.id ?? item.localId} href={item.external_url}>{item.caption || item.external_url}</a>;
      if (item.media_type === "component") return <p key={item.id ?? item.localId}>This referenced component is not currently available.</p>;
      return null;
    })}
  </div></ExternalLinkWarning>;
}
