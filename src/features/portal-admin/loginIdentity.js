// Resolves a single "username or email" login field into the email address
// actually passed to supabase.auth.signInWithPassword. This is presentation
// only — a convenience alias, not a separate authentication mechanism or
// username table. Authentication is still decided exclusively by Supabase
// Auth; an invalid or unrecognized alias here simply never attempts a
// sign-in and falls through to the same generic login failure as a wrong
// password or nonexistent account, so existence is never revealed either way.

const IDENTITY_DOMAIN = "flockblocktn.org";
const USERNAME_PATTERN = /^[a-z0-9._-]+$/;
export const MAX_LOGIN_FIELD_LENGTH = 120;

export function normalizeLoginIdentity(rawInput) {
  const trimmed = (rawInput ?? "").trim().toLowerCase();

  if (!trimmed) {
    return { ok: false };
  }

  if (trimmed.length > MAX_LOGIN_FIELD_LENGTH) {
    return { ok: false };
  }

  if (trimmed.includes("@")) {
    return { ok: true, email: trimmed };
  }

  if (!USERNAME_PATTERN.test(trimmed)) {
    return { ok: false };
  }

  return { ok: true, email: `${trimmed}@${IDENTITY_DOMAIN}` };
}
