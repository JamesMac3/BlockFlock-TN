import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { validateExternalUrl } from "../../utils/urlValidation";
import { buildDraftPostPayload, buildPublishPayload, runWithVerifiedUser } from "../../utils/postPayload";
import {
  MediaPersistenceError,
  createSupabaseMediaAdapter,
  hydratePersistedMedia,
  persistPostMedia,
} from "../../utils/postMediaPersistence";
import PostMediaManager from "./PostMediaManager";
import RichTextEditor from "./RichTextEditor";
import StatusPostCard from "../status/StatusPostCard";

const baseSchema = z.object({
  title: z.string().trim().min(1, "A title is required."),
  scope: z.enum(["global", "county"]),
  countyId: z.string(),
  contentType: z.enum(["announcement", "meeting", "investigation", "records", "action"]),
  summary: z.string().trim().max(600, "Keep the summary under 600 characters."),
});

const EMPTY_POST = {
  title: "",
  scope: "global",
  countyId: "",
  contentType: "announcement",
  summary: "",
  body: "",
  bodyRich: null,
  eventStart: "",
  eventLocation: "",
  eventAddress: "",
  isPinned: false,
  massEmail: false,
};

function initialValues(post, creationType) {
  if (!post) return { ...EMPTY_POST, contentType: creationType === "meeting" ? "meeting" : "announcement" };
  return {
    title: post.title ?? "",
    scope: post.scope ?? "global",
    countyId: post.county_id ? String(post.county_id) : "",
    contentType: post.content_type ?? "announcement",
    summary: post.summary ?? "",
    body: post.body ?? "",
    bodyRich: post.body_rich ?? null,
    eventStart: post.event_start ? new Date(post.event_start).toISOString().slice(0, 16) : "",
    eventLocation: post.event_location ?? "",
    eventAddress: post.event_address ?? "",
    isPinned: Boolean(post.is_pinned),
    massEmail: false,
  };
}

