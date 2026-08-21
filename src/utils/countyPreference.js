// Remembers the visitor's last-selected county as pure navigation
// convenience — never an authorization signal. Nothing that reads this
// value may use it to decide what a visitor is allowed to see or do; it
// only decides where an unauthenticated "Status" click lands.
//
// Namespaced and versioned so a future shape change can migrate or discard
// old values instead of silently misinterpreting them.
const STORAGE_KEY = "flockblock.selectedCounty.v1";

function readStorage() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing, disabled storage, or no window (SSR-safe) — treat
    // exactly like "nothing remembered yet".
    return null;
  }
}

export function getStoredCountySlug() {
  const value = readStorage();
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function setStoredCountySlug(slug) {
  if (!slug) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, slug);
  } catch {
    // Storage unavailable — navigation still works this session, it just
    // won't be remembered next time. Not worth surfacing to the visitor.
  }
}

export function clearStoredCountySlug() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do if storage itself is unavailable.
  }
}

/**
 * Validates a stored slug against the actual current county list — a
 * stored value is never trusted on its own (a county could be renamed,
 * removed, or the value could be stale/corrupted). Returns the matching
 * county object, or null if there is no stored value or it no longer
 * matches any real county.
 */
export function resolveStoredCounty(counties) {
  const storedSlug = getStoredCountySlug();
  if (!storedSlug || !Array.isArray(counties)) return null;
  return counties.find((county) => county.slug === storedSlug) ?? null;
}
