import { useEffect, useRef, useState } from "react";
import "./RequestPortalDeliveryPanel.css";

const ELIGIBILITY_NOTICES = {
  citizenship_required: "This jurisdiction requires a Tennessee citizenship attestation, completed on the agency's own website.",
  residency_required: "This jurisdiction may require Tennessee residency.",
};

/**
 * Copy/paste popup for an online_portal request, driven entirely by
 * rrg_prepare_online_request's own JSON response — see
 * docs/online-portal-request-profiles.md's "Popup behavior" section. This
 * is a separate component from RequestDeliveryPanel.jsx (the PDF delivery
 * popup) rather than a shared one with more conditionals: the two RPC
 * response shapes are materially different ({profile, data, generated}
 * blob-and-PDF vs. this panel's plain {title, portal_url, request_text,
 * ...} JSON), and online_portal profiles never produce a Blob/PDF at all.
 *
 * `result` is the raw object rrg_prepare_online_request returned. Nothing
 * here re-derives or second-guesses it — this panel only ever displays
 * exactly what the RPC (the documented final authority for this flow)
 * returned, as plain text. It never embeds request_text or any personal
 * detail into a URL, and copying/opening/reading here never submits
 * anything or marks anything as submitted.
 */
export default function RequestPortalDeliveryPanel({ result, onClose }) {
  const [copyState, setCopyState] = useState("idle"); // idle | copied | failed
  const textareaRef = useRef(null);
  const copyResetTimerRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => () => clearTimeout(copyResetTimerRef.current), []);

  // Clipboard write happens synchronously inside this click handler — no
  // await before it — because iPhone Safari (and other browsers) only
  // allow navigator.clipboard.writeText to succeed within the same user-
  // gesture call stack that triggered it. If the Clipboard API is missing,
  // blocked by permissions, or the write itself rejects, this falls back to
  // selecting the read-only textarea's text so the visitor can still copy
  // it manually (Ctrl/Cmd+C, or the browser's own Copy context-menu item).
  function handleCopyClick() {
    clearTimeout(copyResetTimerRef.current);

    function fallBackToManualSelection() {
      setCopyState("failed");
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }

    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      fallBackToManualSelection();
      return;
    }

    navigator.clipboard.writeText(result.request_text).then(
      () => {
        setCopyState("copied");
        copyResetTimerRef.current = setTimeout(() => setCopyState("idle"), 2500);
      },
      () => fallBackToManualSelection(),
    );
  }

  const showEligibility = Boolean(
    ELIGIBILITY_NOTICES[result.eligibility_mode] || result.eligibility_explanation,
  );

  return (
    <div className="portal-delivery-panel-backdrop" role="presentation" onClick={onClose}>
      <div
        className="portal-delivery-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-delivery-panel-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="portal-delivery-panel__header">
          <div className="portal-delivery-panel__close-row">
            <button type="button" className="portal-delivery-panel__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          {result.preview && (
            <p className="portal-delivery-panel__preview-banner" role="alert">
              {result.profile_status === "verified"
                ? "Operator preview — verify this looks correct before relying on it."
                : "Draft operator preview — do not submit or distribute until this request profile is verified."}
            </p>
          )}

          <h2 id="portal-delivery-panel-title">Copy Your Request</h2>
        </header>

        <dl className="portal-delivery-panel__summary">
          <div>
            <dt>Government entity</dt>
            <dd>{result.entity_name}</dd>
          </div>
          <div>
            <dt>Goal</dt>
            <dd>{result.title}</dd>
          </div>
        </dl>

        <section>
          <h3>Your request text</h3>
          <label htmlFor="portal-delivery-panel-text" className="portal-delivery-panel__sr-label">
            Request text — select and copy
          </label>
          <textarea
            id="portal-delivery-panel-text"
            ref={textareaRef}
            className="portal-delivery-panel__textarea"
            value={result.request_text}
            readOnly
            rows={10}
            onFocus={(event) => event.target.select()}
          />
          <div className="portal-delivery-panel__copy-row">
            <button type="button" className="portal-delivery-panel__copy-btn" onClick={handleCopyClick}>
              <span className="portal-delivery-panel__copy-icon" aria-hidden="true">
                ⧉
              </span>
              {copyState === "copied" ? "Copied" : "Copy request text"}
            </button>
            {copyState === "copied" && (
              <span className="portal-delivery-panel__copy-feedback" role="status">
                Copied to clipboard.
              </span>
            )}
            {copyState === "failed" && (
              <span className="portal-delivery-panel__copy-feedback portal-delivery-panel__copy-feedback--manual" role="status">
                Automatic copy is not available here — the text above is selected; copy it manually (Ctrl/Cmd+C, or
                your browser's Copy option).
              </span>
            )}
          </div>
        </section>

        <section>
          <h3>Open the agency's website</h3>
          <p>
            <a
              className="portal-delivery-panel__open-link"
              href={result.portal_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open request website
            </a>
          </p>
        </section>

        <section>
          <h3>How to submit</h3>
          <p>
            Copy the request below, open the agency's website, paste it into the records description field,
            complete any required information, and submit your request there.
          </p>
        </section>

        {result.submission_instructions && (
          <section>
            <h3>Additional instructions</h3>
            <p>{result.submission_instructions}</p>
          </section>
        )}

        {showEligibility && (
          <section>
            <h3>Eligibility notice</h3>
            {ELIGIBILITY_NOTICES[result.eligibility_mode] && <p>{ELIGIBILITY_NOTICES[result.eligibility_mode]}</p>}
            {result.eligibility_explanation && <p>{result.eligibility_explanation}</p>}
          </section>
        )}

        {result.fee_rule && (
          <section>
            <h3>Fee rule</h3>
            <p>{result.fee_rule}</p>
          </section>
        )}

        <section className="portal-delivery-panel__privacy">
          <h3>Privacy notice</h3>
          <p>
            This website does not submit your request, contact the agency, or transmit your personal information —
            it only prepares text for you to copy. Nothing is sent anywhere until you paste it into the agency's own
            website and submit it there yourself.
          </p>
        </section>
      </div>
    </div>
  );
}
