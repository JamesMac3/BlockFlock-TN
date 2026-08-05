import { lazy, Suspense, useState } from "react";
import { supabase } from "../../lib/supabase";
import { getPostMediaLayout } from "../../utils/postMediaLayout";

const PostMediaRenderer = lazy(() => import("../post-composer/PostMediaRenderer"));
const RichTextRenderer = lazy(() => import("../post-composer/RichTextRenderer"));

const TYPE_LABELS = {
  announcement: "Announcement",
  meeting: "Meeting",
  investigation: "Investigation",
  records: "Public Records",
  action: "Action Request",
};

function formatDate(value, options) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(
    undefined,
    options ?? { dateStyle: "long" }
  ).format(date);
}

function StatusPostImage({ post, eager }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = post.cover_image_path
    ? supabase.storage.from("filebucket").getPublicUrl(post.cover_image_path).data.publicUrl
    : null;

  if (!imageUrl || failed) {
    return null;
  }

  return (
    <div className="status-post-image">
      <img
        src={imageUrl}
        alt={post.cover_image_alt || ""}
        loading={eager ? "eager" : "lazy"}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function MeetingDetails({ post }) {
  if (!post.event_start && !post.event_location && !post.event_address) return null;

  const eventDate = formatDate(post.event_start, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <dl className="status-post-meeting">
      {eventDate && <div><dt>Meeting date</dt><dd>{eventDate}</dd></div>}
      {post.event_location && <div><dt>Location</dt><dd>{post.event_location}</dd></div>}
      {post.event_address && <div><dt>Address</dt><dd>{post.event_address}</dd></div>}
    </dl>
  );
}

export default function StatusPostCard({ post, countyName, eager = false }) {
  const publishedDate = formatDate(post.approved_at ?? post.created_at);
  const isStatewide = post.scope === "global";
  const mediaLayout = getPostMediaLayout(post.post_media);
  const cardClasses = [
    "status-post-card",
    post.is_pinned && "status-post-card--pinned",
    mediaLayout.isVideoPrimary && "status-post-card--video-primary",
  ].filter(Boolean).join(" ");

  const writtenContent = <div className="status-post-card__content">
    <div className="status-post-card__labels">
      <span>{TYPE_LABELS[post.content_type] ?? "Update"}</span>
      <span>{isStatewide ? "Statewide" : countyName}</span>
      {post.is_pinned && <strong>Pinned</strong>}
    </div>
    <h2>{post.title}</h2>
    {post.summary && <p className="status-post-card__summary">{post.summary}</p>}
    {(post.body_rich || post.body) && <div className="status-post-card__body"><Suspense fallback={<p>{post.body}</p>}><RichTextRenderer bodyRich={post.body_rich} body={post.body} /></Suspense></div>}
    <MeetingDetails post={post} />
    {publishedDate && <p className="status-post-card__date">Published {publishedDate}</p>}
  </div>;

  return (
    <article className={cardClasses}>
      {mediaLayout.isVideoPrimary ? <>
        <div className="status-post-card__primary-video">
          <Suspense fallback={<div className="status-post-image status-post-image--fallback" aria-hidden="true" />}><PostMediaRenderer media={[mediaLayout.primaryMedia]} postTitle={post.title} /></Suspense>
        </div>
        {writtenContent}
        {mediaLayout.remainingMedia.length > 0 && <div className="status-post-card__secondary-media"><Suspense fallback={null}><PostMediaRenderer media={mediaLayout.remainingMedia} postTitle={post.title} preserveOrder /></Suspense></div>}
      </> : <>
        {post.post_media?.length ? (
        <Suspense fallback={<div className="status-post-image status-post-image--fallback" aria-hidden="true" />}><PostMediaRenderer media={post.post_media} postTitle={post.title} /></Suspense>
        ) : <StatusPostImage post={post} eager={eager} />}
        {writtenContent}
      </>}
    </article>
  );
}
