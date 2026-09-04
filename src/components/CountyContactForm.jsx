import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { subscribeToCountyUpdates } from "../features/document-request/countyContactSubscription";
import Turnstile from "./Turnstile";
import "./CountyContactForm.css";

const RESUBMIT_COOLDOWN_SECONDS = 10;

const INITIAL_FORM = {
  email: "",
  phone: "",
  countyId: "",
};

export default function CountyContactForm({
  initialCountyId = "",
  initialCountyName = "",
  isOpen = false,
  onOpenChange,
}) {
  const [counties, setCounties] = useState([]);
  const [form, setForm] = useState({
    ...INITIAL_FORM,
    countyId: initialCountyId ? String(initialCountyId) : "",
  });
  const [loadingCounties, setLoadingCounties] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const turnstileRef = useRef(null);
  const cooldownIntervalRef = useRef(null);

  useEffect(() => () => clearInterval(cooldownIntervalRef.current), []);

  function resetTurnstile() {
    turnstileRef.current?.reset();
    setTurnstileToken(null);
  }

  function startResubmitCooldown() {
    clearInterval(cooldownIntervalRef.current);
    setCooldownSeconds(RESUBMIT_COOLDOWN_SECONDS);
    cooldownIntervalRef.current = setInterval(() => {
      setCooldownSeconds((current) => {
        if (current <= 1) {
          clearInterval(cooldownIntervalRef.current);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    let active = true;

    async function loadCounties() {
      const { data, error } = await supabase
        .from("counties")
        .select("id, name, slug")
        .order("name", { ascending: true });

      if (!active) return;

      if (error) {
        console.error("Could not load counties:", error);
        setErrorMessage("The county list could not be loaded.");
      } else {
        setCounties(data ?? []);
      }

      setLoadingCounties(false);
    }

    loadCounties();

    return () => {
      active = false;
    };
  }, []);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function toggleForm() {
    onOpenChange?.(!isOpen);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage("");
    setErrorMessage("");

    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim() || null;
    const countyId = Number(form.countyId);

    if (!email || !countyId) {
      setErrorMessage("Email and county are required.");
      return;
    }
    // Defensive re-check, not just the disabled button — pressing Enter
    // submits the form even while a button is disabled.
    if (!turnstileToken || cooldownSeconds > 0) {
      setErrorMessage("Complete the verification challenge before submitting.");
      return;
    }

    setSubmitting(true);

    const result = await subscribeToCountyUpdates({
      supabase,
      countyId,
      email,
      phone,
      turnstileToken,
    });

    setSubmitting(false);
    // A Turnstile token is single-use — reset it after every attempt,
    // success or failure, so a stale/consumed token can never be resent.
    resetTurnstile();

    if (!result.subscribed) {
      setErrorMessage(result.error);
      return;
    }

    setMessage("Your contact information was submitted.");
    startResubmitCooldown();

    setForm({
      ...INITIAL_FORM,
      countyId: initialCountyId ? String(initialCountyId) : "",
    });
  }

  return (
    <>
    <button
      type="button"
      className={`county-contact-backdrop ${isOpen ? "is-open" : ""}`}
      onClick={() => onOpenChange?.(false)}
      aria-label="Close contact form"
      tabIndex={isOpen ? 0 : -1}
    />
    <aside
      className={`county-contact-form ${
        isOpen ? "is-open" : "is-closed"
      }`}
      aria-label="County contact form"
    >
      <button
        type="button"
        className="county-contact-toggle"
        onClick={toggleForm}
        aria-label={isOpen ? "Close contact form" : "Open contact form"}
        aria-expanded={isOpen}
      >
        <svg
          className={`county-contact-toggle-arrow ${
            isOpen ? "is-open" : ""
          }`}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M9 5l7 7-7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <form
        className="county-contact-content"
        onSubmit={handleSubmit}
        aria-hidden={!isOpen}
      >
        <div className="county-contact-header">
          <h2>Join the local chapter</h2>
          <p>Share your email and county so we can keep you informed about local surveillance information. Meeting times and locations, opportunities to get involved like city council comments, and more. </p>
          <details className="county-contact-privacy">
            <summary tabIndex={isOpen ? 0 : -1}>Privacy advice</summary>
            <p>You need not share your name, or other personal information, and it is <strong>highly recommended</strong> that you create a separate email address with no identifying information for this purpose. This data is preserved in non-public data stores with strict privacy controls. additionally, if you do provide your phone number, we will never call you, we will only text you the locations of meetup locations and times for the county you selected.</p>
          </details>
        </div>

        <div>
          <label htmlFor="contact-email">Email</label>

          <input
            id="contact-email"
            name="email"
            type="email"
            value={form.email}
            onChange={updateField}
            autoComplete="email"
            tabIndex={isOpen ? 0 : -1}
            required
          />
        </div>

        <div>
          <label htmlFor="contact-phone">
            Phone number <span>(optional)</span>
          </label>

          <input
            id="contact-phone"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={updateField}
            autoComplete="tel"
            tabIndex={isOpen ? 0 : -1}
          />
        </div>

        <div>
          <label htmlFor="contact-county">County</label>

          <select
            id="contact-county"
            name="countyId"
            value={form.countyId}
            onChange={updateField}
            disabled={loadingCounties}
            tabIndex={isOpen ? 0 : -1}
            required
          >
            <option value="">
              {loadingCounties
                ? "Loading counties..."
                : initialCountyName
                  ? `Select a county — currently ${initialCountyName}`
                  : "Select your county"}
            </option>

            {counties.map((county) => (
              <option key={county.id} value={county.id}>
                {county.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Turnstile ref={turnstileRef} action="newsletter_signup" onToken={setTurnstileToken} />
        </div>

        <button
          type="submit"
          disabled={submitting || loadingCounties || !turnstileToken || cooldownSeconds > 0}
          tabIndex={isOpen ? 0 : -1}
        >
          {submitting
            ? "Submitting..."
            : cooldownSeconds > 0
              ? `Submit again in ${cooldownSeconds}s`
              : "Submit"}
        </button>

        {message && (
          <p role="status" className="form-success">
            {message}
          </p>
        )}

        {errorMessage && (
          <p role="alert" className="form-error">
            {errorMessage}
          </p>
        )}
      </form>
    </aside>
    </>
  );
}
