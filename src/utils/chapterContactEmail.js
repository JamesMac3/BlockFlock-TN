import { isChapterClaimed } from "./chapterStatus.js";

// Statewide fallback used whenever a county has no active local chapter, or
// an active chapter with no configured contact email yet.
export const FALLBACK_CHAPTER_EMAIL = "admin@flockblocktn.org";

/**
 * The email a member of the public should send records to for a given
 * county: that county's own configured chapter_contact_email, but only
 * when the county actually has a claimed chapter (isChapterClaimed, the
 * same public chapter_status check CountyStatusPage/TennesseeCountyMap
 * use) and that email is non-blank. Otherwise falls back to the statewide
 * admin address rather than showing a blank field or guessing.
 */
export function getChapterContactEmail(county) {
  const configuredEmail = typeof county?.chapter_contact_email === "string"
    ? county.chapter_contact_email.trim()
    : "";

  if (isChapterClaimed(county) && configuredEmail) {
    return configuredEmail;
  }

  return FALLBACK_CHAPTER_EMAIL;
}
