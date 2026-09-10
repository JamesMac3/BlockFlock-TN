import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import CountySelector from "./CountySelector";
import { resolveStoredCounty, setStoredCountySlug } from "../utils/countyPreference";
import { getChapterContactEmail } from "../utils/chapterContactEmail";
import { formatCountyLabel } from "../features/document-request/countyLabel";
import "./HaveDocumentsPopout.css";

/**
 * Hero-level entry point into the existing document-submission workflow
 * (the "Have records?" card on each county's Records Request Roadmap —
 * see RecordsRequestGoalsPage.jsx / HaveRecordsCard.jsx). This never
 * collects or sends anything itself: it only explains the real workflow
 * and, once a county is known, links straight to that county's roadmap.
 */
export default function HaveDocumentsPopout() {
  const [open, setOpen] = useState(false);
  const [counties, setCounties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selectedCounty, setSelectedCounty] = useState(null);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);

  // Loaded once, on mount — not gated on `open` — so the dialog can open
  // instantly with data already available instead of flashing "Loading…"
  // on every single open (this component itself stays mounted for the
  // life of the homepage; only the dialog markup toggles on `open`).
  useEffect(() => {
    let active = true;

    supabase
      .from("counties")
      .select("id, name, slug, cities, chapter_contact_email")
      .order("name")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Failed to load counties:", error);
          setFailed(true);
          setLoading(false);
          return;
        }
        const list = data ?? [];
        setCounties(list);
        // Reuses the same "remembered county" the rest of the site already
        // trusts (Header's Status link, the hero's other county-aware
        // buttons) — never guessed, and re-validated against the live list
        // rather than trusted blindly.
        setSelectedCounty(resolveStoredCounty(list));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handlePointerDown(event) {
      if (!dialogRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        close(true);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Moves focus into the dialog on open, so Escape/Tab handling above
  // (attached to the dialog itself) actually receives keyboard events
  // instead of them going to whatever had focus on the page before the
  // dialog opened. Normally lands on the close button (the first
  // focusable element); when CountySelector renders instead, its own
  // autoFocus effect runs afterward and moves focus to its search input,
  // which is the more useful target in that branch.
  useEffect(() => {
    if (!open) return undefined;
    dialogRef.current?.querySelector("button, input, a[href]")?.focus();
  }, [open]);

  function openPopout() {
    setOpen(true);
  }

  function close(returnFocus) {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleDialogKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), a[href]'
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleCountySelect(county) {
    // Matches CountyStatusChooser's own selection behavior — remembering
    // the choice here is the same navigation convenience used everywhere
    // else on the site, not an authorization signal.
    setStoredCountySlug(county.slug);
    setSelectedCounty(county);
  }

  const countyLabel = selectedCounty ? formatCountyLabel(selectedCounty.name) : null;
  const chapterEmail = selectedCounty ? getChapterContactEmail(selectedCounty) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="button button--secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="have-documents-dialog"
        onClick={openPopout}
      >
        Have documents?
      </button>

      {open && (
        <div className="have-documents-backdrop" role="presentation">
          <div
            ref={dialogRef}
            id="have-documents-dialog"
            className="have-documents-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="have-documents-title"
            onKeyDown={handleDialogKeyDown}
          >
            <div className="have-documents-dialog__heading">
              <h2 id="have-documents-title">Have documents to share?</h2>
              <button type="button" aria-label="Close" onClick={() => close(true)}>
                ×
              </button>
            </div>

            <p className="have-documents-dialog__intro">
              Contracts, public-records responses, policies, and supporting documents can help
              fill gaps in your county's records goals.
            </p>

            <ol className="have-documents-dialog__steps">
              <li>Select your county.</li>
              <li>Open the relevant records goal.</li>
              <li>Follow its document-submission instructions.</li>
            </ol>

            {loading ? (
              <p role="status">Loading counties…</p>
            ) : failed ? (
              <p role="alert">Counties could not be loaded right now. Please try again later.</p>
            ) : selectedCounty ? (
              <div className="have-documents-dialog__county">
                <p>
                  Submission is by email. Send documents directly to your local chapter's
                  contact address:
                </p>
                <p className="have-documents-dialog__email">
                  <a href={`mailto:${chapterEmail}`}>{chapterEmail}</a>
                </p>
                <p className="have-documents-dialog__note">
                  Keep attachments under 20 MB total per email. For larger collections, send
                  multiple emails. Split any individual file larger than 20 MB into smaller parts
                  before sending.
                </p>

                <Link
                  to={`/status/${selectedCounty.slug}/records-request-goals`}
                  className="button button--primary have-documents-dialog__cta"
                  onClick={() => close(false)}
                >
                  Go to {countyLabel} records goals
                </Link>

                <button
                  type="button"
                  className="have-documents-dialog__change"
                  onClick={() => setSelectedCounty(null)}
                >
                  Choose a different county
                </button>
              </div>
            ) : (
              <CountySelector counties={counties} onSelect={handleCountySelect} autoFocus />
            )}
          </div>
        </div>
      )}
    </>
  );
}
