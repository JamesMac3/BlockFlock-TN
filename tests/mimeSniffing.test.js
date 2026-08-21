import test from "node:test";
import assert from "node:assert/strict";
import { sniffMimeType, resolveMimeType } from "../src/features/portal-admin/mimeSniffing.js";

// Real byte fixtures, not source-text assertions — proves the actual
// sniffing/resolution behavior against constructed bytes, including the
// mismatched-declared-type spoofing cases the Codex review flagged.

function bytesFromHex(hex) {
  const clean = hex.replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function padded(bytes, length = 32) {
  const out = new Uint8Array(Math.max(length, bytes.length));
  out.set(bytes);
  return out;
}

const PDF_BYTES = padded(bytesFromHex("255044462d312e34")); // "%PDF-1.4"
const OLE_BYTES = padded(bytesFromHex("d0cf11e0a1b11ae1")); // legacy .doc/.xls
const PNG_BYTES = padded(bytesFromHex("89504e470d0a1a0a"));
const ZIP_BYTES = padded(bytesFromHex("504b0304"));
const RANDOM_BINARY_BYTES = padded(bytesFromHex("00ff00ff00ff00ff00ff00ff"));
const PLAIN_TEXT_BYTES = new TextEncoder().encode("Dear Chapter Master, please find the attached records.");

test("sniffMimeType detects OLE Compound File bytes as their own top-level category", () => {
  assert.equal(sniffMimeType(OLE_BYTES), "ole-compound-file");
});

test("sniffMimeType checks OLE before the text/null-byte fallback (OLE bytes never misclassify as unrecognized text)", () => {
  // OLE bytes contain a null byte in the first 4096 bytes (the padding),
  // which would fail the text-family null-byte check if OLE detection ran
  // after it instead of before.
  assert.notEqual(sniffMimeType(OLE_BYTES), null);
  assert.notEqual(sniffMimeType(OLE_BYTES), "text-family");
});

test("a valid .doc file (declared application/msword) is accepted", () => {
  assert.equal(resolveMimeType("application/msword", OLE_BYTES), "application/msword");
});

test("a valid .xls file (declared legacy Excel MIME) is accepted", () => {
  assert.equal(resolveMimeType("application/vnd.ms-excel", OLE_BYTES), "application/vnd.ms-excel");
});

test("OLE bytes declared as a PDF are rejected", () => {
  assert.equal(resolveMimeType("application/pdf", OLE_BYTES), null);
});

test("PDF bytes declared as a Word document are rejected", () => {
  assert.equal(resolveMimeType("application/msword", PDF_BYTES), null);
});

test("PDF bytes declared honestly are accepted", () => {
  assert.equal(resolveMimeType("application/pdf", PDF_BYTES), "application/pdf");
});

test("PNG bytes declared honestly are accepted", () => {
  assert.equal(resolveMimeType("image/png", PNG_BYTES), "image/png");
});

test("a zip declared as an unsupported zip-family type is rejected", () => {
  assert.equal(resolveMimeType("application/vnd.rar", ZIP_BYTES), null);
});

test("a docx (zip bytes, declared as the OOXML word type) is accepted", () => {
  assert.equal(
    resolveMimeType("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ZIP_BYTES),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
});

test("plain text declared as text/plain is accepted", () => {
  assert.equal(resolveMimeType("text/plain", PLAIN_TEXT_BYTES), "text/plain");
});

test("plain text declared as an unsupported text type is rejected", () => {
  assert.equal(resolveMimeType("text/html", PLAIN_TEXT_BYTES), null);
});

test("random binary bytes with no recognizable signature are rejected outright", () => {
  assert.equal(sniffMimeType(RANDOM_BINARY_BYTES), null);
  assert.equal(resolveMimeType("application/pdf", RANDOM_BINARY_BYTES), null);
  assert.equal(resolveMimeType("text/plain", RANDOM_BINARY_BYTES), null);
});
