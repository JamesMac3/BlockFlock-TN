import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { classifyRpcError, RPC_ERROR_MESSAGES } from "../../features/portal-admin/rpcErrors";
import { CHAPTER_LINK_COLORS, DEFAULT_CHAPTER_LINK_COLOR } from "../../features/portal-admin/chapterLinkColors";
import {
  buildChapterLinksPayload,
  CHAPTER_LINK_LABEL_MAX_LENGTH,
  CHAPTER_LINK_URL_MAX_LENGTH,
} from "../../features/portal-admin/chapterLinkValidation";
import AdminPopout from "../admin/AdminPopout";
import ChapterLinkButton from "../status/ChapterLinkButton";
import "./ChapterLinksButton.css";

const SLOT_COUNT = 3;

function emptySlot() {
  return { label: "", url: "", color: DEFAULT_CHAPTER_LINK_COLOR };
}

function emptySlots() {
  return Array.from({ length: SLOT_COUNT }, emptySlot);
}

// Trigger button + dialog for editing a county's up-to-three public
// chapter link buttons. Chapter masters always edit their own assigned
// county (countyId is passed in fixed); the RPC itself re-derives and
// enforces authorization server-side regardless of what's passed here.
export default function ChapterLinksButton({ countyId, countyName }) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  if (!countyId) return null;

  // Guards every dismissal path alike — Escape and a backdrop click both
  // call AdminPopout's onClose directly, so the confirm has to live here
  // rather than only on the dialog's own Cancel button.
  function requestClose() {
    if (dirty && !window.confirm("Discard unsaved changes to this county's chapter links?")) {
      return;
    }
    setOpen(false);
  }

  return (
    <>
      <button type="button" className="tab-nav__item" onClick={() => setOpen(true)}>
        Chapter links
      </button>
      {open && (
        <AdminPopout title={`Chapter links${countyName ? ` — ${countyName}` : ""}`} onClose={requestClose}>
          <ChapterLinksDialogContent countyId={countyId} onRequestClose={requestClose} onDirtyChange={setDirty} />
        </AdminPopout>
      )}
    </>
  );
}

