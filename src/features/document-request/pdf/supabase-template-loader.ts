export type TemplateSource = {
  bucket_id: string;
  object_path: string;
  mime_type: string;
  size_bytes: number;
  sha256_hex: string;
};

export type SupabaseTemplateClient = {
  rpc(
    functionName: string,
    parameters: { evidence_id: string },
  ): Promise<{
    data: TemplateSource[] | null;
    error: { message: string } | null;
  }>;

  storage: {
    from(bucket: string): {
      getPublicUrl(path: string): {
        data: { publicUrl: string };
      };
    };
  };
};

export type SupabaseStorageOnlyClient = Pick<SupabaseTemplateClient, "storage">;

const MAX_TEMPLATE_BYTES = 25 * 1024 * 1024;

export class TemplateSourceError extends Error {
  constructor(
    readonly code:
      | "SOURCE_NOT_PUBLISHED"
      | "SOURCE_METADATA_INVALID"
      | "SOURCE_DOWNLOAD_FAILED"
      | "SOURCE_SIZE_MISMATCH"
      | "SOURCE_HASH_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "TemplateSourceError";
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes).buffer,
  );

  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function assertValidMetadata(source: TemplateSource): void {
  if (
    source.bucket_id !== "request-templates" ||
    source.mime_type !== "application/pdf" ||
    source.size_bytes < 1 ||
    source.size_bytes > MAX_TEMPLATE_BYTES ||
    !/^[0-9a-f]{64}$/.test(source.sha256_hex)
  ) {
    throw new TemplateSourceError(
      "SOURCE_METADATA_INVALID",
      "The published template metadata is invalid.",
    );
  }
}

/**
 * Downloads and verifies a base PDF given its already-resolved
 * TemplateSource metadata: validates the metadata shape, fetches the
 * public storage URL, and checks the downloaded byte count and SHA-256
 * hash against that metadata before returning the bytes. Shared by both
 * the public verified-profile loader (which fetches this metadata via the
 * get_public_request_template_source RPC) and the authorized operator
 * preview loader (which receives it directly from the preview-bundle RPC),
 * so both paths perform identical integrity verification.
 */
async function downloadAndVerifyTemplate(
  source: TemplateSource,
  client: SupabaseStorageOnlyClient,
  fetcher: typeof fetch,
): Promise<Uint8Array> {
  assertValidMetadata(source);

  const { publicUrl } = client.storage
    .from(source.bucket_id)
    .getPublicUrl(source.object_path).data;

  const response = await fetcher(publicUrl, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new TemplateSourceError(
      "SOURCE_DOWNLOAD_FAILED",
      `Template download failed with status ${response.status}.`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  if (bytes.length !== source.size_bytes) {
    throw new TemplateSourceError(
      "SOURCE_SIZE_MISMATCH",
      "Downloaded template size does not match its verified metadata.",
    );
  }

  if ((await sha256(bytes)) !== source.sha256_hex) {
    throw new TemplateSourceError(
      "SOURCE_HASH_MISMATCH",
      "Downloaded template hash does not match its verified evidence record.",
    );
  }

  return bytes;
}

export function createSupabaseTemplateLoader(
  supabase: SupabaseTemplateClient,
  fetcher: typeof fetch = fetch,
) {
  return async function loadBasePdf(
    evidenceId: string,
  ): Promise<Uint8Array> {
    const { data, error } = await supabase.rpc(
      "get_public_request_template_source",
      { evidence_id: evidenceId },
    );

    if (error) {
      throw new TemplateSourceError(
        "SOURCE_NOT_PUBLISHED",
        error.message,
      );
    }

    if (!data || data.length !== 1) {
      throw new TemplateSourceError(
        "SOURCE_NOT_PUBLISHED",
        "The template source is not publicly available.",
      );
    }

    return downloadAndVerifyTemplate(data[0], supabase, fetcher);
  };
}

/**
 * Authorized-operator counterpart to createSupabaseTemplateLoader. Instead
 * of fetching TemplateSource metadata via the public
 * get_public_request_template_source RPC (which only returns
 * published/verified evidence), this accepts metadata already resolved by
 * the authorized get_draft_request_preview_bundle RPC and performs the
 * exact same download-and-verify integrity check. It never calls the
 * public RPC and never bypasses the size/hash verification.
 */
export function createOperatorPreviewTemplateLoader(
  evidenceSource: TemplateSource,
  client: SupabaseStorageOnlyClient,
  fetcher: typeof fetch = fetch,
) {
  return async function loadBasePdf(): Promise<Uint8Array> {
    return downloadAndVerifyTemplate(evidenceSource, client, fetcher);
  };
}
