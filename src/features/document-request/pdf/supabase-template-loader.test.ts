import { describe, expect, it, vi } from "vitest";
import {
  createOperatorPreviewTemplateLoader,
  createSupabaseTemplateLoader,
  TemplateSourceError,
  type TemplateSource,
} from "./supabase-template-loader";

const evidenceId = "30000000-0000-4000-8000-000000000003";

function fakeSupabase(rpcResult: { data: TemplateSource[] | null; error: { message: string } | null }) {
  return {
    rpc: vi.fn(async () => rpcResult),
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example.test/${path}` } }),
      })),
    },
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

describe("createSupabaseTemplateLoader", () => {
  it("throws SOURCE_NOT_PUBLISHED when the RPC errors", async () => {
    const supabase = fakeSupabase({ data: null, error: { message: "denied" } });
    const load = createSupabaseTemplateLoader(supabase);
    await expect(load(evidenceId)).rejects.toMatchObject({ code: "SOURCE_NOT_PUBLISHED" });
    await expect(load(evidenceId)).rejects.toBeInstanceOf(TemplateSourceError);
  });

  it("throws SOURCE_NOT_PUBLISHED when the RPC returns no rows", async () => {
    const supabase = fakeSupabase({ data: [], error: null });
    const load = createSupabaseTemplateLoader(supabase);
    await expect(load(evidenceId)).rejects.toMatchObject({ code: "SOURCE_NOT_PUBLISHED" });
  });

  it("throws SOURCE_METADATA_INVALID for a rejected bucket", async () => {
    const supabase = fakeSupabase({
      data: [{ bucket_id: "not-request-templates", object_path: "a.pdf", mime_type: "application/pdf", size_bytes: 10, sha256_hex: "a".repeat(64) }],
      error: null,
    });
    const load = createSupabaseTemplateLoader(supabase);
    await expect(load(evidenceId)).rejects.toMatchObject({ code: "SOURCE_METADATA_INVALID" });
  });

  it("throws SOURCE_METADATA_INVALID for a rejected MIME type", async () => {
    const supabase = fakeSupabase({
      data: [{ bucket_id: "request-templates", object_path: "a.pdf", mime_type: "image/png", size_bytes: 10, sha256_hex: "a".repeat(64) }],
      error: null,
    });
    const load = createSupabaseTemplateLoader(supabase);
    await expect(load(evidenceId)).rejects.toMatchObject({ code: "SOURCE_METADATA_INVALID" });
  });

  it("throws SOURCE_METADATA_INVALID for a malformed sha256_hex", async () => {
    const supabase = fakeSupabase({
      data: [{ bucket_id: "request-templates", object_path: "a.pdf", mime_type: "application/pdf", size_bytes: 10, sha256_hex: "not-hex" }],
      error: null,
    });
    const load = createSupabaseTemplateLoader(supabase);
    await expect(load(evidenceId)).rejects.toMatchObject({ code: "SOURCE_METADATA_INVALID" });
  });

  it("throws SOURCE_DOWNLOAD_FAILED when the fetch response is not ok", async () => {
    const supabase = fakeSupabase({
      data: [{ bucket_id: "request-templates", object_path: "a.pdf", mime_type: "application/pdf", size_bytes: 10, sha256_hex: "a".repeat(64) }],
      error: null,
    });
    const fetcher = vi.fn(async () => new Response(null, { status: 404 }));
    const load = createSupabaseTemplateLoader(supabase, fetcher as unknown as typeof fetch);
    await expect(load(evidenceId)).rejects.toMatchObject({ code: "SOURCE_DOWNLOAD_FAILED" });
  });

  it("throws SOURCE_SIZE_MISMATCH when the downloaded byte count disagrees with verified metadata", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const supabase = fakeSupabase({
      data: [{ bucket_id: "request-templates", object_path: "a.pdf", mime_type: "application/pdf", size_bytes: 999, sha256_hex: await sha256Hex(bytes) }],
      error: null,
    });
    const fetcher = vi.fn(async () => new Response(bytes, { status: 200 }));
    const load = createSupabaseTemplateLoader(supabase, fetcher as unknown as typeof fetch);
    await expect(load(evidenceId)).rejects.toMatchObject({ code: "SOURCE_SIZE_MISMATCH" });
  });

  it("throws SOURCE_HASH_MISMATCH when the downloaded bytes disagree with the verified hash", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const supabase = fakeSupabase({
      data: [{ bucket_id: "request-templates", object_path: "a.pdf", mime_type: "application/pdf", size_bytes: bytes.length, sha256_hex: "a".repeat(64) }],
      error: null,
    });
    const fetcher = vi.fn(async () => new Response(bytes, { status: 200 }));
    const load = createSupabaseTemplateLoader(supabase, fetcher as unknown as typeof fetch);
    await expect(load(evidenceId)).rejects.toMatchObject({ code: "SOURCE_HASH_MISMATCH" });
  });

  it("returns verified bytes on a successful, hash-matching download", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45]);
    const hash = await sha256Hex(bytes);
    const supabase = fakeSupabase({
      data: [{ bucket_id: "request-templates", object_path: "forms/a.pdf", mime_type: "application/pdf", size_bytes: bytes.length, sha256_hex: hash }],
      error: null,
    });
    const fetcher = vi.fn(async () => new Response(bytes, { status: 200 }));
    const load = createSupabaseTemplateLoader(supabase, fetcher as unknown as typeof fetch);
    const result = await load(evidenceId);
    expect(result).toEqual(bytes);
    expect(supabase.rpc).toHaveBeenCalledWith("get_public_request_template_source", { evidence_id: evidenceId });
  });
});

describe("createOperatorPreviewTemplateLoader", () => {
  // Operator preview metadata comes from get_draft_request_preview_bundle,
  // never from get_public_request_template_source — this loader must never
  // call the public RPC.

  it("never calls the public get_public_request_template_source RPC", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45]);
    const hash = await sha256Hex(bytes);
    const source: TemplateSource = { bucket_id: "request-templates", object_path: "forms/draft.pdf", mime_type: "application/pdf", size_bytes: bytes.length, sha256_hex: hash };
    const supabase = fakeSupabase({ data: null, error: null });
    const fetcher = vi.fn(async () => new Response(bytes, { status: 200 }));
    const load = createOperatorPreviewTemplateLoader(source, supabase, fetcher as unknown as typeof fetch);

    const result = await load();

    expect(result).toEqual(bytes);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("applies the same metadata validation as the public loader", async () => {
    const source: TemplateSource = { bucket_id: "not-request-templates", object_path: "forms/draft.pdf", mime_type: "application/pdf", size_bytes: 10, sha256_hex: "a".repeat(64) };
    const supabase = fakeSupabase({ data: null, error: null });
    const load = createOperatorPreviewTemplateLoader(source, supabase);
    await expect(load()).rejects.toMatchObject({ code: "SOURCE_METADATA_INVALID" });
  });

  it("applies the same size/hash verification as the public loader", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const source: TemplateSource = { bucket_id: "request-templates", object_path: "forms/draft.pdf", mime_type: "application/pdf", size_bytes: bytes.length, sha256_hex: "a".repeat(64) };
    const supabase = fakeSupabase({ data: null, error: null });
    const fetcher = vi.fn(async () => new Response(bytes, { status: 200 }));
    const load = createOperatorPreviewTemplateLoader(source, supabase, fetcher as unknown as typeof fetch);
    await expect(load()).rejects.toMatchObject({ code: "SOURCE_HASH_MISMATCH" });
  });
});
