import { useEffect, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { parseYouTubeUrl, validateExternalUrl } from "../../utils/urlValidation";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 500000;

function destinationHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "Invalid destination";
  }
}

export default function PostMediaManager({ media, onChange, disabled }) {
  const [addMode, setAddMode] = useState(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [detailsIndex, setDetailsIndex] = useState(null);
  const [detailDraft, setDetailDraft] = useState(null);
  const fileInputRef = useRef(null);
  const dialogRef = useRef(null);
  const detailsTriggerRef = useRef(null);
  const imageCount = media.filter((item) => item.media_type === "image").length;

  useEffect(() => {
    if (detailsIndex === null) return undefined;
    dialogRef.current?.querySelector("input")?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setDetailsIndex(null);
        setDetailDraft(null);
        requestAnimationFrame(() => detailsTriggerRef.current?.focus());
      }
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll("input, button");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [detailsIndex]);

  function closeDetails() {
    setDetailsIndex(null);
    setDetailDraft(null);
    requestAnimationFrame(() => detailsTriggerRef.current?.focus());
  }

  function openDetails(index, trigger) {
    detailsTriggerRef.current = trigger;
    setDetailsIndex(index);
    setDetailDraft({ ...media[index] });
    setError("");
  }

  function saveDetails() {
    let normalizedDetails = { ...detailDraft };
    if (detailDraft.source_url && !validateExternalUrl(detailDraft.source_url).valid) {
      setError("The source link must be a valid HTTPS address.");
      return;
    }
    if (detailDraft.media_type === "external_video") {
      const result = parseYouTubeUrl(detailDraft.external_url);
      if (!result.valid) { setError(result.error); return; }
      normalizedDetails = { ...normalizedDetails, external_url: result.url, provider: "youtube", provider_media_id: result.videoId };
    }
    if (detailDraft.media_type === "external_link") {
      const result = validateExternalUrl(detailDraft.external_url);
      if (!result.valid) { setError(result.error); return; }
      normalizedDetails = { ...normalizedDetails, external_url: result.url };
    }
    onChange(media.map((item, index) => index === detailsIndex ? normalizedDetails : item));
    closeDetails();
  }

  function move(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= media.length) return;
    const next = [...media];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
    setAnnouncement(`Moved media item ${index + 1} to position ${nextIndex + 1}.`);
  }

  async function addImages(event) {
    setError("");
    const files = [...event.target.files];
    if (imageCount + files.length > MAX_IMAGES) {
      setError(`A post may contain no more than ${MAX_IMAGES} images.`);
      return;
    }
    try {
      const additions = [];
      for (const file of files) {
        if (!IMAGE_TYPES.has(file.type)) throw new Error(`${file.name} is not a supported JPEG, PNG, or WebP image.`);
        const processed = await imageCompression(file, { maxSizeMB: 0.47, maxWidthOrHeight: 1800, useWebWorker: true, fileType: "image/webp" });
        if (processed.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} remains larger than 500,000 bytes after processing.`);
        additions.push({ localId: crypto.randomUUID(), media_type: "image", file: processed, previewUrl: URL.createObjectURL(processed), alt_text: "", caption: "", credit: "", source_url: "", is_primary: media.length === 0 && additions.length === 0 });
      }
      onChange([...media, ...additions]);
      setAnnouncement(`Added ${additions.length} image${additions.length === 1 ? "" : "s"}.`);
    } catch (imageError) {
      setError(imageError.message);
    } finally {
      event.target.value = "";
    }
  }

  function addUrlMedia(type) {
    setError("");
    const result = type === "external_video" ? parseYouTubeUrl(url) : validateExternalUrl(url);
    if (!result.valid) { setError(result.error); return; }
    onChange([...media, { localId: crypto.randomUUID(), media_type: type, external_url: result.url, provider: type === "external_video" ? "youtube" : null, provider_media_id: result.videoId ?? null, caption: "", credit: "", source_url: "", is_primary: media.length === 0 }]);
    setUrl("");
    setAddMode(null);
    setAnnouncement(`Added ${type === "external_video" ? "YouTube video" : "external link"}.`);
  }

  return (
    <section className="post-media-manager" aria-labelledby="post-media-title">
      <div className="post-media-heading"><div><h3 id="post-media-title">Media</h3><p>Images: {imageCount} of {MAX_IMAGES}</p></div><div className="post-media-add-actions"><button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled || imageCount >= MAX_IMAGES}>Add images</button><button type="button" onClick={() => setAddMode("external_video")} disabled={disabled}>Add YouTube video</button><button type="button" onClick={() => setAddMode("external_link")} disabled={disabled}>Add external link</button></div></div>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addImages} />

      {!media.length && !addMode && <div className="post-media-empty"><strong>Add media to this update</strong><span>Images, YouTube videos, and verified external links are optional.</span></div>}
      {addMode && <div className="post-media-url-add"><p>{addMode === "external_video" ? "Upload your video to YouTube as Public or Unlisted, then paste its link here. Video files are not stored by Flock Block Tennessee." : "Add a complete HTTPS destination."}</p><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" autoFocus /><button type="button" onClick={() => addUrlMedia(addMode)}>Add</button><button type="button" onClick={() => { setAddMode(null); setUrl(""); }}>Cancel</button></div>}
      {error && <p className="composer-error" role="alert">{error}</p>}
      <p className="sr-only" aria-live="polite">{announcement}</p>

      {media.length > 0 && <div className="post-media-strip">
        {media.map((item, index) => <article className={`post-media-thumbnail ${item.is_primary ? "is-primary" : ""}`} key={item.id ?? item.localId}>
          <div className="post-media-thumbnail__visual">
            <span className="post-media-position">{index + 1}</span>
            {item.is_primary && <span className="post-media-primary-label">Primary</span>}
            {item.media_type === "image" && <img src={item.previewUrl ?? item.publicUrl} alt="" />}
            {item.media_type === "external_video" && <div className="post-media-neutral">YouTube<br /><small>{item.provider_media_id}</small></div>}
            {item.media_type === "external_link" && <div className="post-media-neutral">External link<br /><small>{destinationHostname(item.external_url)}</small></div>}
            <button type="button" className="post-media-remove" aria-label={`${item.media_type === "image" ? "Remove image" : "Remove media"} ${index + 1}`} onClick={() => onChange(media.filter((_, itemIndex) => itemIndex !== index))} disabled={disabled}>×</button>
            {item.file && <span className={`post-media-upload-state ${item.uploadState === "failed" ? "is-failed" : ""}`}>{item.uploadState === "failed" ? "Failed — retry available" : "Waiting"}</span>}
            <div className="post-media-reorder">
              <button type="button" aria-label={`Move media ${index + 1} left`} onClick={() => move(index, -1)} disabled={disabled || index === 0}>←</button>
              <button type="button" aria-label={`Move media ${index + 1} right`} onClick={() => move(index, 1)} disabled={disabled || index === media.length - 1}>→</button>
            </div>
            <button type="button" className="post-media-details" aria-label={`Edit details for media ${index + 1}`} onClick={(event) => openDetails(index, event.currentTarget)} disabled={disabled}>✎</button>
            {!item.is_primary && <button type="button" className="post-media-make-primary" aria-label={`Make media ${index + 1} primary`} onClick={() => onChange(media.map((entry, entryIndex) => ({ ...entry, is_primary: entryIndex === index })))} disabled={disabled}>☆</button>}
          </div>
        </article>)}
      </div>}

      {detailsIndex !== null && detailDraft && <div className="media-details-backdrop"><section ref={dialogRef} className="media-details-dialog" role="dialog" aria-modal="true" aria-labelledby="media-details-title"><h3 id="media-details-title">Media details</h3>{detailDraft.media_type === "image" && <label>Image description (optional)<input value={detailDraft.alt_text ?? ""} onChange={(event) => setDetailDraft({ ...detailDraft, alt_text: event.target.value })} /><small>Describe what is visible. If left blank, a description will be generated when you save.</small></label>}{detailDraft.media_type !== "image" && <label>URL<input value={detailDraft.external_url ?? ""} onChange={(event) => setDetailDraft({ ...detailDraft, external_url: event.target.value })} /></label>}<label>Caption (optional)<input value={detailDraft.caption ?? ""} onChange={(event) => setDetailDraft({ ...detailDraft, caption: event.target.value })} /></label><label>Credit (optional)<input value={detailDraft.credit ?? ""} onChange={(event) => setDetailDraft({ ...detailDraft, credit: event.target.value })} /></label><label>Source link (optional)<input value={detailDraft.source_url ?? ""} onChange={(event) => setDetailDraft({ ...detailDraft, source_url: event.target.value })} placeholder="https://" /></label>{error && <p className="composer-error" role="alert">{error}</p>}<div><button type="button" onClick={closeDetails}>Cancel</button><button type="button" onClick={saveDetails}>Save details</button></div></section></div>}
    </section>
  );
}
