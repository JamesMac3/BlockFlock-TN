import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { validateExternalUrl } from "../../utils/urlValidation";
import { buildDraftPostPayload, runWithVerifiedUser } from "../../utils/postPayload";
import { chicagoWallTimeToUtcIso, toChicagoDateTimeLocalValue } from "../../features/portal-admin/chicagoTime";
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
  locationName: "",
  streetAddress: "",
  city: "",
  postalCode: "",
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
    locationName: "",
    streetAddress: "",
    city: "",
    postalCode: "",
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
  // Any post whose content type is "meeting" — whether created via the
  // quick "Create meeting without post" flow or by switching an ordinary
  // post's content type — is saved through rrg_save_post_with_meeting,
  // which writes the post and its linked meetings row in one transaction.
  const isMeetingPost = meetingOnly || form.contentType === "meeting";

  // Editing an existing meeting post: prefill the structured location
  // fields from its linked meetings row. meetings has RLS forced with no
  // direct-table policies, so this goes through rrg_list_meetings (the
  // only read path available) rather than a direct table select.
  useEffect(() => {
    if (!initialPost || initialPost.content_type !== "meeting") return undefined;
    let active = true;
    async function loadLinkedMeeting() {
      const { data } = await supabase.rpc("rrg_list_meetings", {
        p_status: null,
        p_county_id: null,
        p_page: 1,
        p_page_size: 100,
      });
      if (!active) return;
      const match = (data ?? []).find((row) => row.source_post_id === initialPost.id);
      if (match) {
        setForm((current) => ({
          ...current,
          eventStart: toChicagoDateTimeLocalValue(match.starts_at),
          locationName: match.location_name ?? "",
          streetAddress: match.street_address ?? "",
          city: match.city ?? "",
          postalCode: match.postal_code ?? "",
        }));
      }
    }
    loadLinkedMeeting();
    return () => { active = false; };
  }, [initialPost]);

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

  function validate() {
    const result = baseSchema.safeParse(form);
    if (!result.success) return result.error.issues[0].message;
    if (form.scope === "county" && !form.countyId) return "Select a county for a county post.";
    if (isMeetingPost) {
      if (!form.summary.trim()) return "A short description is required for a meeting post.";
      if (!form.eventStart) return "A meeting date and time are required.";
      if (!form.locationName.trim() || !form.streetAddress.trim() || !form.city.trim()) {
        return "A complete meeting location (venue name, street address, and city) is required.";
      }
      return null;
    }
    if (!form.body.trim()) return "Add post body text before saving.";
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
    const validationError = validate();
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

    // Meeting posts are saved and submitted through a single transactional
    // RPC — the post row and its linked meetings row are written together,
    // so a failure on either side rolls both back. This never falls through
    // to the ordinary insert/update-then-rrg_submit_post path below.
    if (isMeetingPost) {
      const isPinned = form.scope === "global";
      const { data: rpcResult, error: rpcError } = await supabase.rpc("rrg_save_post_with_meeting", {
        p_post_id: savedPost?.id ?? null,
        p_title: form.title,
        p_summary: form.summary,
        p_body: form.body?.trim() ? form.body : form.summary,
        p_county_id: isPinned ? null : (form.countyId ? Number(form.countyId) : null),
        p_starts_at: chicagoWallTimeToUtcIso(form.eventStart),
        p_location_name: form.locationName,
        p_street_address: form.streetAddress,
        p_city: form.city,
        p_state: "TN",
        p_postal_code: form.postalCode || null,
        p_is_pinned_statewide: isPinned,
        p_submit: publish,
      });
      if (rpcError) {
        setError(rpcError.message);
        setProgress("");
        setSubmitting(false);
        submissionLockRef.current = false;
        return;
      }
      const post = rpcResult?.post;
      setSavedPost(post);
      setProgress(!publish ? "Saved" : post?.status === "pending" ? "Submitted for review" : "Published");
      setSubmitting(false);
      submissionLockRef.current = false;
      onComplete?.(post);
      return;
    }

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

    let submittedStatus = null;
    if (publish) {
      setProgress("Submitting...");
      // Status transitions (immediate publish for admins/trusted chapter
      // masters, pending review for restricted ones) are decided
      // server-side by rrg_submit_post from the live portal_accounts row —
      // never by a client-provided status.
      const { data: submitted, error: submitError } = await supabase.rpc("rrg_submit_post", {
        p_post_id: post.id,
      });
      if (submitError) {
        setError(`${submitError.message} The post remains a draft.`);
        setRetryPublish(publish);
        setSubmitting(false);
        submissionLockRef.current = false;
        return;
      }
      post = submitted;
      submittedStatus = submitted.status;
      setSavedPost(post);
    }

    setProgress(!publish ? "Draft saved" : submittedStatus === "pending" ? "Submitted for review" : "Published");
    setSubmitting(false);
    submissionLockRef.current = false;
    onComplete?.(post);
  }

  const previewPost = {
    ...initialPost,
    title: form.title || "Untitled preview",
    scope: form.scope,
    county_id: form.countyId || null,
    content_type: isMeetingPost ? "meeting" : form.contentType,
    summary: form.summary,
    body: isMeetingPost ? form.summary : form.body,
    body_rich: isMeetingPost ? null : form.bodyRich,
    event_start: form.eventStart,
    event_location: isMeetingPost ? form.locationName : form.eventLocation,
    event_address: isMeetingPost
      ? [form.streetAddress, form.city, "TN"].filter(Boolean).join(", ")
      : form.eventAddress,
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
        <div className={`post-composer-canvas ${isMeetingPost ? "is-meeting-only" : ""}`}>
          {!isMeetingPost && capabilities.canManageMedia && <PostMediaManager media={media} onChange={(nextMedia) => { setMedia(nextMedia); setDirty(true); }} disabled={submitting} />}
          <label className="composer-title-field">Title<input value={form.title} onChange={(event) => update("title", event.target.value)} required placeholder={meetingOnly ? "Meeting title" : "Update title"} /></label>
          <label className="composer-summary-field">{isMeetingPost ? "Short description" : "Summary"}<textarea value={form.summary} onChange={(event) => update("summary", event.target.value)} rows="3" maxLength="600" required={isMeetingPost} /><span>{isMeetingPost ? "Add the essential meeting context." : "This appears in condensed status cards and county overviews."} <strong>{form.summary.length}/600</strong></span></label>
          {!isMeetingPost && <div className="composer-body-field"><label>Body</label><RichTextEditor initialContent={form.bodyRich || form.body} disabled={submitting} onChange={({ json, text }) => { setForm((current) => ({ ...current, bodyRich: json, body: text })); setDirty(true); }} /></div>}
          {isMeetingPost && (
            <div className="composer-grid">
              <label>Date and time (Central)<input type="datetime-local" value={form.eventStart} onChange={(event) => update("eventStart", event.target.value)} required /></label>
              <label>Location / venue name<input value={form.locationName} onChange={(event) => update("locationName", event.target.value)} required /></label>
              <label>Street address<input value={form.streetAddress} onChange={(event) => update("streetAddress", event.target.value)} required /></label>
              <label>City<input value={form.city} onChange={(event) => update("city", event.target.value)} required /></label>
              <label>State<input value="TN" disabled readOnly /></label>
              <label>ZIP code (optional)<input value={form.postalCode} onChange={(event) => update("postalCode", event.target.value)} pattern="^[0-9]{5}(-[0-9]{4})?$" /></label>
            </div>
          )}
        </div>
        {!isMeetingPost && <details className="composer-publication-settings"><summary>Publication settings</summary>{capabilities.canPin && <label className="composer-check"><input type="checkbox" checked={form.isPinned} onChange={(event) => update("isPinned", event.target.checked)} /> Pin this post</label>}{capabilities.canMassEmail && <label className="composer-check"><input type="checkbox" checked={form.massEmail} onChange={(event) => update("massEmail", event.target.checked)} /> Mark for a future mass-email job</label>}<p>This update will appear in the public status feed when published.</p></details>}
      </fieldset>
      {error && <p className="composer-error" role="alert">{error}</p>}
      {retryPublish !== null && <div className="composer-retry-actions"><button type="button" onClick={() => save(retryPublish)}>Retry upload</button><button type="button" onClick={() => onComplete?.(savedPost)}>Return to draft</button></div>}
      {progress && <p className="submission-progress" role="status">{progress}</p>}
      {previewing && <div className="composer-preview"><StatusPostCard post={previewPost} countyName={selectedCounty?.name ?? "Tennessee"} /></div>}
      <div className="composer-actions composer-actions--sticky">
        <span>{dirty ? "Unsaved changes" : "No unsaved changes"}</span>
        <button type="button" onClick={() => save(false)} disabled={submitting}>Save draft</button>
        {!isMeetingPost && <button type="button" onClick={() => setPreviewing((current) => !current)} disabled={submitting}>{previewing ? "Close preview" : "Preview"}</button>}
        <button type="button" onClick={() => save(true)} disabled={submitting}>{isMeetingPost ? "Publish meeting" : "Publish"}</button>
      </div>
    </section>
  );
}
