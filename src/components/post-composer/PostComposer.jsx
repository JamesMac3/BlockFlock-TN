import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { validateExternalUrl } from "../../utils/urlValidation";
import { buildDraftPostPayload, runWithVerifiedUser } from "../../utils/postPayload";
import {
  chicagoWallTimeToUtcIso,
  toChicagoDateTimeLocalValue,
  formatChicagoDate,
  formatChicagoTime,
} from "../../features/portal-admin/chicagoTime";
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

function friendlyCampaignStatus(status) {
  if (!status) return "";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

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

function initialValues(post, creationType, isChapterMode, chapterCounty) {
  const base = !post
    ? { ...EMPTY_POST, contentType: creationType === "meeting" ? "meeting" : "announcement" }
    : {
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
  // A chapter master can never author a statewide or other-county post —
  // any stale scope/county value already on the row (or left over from a
  // prior form state) is overwritten here rather than trusted, since the
  // authenticated account's own county is the only source of truth.
  if (isChapterMode && chapterCounty) {
    return { ...base, scope: "county", countyId: String(chapterCounty.id) };
  }
  return base;
}

export default function PostComposer({
  mode,
  creationType,
  initialPost,
  counties,
  capabilities,
  uploadAdapter,
  user,
  chapterCounty = null,
  chapterAccount = null,
  onComplete,
  onCancel,
}) {
  const isChapterMode = mode === "chapter";
  // Trust status is read from the live portal_accounts row supplied by the
  // caller (never inferred from any visible label) — false review_required
  // plus an active status is the only combination that may request a
  // county email campaign. This is a UX gate only; the backend RPC must
  // enforce it independently (see final report).
  const isTrustedChapterMaster = isChapterMode && chapterAccount?.status === "active" && chapterAccount?.review_required === false;
  const [form, setForm] = useState(() => initialValues(initialPost, creationType, isChapterMode, chapterCounty));
  // Trusted-chapter email campaigns are folded into the single Publish
  // action (see save()) rather than a separate post-publish screen/RPC —
  // this is purely local UI state read at the moment Publish is clicked.
  const [wantsEmailCampaign, setWantsEmailCampaign] = useState(false);
  const [campaignSubject, setCampaignSubject] = useState("");
  // null = not checked yet (or not applicable — only approved posts have
  // one). Once loaded, { requested: false } or the full requested record.
  // requested/approved/sending/sent/rejected/cancelled/failed are all
  // treated identically here: any of them means a campaign row already
  // exists for this post, so the request control must never reappear.
  const [campaignState, setCampaignState] = useState(null);
  // Once a chapter master's post is approved, it is immutable — the plain
  // insert/update save path (below) cannot write to it at all (approved
  // rows reject non-admin updates server-side), so the composer never
  // offers Save draft/Publish for this state and instead offers, at most,
  // a standalone "request the campaign" action. Admin behavior is entirely
  // unaffected — none of this applies outside isChapterMode.
  const isApprovedChapterPost = isChapterMode && initialPost?.status === "approved";
  const campaignLoading = isApprovedChapterPost && campaignState === null;
  const campaignExists = campaignState?.requested === true;
  const canRequestCampaign = isTrustedChapterMaster && !campaignExists && !campaignLoading;
  // The chapter master's own county/scope, reapplied at every point a
  // value derived from form.scope/form.countyId is actually used for a
  // save, publish, or preview — never trusting form state alone, since
  // those fields are not rendered as editable controls in chapter mode but
  // could still theoretically be stale from initialValues.
  const effectiveScope = isChapterMode ? "county" : form.scope;
  const effectiveCountyId = isChapterMode && chapterCounty ? String(chapterCounty.id) : form.countyId;
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
  const selectedCounty = useMemo(() => counties.find((county) => String(county.id) === effectiveCountyId), [counties, effectiveCountyId]);
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

  // A campaign, once requested, is permanent — this is looked up only when
  // opening an already-published (approved) post, for both admin and
  // chapter-master callers alike; drafts and pending posts never show it.
  useEffect(() => {
    if (!initialPost || initialPost.status !== "approved") return undefined;
    let active = true;
    async function loadCampaignState() {
      const { data, error: campaignStateError } = await supabase.rpc("rrg_get_post_email_campaign_state", {
        p_post_id: initialPost.id,
      });
      if (!active) return;
      if (campaignStateError) {
        console.error("Email campaign state load failed:", campaignStateError);
        return;
      }
      setCampaignState(data);
    }
    loadCampaignState();
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
    if (effectiveScope === "county" && !effectiveCountyId) return "Select a county for a county post.";
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
    if (isChapterMode && isTrustedChapterMaster && wantsEmailCampaign && !campaignState?.requested) {
      const subject = (campaignSubject || form.title).trim();
      if (!subject) return "An email subject is required to request a county email campaign.";
      if (subject.length > 180) return "Email subject must be 180 characters or fewer.";
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
      const isPinned = effectiveScope === "global";
      const { data: rpcResult, error: rpcError } = await supabase.rpc("rrg_save_post_with_meeting", {
        p_post_id: savedPost?.id ?? null,
        p_title: form.title,
        p_summary: form.summary,
        p_body: form.body?.trim() ? form.body : form.summary,
        p_county_id: isPinned ? null : (effectiveCountyId ? Number(effectiveCountyId) : null),
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
      form: isChapterMode ? { ...form, scope: effectiveScope, countyId: effectiveCountyId } : form,
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
        storageSegment: effectiveScope === "global" ? "global" : selectedCounty.slug,
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
    let campaignStatus = null;
    if (publish) {
      setProgress("Submitting...");
      if (isChapterMode) {
        // One atomic RPC publishes/submits the post and, only when
        // requested, creates its email campaign in the same server-side
        // transaction — never two separate calls, so a chapter master can
        // never end up with a published post and a missing or duplicated
        // campaign request.
        const requestEmail = isTrustedChapterMaster && wantsEmailCampaign && !campaignState?.requested;
        const subject = requestEmail ? (campaignSubject || form.title).trim() : null;
        const { data: rpcResult, error: rpcError } = await supabase.rpc("rrg_publish_post_with_email_campaign", {
          p_post_id: post.id,
          p_request_email: requestEmail,
          p_subject: subject,
        });
        if (rpcError) {
          console.error("Publish failed:", rpcError);
          // A stale composer session (e.g. a campaign was already
          // requested for this post through another tab/session since it
          // was opened here) surfaces as the DB's uniqueness message —
          // refresh the real campaign state and show the immutable panel
          // instead of leaving a reusable checkbox on screen.
          if (/already been requested for this post/i.test(rpcError.message ?? "")) {
            const { data: refreshedState } = await supabase.rpc("rrg_get_post_email_campaign_state", {
              p_post_id: post.id,
            });
            if (refreshedState) setCampaignState(refreshedState);
            setWantsEmailCampaign(false);
            setError("An email campaign for this post was already requested — see its status below. Publish again to continue without requesting a new one.");
          } else {
            setError("The post could not be published. Please try again.");
          }
          setRetryPublish(publish);
          setSubmitting(false);
          submissionLockRef.current = false;
          return;
        }
        submittedStatus = rpcResult.post_status;
        campaignStatus = rpcResult.campaign_status;
        post = { ...post, status: submittedStatus };
        setSavedPost(post);
        if (campaignStatus) {
          setCampaignState({
            requested: true,
            campaign_id: rpcResult.campaign_id,
            status: campaignStatus,
            subject,
            requested_at: new Date().toISOString(),
          });
        }
      } else {
        // Status transitions for admins (always immediate publish; the
        // restricted-vs-trusted chapter-master split is handled by the
        // branch above) are decided server-side by rrg_submit_post — never
        // by a client-provided status.
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
    }

    if (!publish) {
      setProgress("Draft saved");
    } else if (isChapterMode) {
      setProgress(
        submittedStatus === "pending"
          ? "Post submitted for administrator review."
          : campaignStatus === "requested"
            ? "Post published. The email campaign was sent for administrator approval."
            : "Post published.",
      );
    } else {
      setProgress(submittedStatus === "pending" ? "Submitted for review" : "Published");
    }
    setSubmitting(false);
    submissionLockRef.current = false;
    onComplete?.(post);
  }

  // Requesting a campaign for an already-published post is a completely
  // separate action from save()/Publish — it never touches the posts row,
  // never runs media persistence, and never calls rrg_submit_post or
  // rrg_publish_post_with_email_campaign, since the post is already
  // approved and immutable. Only rrg_request_post_email_campaign is
  // called, exactly as it already is for a trusted chapter master's own
  // county post.
  async function requestCampaignOnly() {
    if (submissionLockRef.current || !wantsEmailCampaign || !savedPost) return;
    submissionLockRef.current = true;
    setError("");
    setSubmitting(true);
    setProgress("Requesting email campaign...");

    const subject = campaignSubject.trim() || savedPost.title;
    if (!subject || subject.length > 180) {
      setError(!subject ? "An email subject is required to request a county email campaign." : "Email subject must be 180 characters or fewer.");
      setSubmitting(false);
      setProgress("");
      submissionLockRef.current = false;
      return;
    }

    const { data: campaignId, error: rpcError } = await supabase.rpc("rrg_request_post_email_campaign", {
      p_post_id: savedPost.id,
      p_subject: subject,
    });

    if (rpcError) {
      console.error("Email campaign request failed:", rpcError);
      // A stale composer session (a campaign was already requested for
      // this post elsewhere since it was opened here) surfaces as the
      // DB's uniqueness message — refresh the real state and show the
      // immutable panel instead of leaving a reusable request control up.
      if (/already been requested for this post/i.test(rpcError.message ?? "")) {
        const { data: refreshedState } = await supabase.rpc("rrg_get_post_email_campaign_state", {
          p_post_id: savedPost.id,
        });
        if (refreshedState) setCampaignState(refreshedState);
        setWantsEmailCampaign(false);
        setError("An email campaign for this post was already requested — see its status below.");
      } else {
        setError("The email campaign request could not be submitted. Please try again.");
      }
      setSubmitting(false);
      setProgress("");
      submissionLockRef.current = false;
      return;
    }

    setCampaignState({
      requested: true,
      campaign_id: campaignId,
      status: "requested",
      subject,
      requested_at: new Date().toISOString(),
    });
    setWantsEmailCampaign(false);
    setProgress("The email campaign was sent for administrator approval.");
    setSubmitting(false);
    submissionLockRef.current = false;
  }

  const previewPost = {
    ...initialPost,
    title: form.title || "Untitled preview",
    scope: effectiveScope,
    county_id: effectiveCountyId || null,
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
          {isChapterMode ? (
            <p className="composer-audience-line">Audience: {chapterCounty?.name}</p>
          ) : (
            <>
              <label>Scope<select value={form.scope} onChange={(event) => update("scope", event.target.value)}><option value="global">Statewide</option><option value="county">County</option></select></label>
              {form.scope === "county" && <label>County<select value={form.countyId} onChange={(event) => update("countyId", event.target.value)} required><option value="">Select county</option>{counties.map((county) => <option key={county.id} value={county.id}>{county.name}</option>)}</select></label>}
            </>
          )}
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
        {!isMeetingPost && (
          <details className="composer-publication-settings">
            <summary>Publication settings</summary>
            {capabilities.canPin && <label className="composer-check"><input type="checkbox" checked={form.isPinned} onChange={(event) => update("isPinned", event.target.checked)} /> Pin this post</label>}
            {capabilities.canMassEmail && <label className="composer-check"><input type="checkbox" checked={form.massEmail} onChange={(event) => update("massEmail", event.target.checked)} /> Mark for a future mass-email job</label>}
            {campaignState?.requested ? (
              <div className="composer-campaign-status" role="status">
                <strong>Email batch requested</strong>
                <p>Requested {formatChicagoDate(campaignState.requested_at)} at {formatChicagoTime(campaignState.requested_at)}</p>
                <p>Subject: {campaignState.subject}</p>
                <p>Status: {friendlyCampaignStatus(campaignState.status)}</p>
                <p className="composer-campaign-status__note">This email request cannot be changed, cancelled, or submitted again.</p>
              </div>
            ) : (
              canRequestCampaign && (
                <div className="composer-campaign-option">
                  <label className="composer-check">
                    <input type="checkbox" checked={wantsEmailCampaign} onChange={(event) => setWantsEmailCampaign(event.target.checked)} />
                    Request a county email campaign
                  </label>
                  <p className="composer-campaign-option__hint">
                    {isApprovedChapterPost
                      ? "This post is already published. The email campaign will be sent to an administrator for approval before delivery."
                      : "The post will be published now. The email campaign will be sent to an administrator for approval before delivery."}
                  </p>
                  {wantsEmailCampaign && (
                    <label className="composer-campaign-option__subject">
                      Email subject
                      <input
                        type="text"
                        value={campaignSubject || form.title}
                        onChange={(event) => setCampaignSubject(event.target.value)}
                        maxLength={180}
                        required
                      />
                    </label>
                  )}
                </div>
              )
            )}
            <p>This update will appear in the public status feed when published.</p>
          </details>
        )}
      </fieldset>
      {error && <p className="composer-error" role="alert">{error}</p>}
      {retryPublish !== null && <div className="composer-retry-actions"><button type="button" onClick={() => save(retryPublish)}>Retry upload</button><button type="button" onClick={() => onComplete?.(savedPost)}>Return to draft</button></div>}
      {progress && <p className="submission-progress" role="status">{progress}</p>}
      {previewing && <div className="composer-preview"><StatusPostCard post={previewPost} countyName={selectedCounty?.name ?? "Tennessee"} /></div>}
      <div className="composer-actions composer-actions--sticky">
        {isApprovedChapterPost ? (
          <>
            {!isMeetingPost && <button type="button" onClick={() => setPreviewing((current) => !current)} disabled={submitting}>{previewing ? "Close preview" : "Preview"}</button>}
            {canRequestCampaign && (
              <button type="button" onClick={requestCampaignOnly} disabled={submitting || !wantsEmailCampaign}>
                {submitting ? "Requesting…" : "Request email campaign"}
              </button>
            )}
          </>
        ) : (
          <>
            <span>{dirty ? "Unsaved changes" : "No unsaved changes"}</span>
            <button type="button" onClick={() => save(false)} disabled={submitting}>Save draft</button>
            {!isMeetingPost && <button type="button" onClick={() => setPreviewing((current) => !current)} disabled={submitting}>{previewing ? "Close preview" : "Preview"}</button>}
            <button type="button" onClick={() => save(true)} disabled={submitting}>{isMeetingPost ? "Publish meeting" : "Publish"}</button>
          </>
        )}
      </div>
    </section>
  );
}
