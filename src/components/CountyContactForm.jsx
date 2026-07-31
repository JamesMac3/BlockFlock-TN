import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./CountyContactForm.css";

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

    setSubmitting(true);

    const { error } = await supabase.from("county_contacts").insert({
      email,
      phone,
      county_id: countyId,
    });

    setSubmitting(false);

    if (error) {
      console.error("Submission failed:", error);

      if (error.code === "23505") {
        setErrorMessage(
          "That email has already been registered for this county."
        );
        return;
      }

      setErrorMessage("The submission could not be saved.");
      return;
    }

    setMessage("Your contact information was submitted.");

    setForm({
      ...INITIAL_FORM,
      countyId: initialCountyId ? String(initialCountyId) : "",
    });
  }

  return (
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

        <button
          type="submit"
          disabled={submitting || loadingCounties}
          tabIndex={isOpen ? 0 : -1}
        >
          {submitting ? "Submitting..." : "Submit"}
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
  );
}