export default function PostComposer({
  mode,
  creationType,
  initialPost,
  counties,
  capabilities,
  uploadAdapter,
  user,
  onComplete,
  onCancel,
}) {
  const [form, setForm] = useState(() => initialValues(initialPost, creationType));
  const mediaAdapter = useMemo(() => createSupabaseMediaAdapter({ supabase, uploadAdapter }), [uploadAdapter]);
  const [media, setMedia] = useState(() => hydratePersistedMedia(initialPost?.post_media ?? [], mediaAdapter.getPublicUrl));
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [savedPost, setSavedPost] = useState(initialPost ?? null);
  const [retryPublish, setRetryPublish] = useState(null);
  const [dirty, setDirty] = useState(false);
  const originalMediaIdsRef = useRef((initialPost?.post_media ?? []).map((item) => item.id).filter(Boolean));
  const submissionLockRef = useRef(false);
  const selectedCounty = useMemo(() => counties.find((county) => String(county.id) === form.countyId), [counties, form.countyId]);
  const meetingOnly = creationType === "meeting";

  useEffect(() => {
    const hasLocalMedia = media.some((item) => item.file || item.uploadState === "failed");
    if (!submitting && !hasLocalMedia) return undefined;
    function warnBeforeLeaving(event) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [media, submitting]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setDirty(true);
  }

  function validate(publish) {
    const result = baseSchema.safeParse(form);
    if (!result.success) return result.error.issues[0].message;
    if (form.scope === "county" && !form.countyId) return "Select a county for a county post.";
    if (meetingOnly && publish && !form.eventStart) return "A meeting date is required before publishing a meeting listing.";
    if (!meetingOnly && !form.body.trim()) return "Add post body text before saving.";
    for (const [index, item] of media.entries()) {
      for (const value of [item.source_url, item.external_url]) {
        if (value && !validateExternalUrl(value).valid) return `Media item ${index + 1} contains an invalid HTTPS URL.`;
      }
    }
    return null;
  }

  async function save(publish) {
    if (submissionLockRef.current) return;
    submissionLockRef.current = true;
    setError("");
    setRetryPublish(null);
    const validationError = validate(publish);
    if (validationError) {
      setError(validationError);
      submissionLockRef.current = false;
      return;
    }

    let authenticatedUser;
    try {
      authenticatedUser = await runWithVerifiedUser({
        auth: supabase.auth,
        expectedUser: user,
        operation: async (verifiedUser) => verifiedUser,
      });
    } catch (sessionError) {
      setError(sessionError.message);
      setProgress("");
      submissionLockRef.current = false;
      return;
    }

    setSubmitting(true);
    setProgress(meetingOnly ? "Saving meeting…" : "Saving draft…");

    let post;
    const payload = buildDraftPostPayload({
      form,
      meetingOnly,
      authenticatedUser,
      existingPost: savedPost,
    });
    const targetPostId = savedPost?.id;
    const request = targetPostId
      ? supabase.from("posts").update(payload).eq("id", targetPostId).select("*").single()
      : supabase.from("posts").insert(payload).select("*").single();
    const { data, error: postError } = await request;
    if (postError || !data) {
      setError(postError?.message ?? "The draft could not be saved.");
      setProgress("");
      setSubmitting(false);
      submissionLockRef.current = false;
      return;
    }
    post = data;
    setSavedPost(post);

    try {
      const persistedMedia = await persistPostMedia({
        postId: post.id,
        media,
        originalMediaIds: originalMediaIdsRef.current,
        postTitle: form.title,
        userId: authenticatedUser.id,
        storageSegment: form.scope === "global" ? "global" : selectedCounty.slug,
        adapter: mediaAdapter,
        onProgress: setProgress,
      });
      setMedia(persistedMedia);
      originalMediaIdsRef.current = persistedMedia.map((item) => item.id).filter(Boolean);
    } catch (mediaError) {
      if (mediaError instanceof MediaPersistenceError) {
        setMedia(mediaError.media);
        originalMediaIdsRef.current = mediaError.media.map((item) => item.id).filter(Boolean);
      }
      setError(`Draft text saved, but 1 image failed to upload. Retry before leaving this page. ${mediaError.cause?.message ?? mediaError.message}`);
      setRetryPublish(publish);
      setProgress("");
      setSubmitting(false);
      submissionLockRef.current = false;
      return;
    }

    if (publish) {
      setProgress("Publishing...");
      const { data: published, error: publishError } = await supabase
        .from("posts")
        .update(buildPublishPayload(authenticatedUser))
        .eq("id", post.id)
        .select("*")
        .single();
      if (publishError) {
        setError(`${publishError.message} The post remains a draft.`);
        setRetryPublish(publish);
        setSubmitting(false);
        submissionLockRef.current = false;
        return;
      }
      post = published;
      setSavedPost(post);
    }

    setProgress(publish ? "Published" : "Draft saved");
    setSubmitting(false);
    submissionLockRef.current = false;
    onComplete?.(post);
  }

  const previewPost = {
    ...initialPost,
    title: form.title || "Untitled preview",
    scope: form.scope,
    county_id: form.countyId || null,
    content_type: meetingOnly ? "meeting" : form.contentType,
    summary: form.summary,
    body: meetingOnly ? form.summary : form.body,
    body_rich: meetingOnly ? null : form.bodyRich,
    event_start: form.eventStart,
    event_location: form.eventLocation,
    event_address: form.eventAddress,
    is_pinned: form.isPinned,
    post_media: media,
  };

  return (
    <section className="post-composer" aria-labelledby="post-composer-title">
      <header><div><p>{mode} composer</p><h2 id="post-composer-title">{initialPost ? "Edit" : meetingOnly ? "Create meeting without post" : "Publish update"}</h2>{meetingOnly && <span>Add a meeting to the schedule without publishing a full county update.</span>}</div><button type="button" onClick={onCancel} disabled={submitting}>Close</button></header>
      <fieldset disabled={submitting}>
        <div className="composer-metadata-row">
          <label>Scope<select value={form.scope} onChange={(event) => update("scope", event.target.value)}><option value="global">Statewide</option><option value="county">County</option></select></label>
          {form.scope === "county" && <label>County<select value={form.countyId} onChange={(event) => update("countyId", event.target.value)} required><option value="">Select county</option>{counties.map((county) => <option key={county.id} value={county.id}>{county.name}</option>)}</select></label>}
          {!meetingOnly && <label>Content type<select value={form.contentType} onChange={(event) => update("contentType", event.target.value)}>{["announcement", "meeting", "investigation", "records", "action"].map((type) => <option key={type} value={type}>{type}</option>)}</select></label>}
        </div>
        <div className={`post-composer-canvas ${meetingOnly ? "is-meeting-only" : ""}`}>
          {!meetingOnly && capabilities.canManageMedia && <PostMediaManager media={media} onChange={(nextMedia) => { setMedia(nextMedia); setDirty(true); }} disabled={submitting} />}
          <label className="composer-title-field">Title<input value={form.title} onChange={(event) => update("title", event.target.value)} required placeholder={meetingOnly ? "Meeting title" : "Update title"} /></label>
          <label className="composer-summary-field">{meetingOnly ? "Short description" : "Summary"}<textarea value={form.summary} onChange={(event) => update("summary", event.target.value)} rows="3" maxLength="600" /><span>{meetingOnly ? "Add the essential meeting context." : "This appears in condensed status cards and county overviews."} <strong>{form.summary.length}/600</strong></span></label>
          {!meetingOnly && <div className="composer-body-field"><label>Body</label><RichTextEditor initialContent={form.bodyRich || form.body} disabled={submitting} onChange={({ json, text }) => { setForm((current) => ({ ...current, bodyRich: json, body: text })); setDirty(true); }} /></div>}
          {meetingOnly ? <div className="composer-grid"><label>Date and time<input type="datetime-local" value={form.eventStart} onChange={(event) => update("eventStart", event.target.value)} /></label><label>Location<input value={form.eventLocation} onChange={(event) => update("eventLocation", event.target.value)} /></label><label>Address or online link<input value={form.eventAddress} onChange={(event) => update("eventAddress", event.target.value)} /></label></div> : form.contentType === "meeting" && <details className="composer-meeting-details"><summary>Add meeting details</summary><div className="composer-grid"><label>Date and time<input type="datetime-local" value={form.eventStart} onChange={(event) => update("eventStart", event.target.value)} /></label><label>Location<input value={form.eventLocation} onChange={(event) => update("eventLocation", event.target.value)} /></label><label>Address or online information<input value={form.eventAddress} onChange={(event) => update("eventAddress", event.target.value)} /></label></div></details>}
        </div>
        {!meetingOnly && <details className="composer-publication-settings"><summary>Publication settings</summary>{capabilities.canPin && <label className="composer-check"><input type="checkbox" checked={form.isPinned} onChange={(event) => update("isPinned", event.target.checked)} /> Pin this post</label>}{capabilities.canMassEmail && <label className="composer-check"><input type="checkbox" checked={form.massEmail} onChange={(event) => update("massEmail", event.target.checked)} /> Mark for a future mass-email job</label>}<p>This update will appear in the public status feed when published.</p></details>}
      </fieldset>
      {error && <p className="composer-error" role="alert">{error}</p>}
      {retryPublish !== null && <div className="composer-retry-actions"><button type="button" onClick={() => save(retryPublish)}>Retry upload</button><button type="button" onClick={() => onComplete?.(savedPost)}>Return to draft</button></div>}
      {progress && <p className="submission-progress" role="status">{progress}</p>}
      {previewing && <div className="composer-preview"><StatusPostCard post={previewPost} countyName={selectedCounty?.name ?? "Tennessee"} /></div>}
      <div className="composer-actions composer-actions--sticky">
        <span>{dirty ? "Unsaved changes" : "No unsaved changes"}</span>
        <button type="button" onClick={() => save(false)} disabled={submitting}>Save draft</button>
        {!meetingOnly && <button type="button" onClick={() => setPreviewing((current) => !current)} disabled={submitting}>{previewing ? "Close preview" : "Preview"}</button>}
        <button type="button" onClick={() => save(true)} disabled={submitting}>{meetingOnly ? "Publish meeting" : "Publish"}</button>
      </div>
    </section>
  );
}