function ChapterLinksDialogContent({ countyId, onRequestClose, onDirtyChange }) {
  const [loadState, setLoadState] = useState("loading");
  const [errorKind, setErrorKind] = useState(null);
  const [slots, setSlots] = useState(emptySlots);
  const [initialSlots, setInitialSlots] = useState(emptySlots);
  const [slotErrors, setSlotErrors] = useState([null, null, null]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    setErrorKind(null);
    const { data, error } = await supabase
      .from("county_chapter_links")
      .select("county_id,slot,label,url,color")
      .eq("county_id", countyId)
      .order("slot");

    if (error) {
      console.error("Failed to load chapter links:", error);
      setErrorKind(classifyRpcError(error));
      setLoadState("error");
      return;
    }

    const nextSlots = Array.from({ length: SLOT_COUNT }, (_, index) => {
      const row = (data ?? []).find((item) => item.slot === index + 1);
      return row ? { label: row.label, url: row.url, color: row.color } : emptySlot();
    });
    setSlots(nextSlots);
    setInitialSlots(nextSlots);
    setSlotErrors([null, null, null]);
    setSaveError("");
    setSavedAt(null);
    setLoadState("ready");
  }, [countyId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    onDirtyChange(JSON.stringify(slots) !== JSON.stringify(initialSlots));
  }, [slots, initialSlots, onDirtyChange]);

  function updateSlot(index, patch) {
    setSlots((current) => current.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot)));
    setSlotErrors((current) => current.map((message, slotIndex) => (slotIndex === index ? null : message)));
  }

  function clearSlot(index) {
    updateSlot(index, emptySlot());
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaveError("");
    setSavedAt(null);

    const { errors, payload } = buildChapterLinksPayload(slots);
    setSlotErrors(errors);
    if (!payload) return;

    setSaving(true);
    const { error } = await supabase.rpc("save_county_chapter_links", {
      p_county_id: countyId,
      p_links: payload,
    });
    setSaving(false);

    if (error) {
      console.error("Failed to save chapter links:", error);
      const classified = classifyRpcError(error);
      setSaveError(classified === "missing-migration" ? RPC_ERROR_MESSAGES["missing-migration"] : error.message);
      return;
    }

    setSavedAt(Date.now());
    await load();
  }

  if (loadState === "loading") {
    return <p role="status">Loading chapter links…</p>;
  }

  if (loadState === "error") {
    return (
      <div>
        <p className="chapter-links-dialog__error" role="alert">
          {RPC_ERROR_MESSAGES[errorKind] ?? RPC_ERROR_MESSAGES.network}
        </p>
        <button type="button" onClick={load}>Retry</button>
      </div>
    );
  }

  const hasAnyLabel = slots.some((slot) => slot.label.trim().length > 0);

  return (
    <form className="chapter-links-dialog" onSubmit={handleSave}>
      <p className="chapter-links-dialog__intro">
        Add up to three buttons — a website, a social page, a donation link — that appear on your county's
        public status page. Leave a slot blank to keep it hidden.
      </p>

      {slots.map((slot, index) => (
        <fieldset key={index} className="chapter-links-dialog__slot">
          <legend>Button {index + 1}</legend>

          <label htmlFor={`chapter-link-label-${index}`}>Button text</label>
          <input
            id={`chapter-link-label-${index}`}
            type="text"
            maxLength={CHAPTER_LINK_LABEL_MAX_LENGTH}
            placeholder="e.g., Follow our chapter"
            value={slot.label}
            onChange={(event) => updateSlot(index, { label: event.target.value })}
          />

          <label htmlFor={`chapter-link-url-${index}`}>Destination URL</label>
          <input
            id={`chapter-link-url-${index}`}
            type="text"
            inputMode="url"
            maxLength={CHAPTER_LINK_URL_MAX_LENGTH}
            placeholder="https://example.com"
            value={slot.url}
            onChange={(event) => updateSlot(index, { url: event.target.value })}
          />

          <label htmlFor={`chapter-link-color-${index}`}>Color</label>
          <select
            id={`chapter-link-color-${index}`}
            value={slot.color}
            onChange={(event) => updateSlot(index, { color: event.target.value })}
          >
            {CHAPTER_LINK_COLORS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <button
            type="button"
            className="chapter-links-dialog__clear"
            onClick={() => clearSlot(index)}
            disabled={!slot.label && !slot.url}
          >
            Clear this slot
          </button>

          {slotErrors[index] && (
            <p className="chapter-links-dialog__slot-error" role="alert">{slotErrors[index]}</p>
          )}

          {slot.label.trim() && (
            <div className="chapter-links-dialog__preview">
              <span className="chapter-links-dialog__preview-label">Preview:</span>
              <ChapterLinkButton as="span" label={slot.label.trim()} color={slot.color} />
            </div>
          )}
        </fieldset>
      ))}

      {!hasAnyLabel && (
        <div className="chapter-links-dialog__preview chapter-links-dialog__preview--example">
          <span className="chapter-links-dialog__preview-label">Example (not saved):</span>
          {/* color="example" is not a real, savable color — it only selects
              the muted, dashed .chapter-link-button--example CSS variant so
              this illustrative button reads as "not a real color choice". */}
          <ChapterLinkButton as="span" label="Follow our chapter" color="example" />
        </div>
      )}

      {saveError && <p className="chapter-links-dialog__error" role="alert">{saveError}</p>}
      {savedAt && !saveError && <p className="chapter-links-dialog__success" role="status">Saved.</p>}

      <div className="chapter-links-dialog__actions">
        <button type="button" onClick={onRequestClose} disabled={saving}>Cancel</button>
        <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
