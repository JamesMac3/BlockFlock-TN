/**
 * Optional county-newsletter subscription — the single shared client-side
 * entry point used by every public subscription UI in the app (the
 * site-wide CountyContactForm and the records-request delivery panel's
 * optional "county updates" field). Both callers go through this same
 * function, which in turn calls the same protected `newsletter-subscribe`
 * Supabase Edge Function — neither UI ever inserts into county_contacts
 * directly, and there is no second code path that could drift out of sync
 * with the server-side Turnstile/validation rules enforced there.
 *
 * The document generator and this subscription are kept strictly separate:
 * this module never sees fill_payload, RequestDocumentData, or the
 * generated PDF, and it must never log the email address anywhere.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isValidEmail(email) {
  return EMAIL_PATTERN.test(email);
}

/**
 * Invokes the newsletter-subscribe Edge Function for a normalized email,
 * county, and (required) Turnstile token. The function always returns the
 * same generic success for a new, already-existing, or suppressed
 * email+county pair — this client never distinguishes those cases either,
 * so the response can never be used to enumerate registered emails.
 *
 * Returns { subscribed: true } or { subscribed: false, error } — the error
 * string is safe to display but never includes the submitted email, and
 * the caller is responsible for resetting its Turnstile widget (the token
 * is single-use) after either outcome.
 */
export async function subscribeToCountyUpdates({ supabase, countyId, email, phone, turnstileToken }) {
  const normalized = normalizeEmail(email);

  if (!normalized || !isValidEmail(normalized)) {
    return { subscribed: false, error: "Enter a valid email address." };
  }
  if (!countyId) {
    return { subscribed: false, error: "A county is required." };
  }
  if (!turnstileToken) {
    return { subscribed: false, error: "Complete the verification challenge before submitting." };
  }

  const { data, error } = await supabase.functions.invoke("newsletter-subscribe", {
    body: {
      email: normalized,
      county_id: countyId,
      turnstile_token: turnstileToken,
      ...(phone ? { phone } : {}),
    },
  });

  if (error || !data?.subscribed) {
    console.error("County contact subscription failed:", error?.message ?? "unknown error");
    return { subscribed: false, error: "The subscription could not be saved. Please try again later." };
  }

  return { subscribed: true };
}
