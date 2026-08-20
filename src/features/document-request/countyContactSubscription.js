/**
 * Optional county-newsletter subscription for the document-request delivery
 * panel. Reuses the existing public.county_contacts table and its RLS path
 * (anonymous insert only, no public select/update) — this is not a new
 * newsletter table, just a second caller of the same insert shape already
 * used by CountyContactForm.jsx.
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
 * Inserts a normalized email into county_contacts for the given county.
 * Treats the unique-constraint violation (23505) as a success so the
 * response never reveals whether the address was already registered, and
 * never queries existing rows to check first (the public RLS path does not
 * permit reading contact rows). counties.subscriber_count is maintained by
 * an existing database trigger and is never updated here.
 *
 * Returns { subscribed: true } or { subscribed: false, error } — the error
 * string is safe to display but never includes the submitted email.
 */
export async function subscribeToCountyUpdates({ supabase, countyId, email }) {
  const normalized = normalizeEmail(email);

  if (!normalized || !isValidEmail(normalized)) {
    return { subscribed: false, error: "Enter a valid email address." };
  }
  if (!countyId) {
    return { subscribed: false, error: "A county is required." };
  }

  const { error } = await supabase.from("county_contacts").insert({
    email: normalized,
    county_id: countyId,
    phone: null,
  });

  if (error) {
    if (error.code === "23505") {
      return { subscribed: true };
    }
    console.error("County contact subscription failed:", error.code ?? error.message ?? "unknown error");
    return { subscribed: false, error: "The subscription could not be saved. Please try again later." };
  }

  return { subscribed: true };
}
