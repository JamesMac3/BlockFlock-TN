import { validateExternalUrl } from "../../utils/urlValidation.js";

export const CHAPTER_LINK_LABEL_MAX_LENGTH = 60;
export const CHAPTER_LINK_URL_MAX_LENGTH = 2048;

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

// A slot with nothing typed in either field is omitted from the save
// payload entirely (never sent to save_county_chapter_links as an empty
// row) — this is what "leave a slot blank to keep it hidden" means.
// A slot with only one of the two fields filled is rejected with an
// inline explanation rather than silently guessed at or silently dropped.
export function validateChapterLinkSlot(slot) {
  const label = (slot.label ?? "").trim();
  const url = (slot.url ?? "").trim();

  if (!label && !url) return { empty: true };
  if (!label || !url) {
    return { error: "Enter both button text and a URL, or use Clear to remove this slot." };
  }
  if (label.length > CHAPTER_LINK_LABEL_MAX_LENGTH) {
    return { error: `Button text must be ${CHAPTER_LINK_LABEL_MAX_LENGTH} characters or fewer.` };
  }
  if (hasControlCharacter(label)) {
    return { error: "Button text contains unsupported characters." };
  }
  if (url.length > CHAPTER_LINK_URL_MAX_LENGTH) {
    return { error: "That URL is too long." };
  }

  const urlResult = validateExternalUrl(url);
  if (!urlResult.valid) {
    return { error: urlResult.error };
  }

  return { value: { label, url: urlResult.url, color: slot.color } };
}

// Validates all slots (1-based order preserved) and, only if every
// non-empty slot is individually valid, returns the exact array shape
// save_county_chapter_links expects — empty slots omitted completely.
// Returns { errors } (one entry per slot, null where valid/empty) if any
// slot fails validation, so the caller can show each inline without
// attempting to save.
export function buildChapterLinksPayload(slots) {
  const results = slots.map(validateChapterLinkSlot);
  const errors = results.map((result) => result.error ?? null);
  if (errors.some(Boolean)) {
    return { errors };
  }
  const payload = results
    .map((result, index) => (result.value ? { slot: index + 1, ...result.value } : null))
    .filter(Boolean);
  return { errors, payload };
}
