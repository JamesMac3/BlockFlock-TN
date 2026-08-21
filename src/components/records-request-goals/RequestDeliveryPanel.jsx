import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { subscribeToCountyUpdates } from "../../features/document-request/countyContactSubscription";
import { requestChapterReminder } from "../../features/document-request/reminderService";
import { formatCountyLabel } from "../../features/document-request/countyLabel";
import "./RequestDeliveryPanel.css";

const DELIVERY_METHOD_LABELS = {
  electronic: "Electronic delivery",
  inspection: "In-person inspection",
  onsite_pickup: "Onsite pickup",
  usps_mail: "USPS mail",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatDisplayDate(isoDate) {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
}

export default function RequestDeliveryPanel({
  county,
  goal,
  profile,
  data,
  generated,
  validationWarnings,
  draftPreview = false,
  onClose,
}) {
  const [email, setEmail] = useState("");
  const [reminderChecked, setReminderChecked] = useState(false);
  const [reminderState, setReminderState] = useState({ phase: "idle", message: "" });
  const [subscribeState, setSubscribeState] = useState({ phase: "idle", message: "" });
  const [objectUrl, setObjectUrl] = useState(null);

  // This panel owns the object URL's whole lifecycle — created and
  // revoked in the same effect invocation, from generated.blob (never a
  // URL string created by the caller). Under React StrictMode's
  // development setup-cleanup-setup cycle this still ends correctly: the
  // first setup creates URL A, cleanup revokes exactly URL A, and the
  // second setup creates a fresh URL B — the parent-created-once pattern
  // this replaces revoked the caller's one URL on the first cleanup with
  // no second creation, leaving Open/Download pointed at a dead URL while
  // the already-loaded iframe kept appearing to work.
  useEffect(() => {
    if (!generated?.blob) {
      const timer = setTimeout(() => setObjectUrl(null), 0);
      return () => clearTimeout(timer);
    }
    // The URL is only actually created once this timeout fires — if
    // StrictMode's synchronous cleanup runs first (its throwaway mount),
    // clearTimeout cancels it before createObjectURL is ever called, so
    // there is nothing to revoke and nothing gets orphaned. The real
    // (second) mount's timer is never cleared and creates the URL that
    // Open/Download/the iframe actually use.
    let url;
    const timer = setTimeout(() => {
      url = URL.createObjectURL(generated.blob);
      setObjectUrl(url);
    }, 0);
    return () => {
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [generated?.blob]);

  const trimmedEmail = email.trim();
  const isEmailValid = EMAIL_PATTERN.test(trimmedEmail);
  const chapterEmail = county.chapter_contact_email;
  const countyLabel = formatCountyLabel(county.name);
  const notices = [...(validationWarnings ?? []), ...(generated.warnings ?? [])];
  // The request profile's own eligibility_mode is the actual schema field
  // that means identity documentation is required — not a jurisdiction
  // guess. This is the same field the Eligibility notice section below
  // already keys off of for citizenship/residency text.
  const identityDocumentRequired =
    profile.eligibility_mode === "citizenship_required" || profile.eligibility_mode === "residency_required";

  function handleEmailChange(event) {
    const value = event.target.value;
    setEmail(value);
    if (reminderChecked && !EMAIL_PATTERN.test(value.trim())) {
      setReminderChecked(false);
      setReminderState({ phase: "idle", message: "" });
    }
  }

  async function handleSubscribe() {
    setSubscribeState({ phase: "working", message: "" });
    const result = await subscribeToCountyUpdates({ supabase, countyId: county.id, email });
    setSubscribeState(
      result.subscribed
        ? { phase: "done", message: "Your email is registered for county updates." }
        : { phase: "error", message: result.error }
    );
  }

  // The reminder request only ever fires from this explicit user action
  // (checking the box), never from render — and the checkbox itself stays
  // disabled until the email is valid, so this can only run with a valid
  // trimmedEmail.
  function handleReminderToggle(event) {
    const checked = event.target.checked;
    setReminderChecked(checked);

    if (!checked) {
      setReminderState({ phase: "idle", message: "" });
      return;
    }

    const result = requestChapterReminder({
      email: trimmedEmail,
      countyId: county.id,
      goalId: goal.id,
      requestProfileId: profile.id,
      consentedAt: new Date().toISOString(),
    });

    setReminderState(
      result.scheduled
        ? { phase: "done", message: "A reminder has been scheduled." }
        : {
            phase: "unavailable",
            message: "Chapter-response reminders are not available yet. Please set your own reminder to follow up after you submit this request.",
          }
    );
  }

  return (
    <div className="delivery-panel-backdrop" role="presentation" onClick={onClose}>
      <div
        className="delivery-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivery-panel-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="delivery-panel__header">
          <button type="button" className="delivery-panel__close" onClick={onClose} aria-label="Close">
            ×
          </button>

          {draftPreview && (
            <p className="delivery-panel__draft-banner" role="alert">
              Draft operator preview — do not submit or distribute until this request profile is verified.
            </p>
          )}

          <h2 id="delivery-panel-title">
            {draftPreview ? "Draft Operator Preview" : "Your Prefilled Request Is Ready"}
          </h2>
        </header>

        {draftPreview && (
          <p className="delivery-panel__draft-subtitle">
            This is an operator-only draft preview of an unverified request profile. It is not publicly available
            and reflects exactly what a public visitor would eventually see once this profile is verified.
          </p>
        )}

        <dl className="delivery-panel__summary">
          <div>
            <dt>Jurisdiction</dt>
            <dd>{countyLabel}</dd>
          </div>
          <div>
            <dt>Government entity</dt>
            <dd>{data.government_entity.display_name}</dd>
          </div>
          <div>
            <dt>Goal</dt>
            <dd>{goal.title}</dd>
          </div>
        </dl>

        {goal.public_summary && (
          <section>
            <h3>Purpose</h3>
            <p>{goal.public_summary}</p>
          </section>
        )}

        <section>
          <h3>Records requested</h3>
          <p>{data.request.records_description}</p>
          {data.request.department_or_division && (
            <p>
              <strong>Department:</strong> {data.request.department_or_division}
            </p>
          )}
          {data.request.record_category_label && (
            <p>
              <strong>Category:</strong> {data.request.record_category_label}
            </p>
          )}
          {(data.request.date_from || data.request.date_to) && (
            <p>
              <strong>Date range:</strong> {formatDisplayDate(data.request.date_from) ?? "Not specified"} to{" "}
              {formatDisplayDate(data.request.date_to) ?? "Not specified"}
            </p>
          )}
          <p>
            <strong>Delivery method:</strong>{" "}
            {DELIVERY_METHOD_LABELS[data.request.delivery_method] ?? data.request.delivery_method}
          </p>
        </section>

        {notices.length > 0 && (
          <section className="delivery-panel__notices">
            <h3>Notices</h3>
            <ul>
              {notices.map((notice, index) => (
                <li key={index}>{notice.message}</li>
              ))}
            </ul>
          </section>
        )}

        {(profile.eligibility_mode === "citizenship_required" ||
          profile.eligibility_mode === "residency_required" ||
          profile.eligibility_explanation) && (
          <section>
            <h3>Eligibility notice</h3>
            {profile.eligibility_mode === "citizenship_required" && (
              <p>This jurisdiction requires a Tennessee citizenship attestation, completed locally on the form.</p>
            )}
            {profile.eligibility_mode === "residency_required" && (
              <p>This jurisdiction may require Tennessee residency.</p>
            )}
            {profile.eligibility_explanation && <p>{profile.eligibility_explanation}</p>}
          </section>
        )}

        {profile.fee_rule && (
          <section>
            <h3>Fee rule</h3>
            <p>{profile.fee_rule}</p>
          </section>
        )}

        {profile.submission_instructions && (
          <section>
            <h3>Submission instructions</h3>
            <p>{profile.submission_instructions}</p>
          </section>
        )}

        {(data.government_entity.submission_email ||
          data.government_entity.mailing_address ||
          data.government_entity.portal_url) && (
          <section>
            <h3>Where to submit</h3>
            {data.government_entity.submission_email && (
              <p>
                Email: <a href={`mailto:${data.government_entity.submission_email}`}>{data.government_entity.submission_email}</a>
              </p>
            )}
            {data.government_entity.mailing_address && <p>Mail: {data.government_entity.mailing_address}</p>}
            {data.government_entity.portal_url && (
              <p>
                Portal:{" "}
                <a href={data.government_entity.portal_url} target="_blank" rel="noopener noreferrer">
                  {data.government_entity.portal_url}
                </a>
              </p>
            )}
          </section>
        )}

        <section className="delivery-panel__privacy">
          <h3>Privacy notice</h3>
          <p>
            This PDF is already populated with the approved public-records language above, but identity-related
            fields — your name, contact information, Tennessee citizenship attestation, request date, and
            signature — remain blank. The website never collects, stores, or transmits that information.
          </p>
        </section>

        <section>
          <h3>Completing your request</h3>
          <ul>
            <li>Open the PDF in your browser, print it, or download it.</li>
            <li>
              You may also open it locally in Adobe Acrobat Reader. Adobe's online tools upload documents to
              Adobe, while local Acrobat Reader does not.
            </li>
            <li>Complete the identity, Tennessee citizenship, request date, and signature fields locally.</li>
            {identityDocumentRequired && (
              <li className="delivery-panel__identity-warning">
                <strong>
                  Attach a scan or clear photo of a valid ID showing that you are a Tennessee resident. Requests are
                  commonly rejected when this proof is omitted.
                </strong>{" "}
                Attach it directly to your own submission — the website never collects, uploads, stores, or
                transmits this ID.
              </li>
            )}
            <li>
              Submit the completed request directly to the government entity using the information above. The
              website does not submit requests automatically.
            </li>
          </ul>
        </section>

        <section className="delivery-panel__chapter">
          <h3>After you hear back</h3>
          <p>
            Complete the remaining identity and signature fields locally, then submit the request directly to the
            government entity. When you receive a response, forward the response and its attachments to{" "}
            {chapterEmail ? <a href={`mailto:${chapterEmail}`}>{chapterEmail}</a> : "your local chapter"} so your
            local chapter can review the records and add approved documents to the public archive.
          </p>
          <p className="delivery-panel__automation-note">
            The website does not access, upload, forward, or publish your response automatically — this step is
            done by you, by email.
          </p>
        </section>

        <section className="delivery-panel__preview">
          <h3>{draftPreview ? "Draft preview" : "Preview"}</h3>
          <div className="delivery-panel__preview-frame">
            {objectUrl ? (
              <iframe title={draftPreview ? "Draft preview PDF" : "Prefilled request PDF"} src={objectUrl} />
            ) : (
              <p role="status" className="delivery-panel__preview-loading">Preparing preview…</p>
            )}
          </div>
        </section>

        <section className="delivery-panel__download">
          <a
            {...(objectUrl ? { href: objectUrl } : {})}
            target="_blank"
            rel="noopener noreferrer"
            className="delivery-panel__download-link"
            aria-disabled={!objectUrl}
          >
            Open PDF
          </a>
          <a
            {...(objectUrl ? { href: objectUrl } : {})}
            download={generated.filename}
            className="delivery-panel__download-link delivery-panel__download-link--secondary"
            aria-disabled={!objectUrl}
          >
            {draftPreview ? "Download Draft PDF" : "Download Prefilled PDF"}
          </a>
        </section>

        <section className="delivery-panel__email">
          <h3>Optional: county updates</h3>
          <p>
            Submitting your email subscribes it to Flock Block Tennessee updates for {countyLabel}. The PDF
            above remains available whether or not you provide an email.
          </p>

          <label htmlFor="delivery-panel-email">Email address (optional)</label>
          <input
            id="delivery-panel-email"
            type="email"
            value={email}
            onChange={handleEmailChange}
            autoComplete="email"
          />

          <button
            type="button"
            onClick={handleSubscribe}
            disabled={!isEmailValid || subscribeState.phase === "working"}
          >
            {subscribeState.phase === "working" ? "Submitting…" : "Subscribe to county updates"}
          </button>
          {subscribeState.message && <p role="status">{subscribeState.message}</p>}

          <label className="delivery-panel__checkbox">
            <input
              type="checkbox"
              checked={reminderChecked}
              disabled={!isEmailValid}
              onChange={handleReminderToggle}
            />
            Remind me to send the response to my local chapter
          </label>

          {!isEmailValid && (
            <p className="delivery-panel__reminder-hint">
              Enter a valid email address above to enable this reminder.
            </p>
          )}

          {reminderState.message && (
            <p role="status" className="delivery-panel__reminder-status">
              {reminderState.message}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
