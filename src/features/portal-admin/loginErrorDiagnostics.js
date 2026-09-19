// Classifies a supabase.auth.signInWithPassword() failure into a small,
// safe set of categories, so the login page can tell a visitor "we
// couldn't reach the login service" apart from "check your username or
// password" — without ever exposing a raw backend error message, an
// account's existence, or which of username/password was wrong.
//
// Supabase already collapses "no such account" and "wrong password" into
// the identical invalid_credentials/400 response (verified against the
// installed @supabase/auth-js's error-codes.d.ts and errors.d.ts) — this
// classifier relies on that and never tries to look any further into a
// credentials-shaped error than "credentials". Every category other than
// "credentials" is identified only from structural signals (error name,
// HTTP status, or a known non-credential error code) that say nothing
// about whether the account exists.
//
// - "connection": the request never reached the server (AuthRetryableFetchError,
//   or any AuthError with no HTTP status at all — per auth-js's own docs,
//   "some errors that occur before a response is received will not have
//   [a status] present").
// - "service": the server responded but with a 5xx — its own problem, not
//   the visitor's credentials.
// - "captcha": the captcha_failed error code — the challenge itself
//   failed, not the credentials.
// - "credentials": anything else, including the ordinary invalid_credentials
//   case — always the generic message, deliberately never split further.
export function classifySignInError(error) {
  if (!error) return "credentials";
  if (error.code === "captcha_failed") return "captcha";
  if (error.name === "AuthRetryableFetchError" || typeof error.status !== "number") return "connection";
  if (error.status >= 500) return "service";
  return "credentials";
}

export const GENERIC_CREDENTIALS_MESSAGE = "The account and password could not be verified.";

export const SIGN_IN_ERROR_MESSAGES = {
  credentials: GENERIC_CREDENTIALS_MESSAGE,
  connection: "We couldn't reach the login service. Check your connection and try again.",
  service: "The login service is temporarily unavailable. Please try again in a moment.",
  captcha: "The verification challenge could not be completed. Please try again.",
};

export function describeSignInError(error) {
  return SIGN_IN_ERROR_MESSAGES[classifySignInError(error)];
}
