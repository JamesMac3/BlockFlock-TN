/**
 * Records-request fill-payload safety check.
 *
 * This module has a single, narrow job: confirm that a goal's
 * fill_payload.request object contains only the approved nonpersonal field
 * names with string (or null) values, mirroring the database check
 * constraint (public.rrg_fill_payload_is_safe) so the same rule can be
 * enforced client-side before a payload is trusted.
 *
 * It is not the PDF generator. The production browser generator — profile
 * and request-data validation, the placeholder resolver, all three
 * renderers, the Supabase template loader, and output validation — lives
 * under src/features/document-request/pdf/, orchestrated by
 * generateRequestDocument() in generate-request-document.ts.
 */

/**
 * Validate that fill data contains only approved nonpersonal fields
 *
 * @param {Object} fillData - Data to validate
 * @returns {boolean} True if data is safe to use
 */
export function isFillDataValid(fillData) {
  if (!fillData || typeof fillData !== "object" || Array.isArray(fillData)) {
    return false;
  }

  // Must have exactly one top-level key: "request"
  const keys = Object.keys(fillData);
  if (keys.length !== 1 || !("request" in fillData)) {
    return false;
  }

  const request = fillData.request;
  if (typeof request !== "object" || Array.isArray(request) || request === null) {
    return false;
  }

  // Approved field names only
  const allowedFields = new Set([
    "records_description",
    "department_or_division",
    "record_category_label",
    "date_from_mm_dd_yyyy",
    "date_to_mm_dd_yyyy",
    "delivery_method",
  ]);

  for (const key of Object.keys(request)) {
    if (!allowedFields.has(key)) {
      return false; // Unexpected field
    }
  }

  // All values must be strings or null (not numbers, objects, etc.)
  for (const value of Object.values(request)) {
    if (value !== null && typeof value !== "string") {
      return false;
    }
  }

  return true;
}
