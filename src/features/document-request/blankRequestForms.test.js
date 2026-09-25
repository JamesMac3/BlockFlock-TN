import { describe, expect, it, vi } from "vitest";
import {
  BLANK_FORMS_BUCKET,
  blankFormDownloadFilename,
  blankFormPath,
  blankFormUrls,
  classifyBlankFormLookupError,
  isEvidenceId,
  isUsableBlankForm,
} from "./blankRequestForms";

// Shape copied from a real anonymous get_public_blank_request_forms row.
const alcoa = {
  evidence_id: "4f50af92-b781-4cae-8303-9d20f6f08af9",
  title: "Alcoa — Municipal government — Public Records Request Form",
  county: "Blount County",
  government_entity: "Alcoa — Municipal government",
  government_entity_id: 464,
  mime_type: "application/pdf",
  original_filename: "Alcoa city Public Records Request Form.pdf",
  storage_bucket: "request-templates",
  storage_path: "entities/464/forms/5879fb8d88f65210c0e055fbb4333a2f6e9025ce838278026a60ee2d3b955aea.pdf",
  upload_date: "2026-09-25T19:46:15.625751+00:00",
};

function fakeStorage() {
  const calls = [];
  const storage = {
    from: vi.fn((bucket) => ({
      getPublicUrl: (path, options) => {
        calls.push({ bucket, path, options });
        const suffix = options?.download ? `?download=${encodeURIComponent(options.download)}` : "";
        return { data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}${suffix}` } };
      },
    })),
  };
  return { storage, calls };
}

describe("isEvidenceId", () => {
  it("accepts a uuid", () => expect(isEvidenceId(alcoa.evidence_id)).toBe(true));
  it("rejects a non-uuid (so the viewer shows not-found instead of calling the RPC and getting a 22P02)", () => {
    expect(isEvidenceId("not-a-uuid")).toBe(false);
    expect(isEvidenceId("")).toBe(false);
    expect(isEvidenceId(undefined)).toBe(false);
  });
});

describe("classifyBlankFormLookupError", () => {
  it("treats Postgres invalid-uuid (22P02) as not-found, not a retryable error", () => {
    expect(classifyBlankFormLookupError({ code: "22P02", message: "invalid input syntax for type uuid" })).toBe("not-found");
  });
  it("treats any other failure as a retryable error", () => {
    expect(classifyBlankFormLookupError({ code: "PGRST301", message: "JWT expired" })).toBe("error");
    expect(classifyBlankFormLookupError({ message: "Failed to fetch" })).toBe("error");
  });
  it("returns null when there is no error", () => expect(classifyBlankFormLookupError(null)).toBeNull());
});

describe("isUsableBlankForm", () => {
  it("accepts a real returned row", () => expect(isUsableBlankForm(alcoa)).toBe(true));
  it("rejects a row outside the request-templates bucket", () => {
    expect(isUsableBlankForm({ ...alcoa, storage_bucket: "archive-uploads" })).toBe(false);
  });
  it("rejects a non-PDF", () => expect(isUsableBlankForm({ ...alcoa, mime_type: "image/png" })).toBe(false));
  it("rejects missing, absolute, or traversal paths", () => {
    expect(isUsableBlankForm({ ...alcoa, storage_path: "" })).toBe(false);
    expect(isUsableBlankForm({ ...alcoa, storage_path: "/etc/passwd" })).toBe(false);
    expect(isUsableBlankForm({ ...alcoa, storage_path: "entities/../private/x.pdf" })).toBe(false);
    expect(isUsableBlankForm(null)).toBe(false);
  });
});

describe("blankFormUrls", () => {
  it("builds both URLs only from the returned bucket/path, the download one via the SDK's download option", () => {
    const { storage, calls } = fakeStorage();
    const urls = blankFormUrls(storage, alcoa);
    expect(storage.from).toHaveBeenCalledWith(BLANK_FORMS_BUCKET);
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.path === alcoa.storage_path)).toBe(true);
    expect(urls.viewUrl).toBe(`https://example.supabase.co/storage/v1/object/public/request-templates/${alcoa.storage_path}`);
    expect(calls[1].options).toEqual({ download: blankFormDownloadFilename(alcoa) });
    expect(urls.downloadUrl).toContain("?download=");
  });

  it("returns null (the viewer's 'unavailable' state) for an unusable row, without building any URL", () => {
    const { storage, calls } = fakeStorage();
    expect(blankFormUrls(storage, { ...alcoa, storage_bucket: "public-records-archive" })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("blankFormDownloadFilename / blankFormPath", () => {
  it("derives a safe .pdf filename from the title", () => {
    expect(blankFormDownloadFilename(alcoa)).toBe("Alcoa — Municipal government — Public Records Request Form.pdf");
    expect(blankFormDownloadFilename({ ...alcoa, title: "a/b:c" })).toBe("a b c.pdf");
  });
  it("routes to the dedicated blank-form viewer, never the goal-linked archive document route", () => {
    expect(blankFormPath(alcoa.evidence_id)).toBe(`/archive/forms/${alcoa.evidence_id}`);
  });
});
