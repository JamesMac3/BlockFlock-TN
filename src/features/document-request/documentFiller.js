/**
 * Records Request Document Filler Integration
 * 
 * This module provides a minimal interface for filling PDF forms with
 * nonpersonal records request data. The actual PDF filling implementation
 * is isolated behind this boundary to maintain clean separation of concerns
 * and allow for future library upgrades.
 * 
 * CURRENT STATUS: The PDF filling engine is not yet integrated.
 * This module provides the interface structure and error handling.
 * 
 * Required Integration:
 * - PDF-lib or similar for AcroForm field population
 * - Support for nonpersonal field mapping
 * - No flattening of forms (fields remain editable)
 */

/**
 * Represents the result of a document fill operation
 * @typedef {Object} FillResult
 * @property {boolean} success - Whether the operation succeeded
 * @property {Blob|null} pdf - The filled PDF blob (if successful)
 * @property {string|null} error - Error message (if failed)
 * @property {string|null} warning - Non-fatal warning (if present)
 */

/**
 * Fill a PDF form with nonpersonal records request data
 * 
 * @param {Blob|ArrayBuffer} basePdf - The base PDF document
 * @param {Object} fillData - Nonpersonal records request data
 * @param {Object} fillData.request - Records request object
 * @param {string} fillData.request.records_description - What records are being requested
 * @param {string} fillData.request.department_or_division - Which department has the records
 * @param {string} fillData.request.record_category_label - Category of records
 * @param {string} fillData.request.date_from_mm_dd_yyyy - Start date (optional)
 * @param {string} fillData.request.date_to_mm_dd_yyyy - End date (optional)
 * @param {string} fillData.request.delivery_method - Preferred delivery method
 * @param {Object} formSchema - Form field schema and mappings
 * 
 * @returns {Promise<FillResult>} Result object with filled PDF or error
 */
export async function fillRecordsRequestForm(
  basePdf,
  fillData,
  formSchema
) {
  if (!isFillDataValid(fillData)) {
    return {
      success: false,
      pdf: null,
      error: "Invalid fill data: contains personal or unrecognized fields",
      warning: null,
    };
  }

  // PDF-lib integration not yet implemented
  return {
    success: false,
    pdf: null,
    error:
      "PDF form filling engine not yet integrated. Please configure pdf-lib or compatible PDF manipulation library.",
    warning:
      "To enable this feature, install @pdf-lib/fontkit and update fillRecordsRequestForm() implementation.",
  };
}

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

/**
 * Get information about the current PDF integration status
 * 
 * @returns {Object} Status information
 */
export function getIntegrationStatus() {
  return {
    isImplemented: false,
    engineName: "pdf-lib",
    status: "NOT_INTEGRATED",
    message:
      "PDF form filling is not yet implemented. Install @pdf-lib/fontkit and implement fillRecordsRequestForm().",
    requiredDependencies: [
      "pdf-lib ^1.17.0",
      "@pdf-lib/fontkit ^1.1.0",
    ],
    supportedFormats: ["AcroForm"],
    limitations: [
      "No form flattening (fields remain editable - this is intentional)",
      "Personal identity fields will remain blank",
      "Requester must complete identity, signature, and payment fields manually",
    ],
  };
}

/**
 * For testing purposes: mock fill that returns a minimal valid PDF
 * This should NOT be used in production
 * 
 * @param {Object} fillData - Fill data
 * @returns {Promise<FillResult>} Mock result
 * @internal
 */
export async function _mockFillRecordsRequestForm(fillData) {
  if (!isFillDataValid(fillData)) {
    return {
      success: false,
      pdf: null,
      error: "Invalid fill data",
      warning: null,
    };
  }

  // Return a mock empty PDF blob for testing
  // In real usage, this would be populated
  const mockPdf = new Blob([], { type: "application/pdf" });

  return {
    success: true,
    pdf: mockPdf,
    error: null,
    warning: "This is a mock PDF - not usable in production",
  };
}
