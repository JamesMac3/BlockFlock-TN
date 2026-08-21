import test from "node:test";
import assert from "node:assert/strict";
import {
  isInlineViewable,
  friendlyDownloadFilename,
  manifestEntryToArchiveRow,
  rpcRowToArchiveRow,
  mergeArchiveRows,
  matchesArchiveSearch,
  sortArchiveRows,
  extensionForMimeType,
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  NOT_RECORDED,
} from "../src/features/portal-admin/archiveDocumentType.js";

test("PDFs and images render inline; everything else is download-only", () => {
  assert.equal(isInlineViewable("application/pdf"), true);
  assert.equal(isInlineViewable("image/jpeg"), true);
  assert.equal(isInlineViewable("message/rfc822"), false);
  assert.equal(isInlineViewable("application/zip"), false);
  assert.equal(isInlineViewable("application/msword"), false);
});

test("friendly filenames use the title, not the random storage filename", () => {
  assert.equal(friendlyDownloadFilename("Executed Contract", "application/pdf"), "Executed Contract.pdf");
  assert.equal(friendlyDownloadFilename("Response: Records/Request?", "message/rfc822"), "Response Records Request.eml");
});

test("manifest entries map to Template rows with known metadata preserved and unknowns marked Not recorded", () => {
  const row = manifestEntryToArchiveRow("murfreesboro-city-request-form", {
    title: "City of Murfreesboro Request Form",
    governmentEntity: "City of Murfreesboro",
    county: "Rutherford County",
  });
  assert.equal(row.documentType, "Template");
  assert.equal(row.county, "Rutherford County");
  assert.equal(row.governmentEntity, "City of Murfreesboro");
  assert.equal(row.uploadedBy, NOT_RECORDED);
  assert.equal(row.reviewedBy, NOT_RECORDED);
  assert.equal(row.href, "/documents/murfreesboro-city-request-form");
});

test("RPC rows route through the branded evidence viewer, never a raw storage URL", () => {
  const row = rpcRowToArchiveRow({
    evidence_id: "abc-123",
    title: "Executed Contract",
    document_type: "Evidence",
    county: "Rutherford County",
    government_entity: "City of Murfreesboro",
    goal_titles: ["Body camera contract"],
    upload_date: "2026-08-01T00:00:00Z",
    uploaded_by: "Administrator",
    reviewed_by: "Rutherford County Chapter Master",
  });
  assert.equal(row.href, "/archive/documents/abc-123");
  assert.equal(row.evidenceId, "abc-123");
});

test("merge combines manifest templates and RPC rows into one list", () => {
  const merged = mergeArchiveRows(
    { "murfreesboro-city-request-form": { title: "Form", governmentEntity: "City", county: "Rutherford County" } },
    [{ evidence_id: "1", title: "Doc", document_type: "Evidence" }]
  );
  assert.equal(merged.length, 2);
  assert.ok(merged.some((row) => row.documentType === "Template"));
  assert.ok(merged.some((row) => row.documentType === "Evidence"));
});

test("search matches title, goal title, county, entity, uploader, and reviewer", () => {
  const row = rpcRowToArchiveRow({
    evidence_id: "1",
    title: "Executed Contract",
    document_type: "Evidence",
    county: "Rutherford County",
    government_entity: "City of Murfreesboro",
    goal_titles: ["Body camera contract register"],
    uploaded_by: "Administrator",
    reviewed_by: "Rutherford County Chapter Master",
  });
  assert.equal(matchesArchiveSearch(row, "body camera"), true);
  assert.equal(matchesArchiveSearch(row, "rutherford"), true);
  assert.equal(matchesArchiveSearch(row, "administrator"), true);
  assert.equal(matchesArchiveSearch(row, "murfreesboro"), true);
  assert.equal(matchesArchiveSearch(row, "nashville"), false);
});

test("sort by upload date defaults to newest first", () => {
  const rows = [
    rpcRowToArchiveRow({ evidence_id: "1", title: "Older", upload_date: "2026-01-01T00:00:00Z" }),
    rpcRowToArchiveRow({ evidence_id: "2", title: "Newer", upload_date: "2026-08-01T00:00:00Z" }),
  ];
  const sorted = sortArchiveRows(rows, "upload_date", "desc");
  assert.equal(sorted[0].title, "Newer");
});

test("upload MIME allowlist and size ceiling match the server-side RPC exactly", () => {
  assert.equal(ALLOWED_UPLOAD_MIME_TYPES.length, 12);
  assert.ok(ALLOWED_UPLOAD_MIME_TYPES.includes("application/pdf"));
  assert.ok(ALLOWED_UPLOAD_MIME_TYPES.includes("message/rfc822"));
  assert.equal(MAX_UPLOAD_SIZE_BYTES, 52428800);
});

test("extension is derived from MIME type, never trusted from a filename", () => {
  assert.equal(extensionForMimeType("application/pdf"), "pdf");
  assert.equal(extensionForMimeType("message/rfc822"), "eml");
  assert.equal(extensionForMimeType("application/x-made-up"), null);
});

test("sort by title is stable and alphabetical", () => {
  const rows = [
    rpcRowToArchiveRow({ evidence_id: "1", title: "Zebra" }),
    rpcRowToArchiveRow({ evidence_id: "2", title: "Apple" }),
  ];
  const sorted = sortArchiveRows(rows, "title", "asc");
  assert.deepEqual(sorted.map((row) => row.title), ["Apple", "Zebra"]);
});
