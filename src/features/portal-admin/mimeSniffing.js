// Pure mirror of promote-goal-evidence/index.ts's sniffMimeType/resolveMimeType.
// This is NOT the source of truth — the Deno Edge Function is — but Deno
// Edge Functions cannot be executed directly by Vitest/node:test, so this
// lets the actual byte-sniffing logic be exercised with real byte arrays
// rather than only asserted against via source-text regex matching.
// Any change to the Edge Function's sniffing rules must be mirrored here.

export function sniffMimeType(bytes) {
  const bytesHex = (count) =>
    Array.from(bytes.slice(0, count)).map((b) => b.toString(16).padStart(2, "0")).join("");

  if (bytesHex(5) === "255044462d") return "application/pdf";
  if (bytesHex(4) === "89504e47") return "image/png";
  if (bytesHex(3) === "ffd8ff") return "image/jpeg";
  if (bytesHex(4) === "49492a00" || bytesHex(4) === "4d4d002a") return "image/tiff";
  if (bytesHex(4) === "504b0304" || bytesHex(4) === "504b0506") return "application/zip-family";
  // Must be checked before the text/null-byte fallback below — an OLE file
  // is binary and virtually always contains a null byte in its first 4096
  // bytes, so it would otherwise always fail isPlausibleText.
  if (bytesHex(8) === "d0cf11e0a1b11ae1") return "ole-compound-file";

  const sample = bytes.slice(0, Math.min(bytes.length, 4096));
  const isPlausibleText = !sample.includes(0);
  return isPlausibleText ? "text-family" : null;
}

export const ZIP_FAMILY_MIME_TYPES = new Set([
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
export const TEXT_FAMILY_MIME_TYPES = new Set(["message/rfc822", "text/csv", "text/plain"]);
export const LEGACY_OFFICE_MIME_TYPES = new Set(["application/msword", "application/vnd.ms-excel"]);

export function resolveMimeType(declaredType, bytes) {
  const sniffed = sniffMimeType(bytes);
  if (!sniffed) return null;

  if (sniffed === "application/pdf" || sniffed === "image/png" || sniffed === "image/jpeg" || sniffed === "image/tiff") {
    return declaredType === sniffed ? sniffed : null;
  }
  if (sniffed === "application/zip-family") {
    return ZIP_FAMILY_MIME_TYPES.has(declaredType) ? declaredType : null;
  }
  if (sniffed === "ole-compound-file") {
    return LEGACY_OFFICE_MIME_TYPES.has(declaredType) ? declaredType : null;
  }
  if (sniffed === "text-family") {
    return TEXT_FAMILY_MIME_TYPES.has(declaredType) ? declaredType : null;
  }
  return null;
}
