// Flock Block Tennessee — promote-goal-evidence
//
// Promotes an operator-uploaded private "incoming" file into a published,
// public goal resource: validates it, uploads it to the public archive
// bucket under a server-derived path, then calls the DB transaction
// (rrg_add_goal_resource) that inserts the evidence row, the goal link,
// and moves the goal to 'received' (Partial) or, only if explicitly
// requested, 'published' (Complete) — all or nothing. Adding a resource is
// deliberately not the same action as completing a goal.
//
// Request body is intentionally minimal: { goal_id, private_storage_path,
// object_kind, title, public_description, mark_complete }. No county,
// entity, bucket, or final filename is ever accepted from the caller —
// every one of those is derived server-side from the authorized goal row.
//
// Authorization is never inferred from a successful read. The
// county_records_request_goals "Public can read visible county goals" RLS
// policy lets any authenticated (or anon) caller read a *public* goal's
// row too, so a SELECT succeeding is not proof the caller may manage it.
// This function calls rrg_can_manage_goal explicitly and requires true
// before doing anything else.
//
// The service-role key is used for exactly one thing: uploading to the
// public-records-archive bucket (chapter masters have no direct write
// policy there — see the storage-policy preconditions in the migration).
// Every other call in this function uses the caller's own forwarded JWT,
// so auth.uid() inside rrg_add_goal_resource resolves to the real actor
// for authorization and the audit trail.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PUBLIC_BUCKET = "public-records-archive";
const PRIVATE_BUCKET = "archive-uploads";
const MAX_SIZE_BYTES = 52428800; // 50 MiB, matches the live public-records-archive bucket limit.

// Exactly one path segment after the private incoming folder — the same
// shape the client-side uploader is expected to generate, re-validated
// here rather than trusted.
const PRIVATE_PATH_PATTERN = /^counties\/(\d+)\/incoming\/[^/]+$/;

const MIME_EXTENSIONS = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/tiff": "tiff",
  "message/rfc822": "eml",
  "text/csv": "csv",
  "text/plain": "txt",
};

const ALLOWED_OBJECT_KINDS = new Set(["responsive_record", "correspondence"]);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

// Inspects the leading bytes of the file and returns the MIME type they
// actually indicate, or null if unrecognized. This is the source of truth
// for the final MIME type used everywhere downstream — the storage
// object's declared Content-Type is never trusted on its own, since a
// client can set it to anything regardless of the real bytes uploaded.
function sniffMimeType(bytes) {
  const bytesHex = (count) => Array.from(bytes.slice(0, count)).map((b) => b.toString(16).padStart(2, "0")).join("");

  if (bytesHex(5) === "255044462d") return "application/pdf"; // %PDF-
  if (bytesHex(4) === "89504e47") return "image/png"; // \x89PNG
  if (bytesHex(3) === "ffd8ff") return "image/jpeg";
  if (bytesHex(4) === "49492a00" || bytesHex(4) === "4d4d002a") return "image/tiff"; // little/big-endian TIFF
  if (bytesHex(4) === "504b0304" || bytesHex(4) === "504b0506") {
    // ZIP-based container: plain zip, or an Office Open XML document
    // (docx/xlsx are zip archives with a specific internal layout we
    // cannot cheaply distinguish here without unzipping) — resolved
    // against the declared type below, restricted to the zip-family
    // allowlist so a zip cannot masquerade as, say, a PDF.
    return "application/zip-family";
  }
  // Legacy .doc/.xls (OLE Compound File Binary Format) magic bytes. This
  // MUST be checked before the text/null-byte fallback below: an OLE file
  // is binary and virtually always contains a null byte in its first 4096
  // bytes, so it would otherwise always fail the plain-text plausibility
  // check further down and never reach any OLE-specific handling — meaning
  // legitimate .doc/.xls uploads would always be rejected as unrecognized.
  if (bytesHex(8) === "d0cf11e0a1b11ae1") return "ole-compound-file";
  // No reliable magic-byte signature for message/rfc822, text/csv, or
  // text/plain (they are unstructured text) — accepted only if the
  // content decodes as plain ASCII/UTF-8 text with no null bytes, which
  // at least rules out disguised binaries.
  const sample = bytes.slice(0, Math.min(bytes.length, 4096));
  const isPlausibleText = !sample.includes(0);
  return isPlausibleText ? "text-family" : null;
}

const ZIP_FAMILY_MIME_TYPES = new Set([
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const TEXT_FAMILY_MIME_TYPES = new Set(["message/rfc822", "text/csv", "text/plain"]);
const LEGACY_OFFICE_MIME_TYPES = new Set(["application/msword", "application/vnd.ms-excel"]);

// Reconciles the byte-sniffed signature with the declared Content-Type:
// the declared type must be a plausible member of the sniffed family, and
// only the declared type is ever passed on (it is more specific — sniffing
// alone cannot tell a .docx from a .zip, or an .xls from other legacy
// Office binaries) — this function's job is to reject an implausible
// combination, not to invent a more specific type than sniffing can prove.
function resolveMimeType(declaredType, bytes) {
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

function sanitizeOriginalFilename(rawName) {
  if (typeof rawName !== "string" || rawName.length === 0) return null;
  // Informational metadata only — never used to build a storage path.
  const base = rawName.split(/[\\/]/).pop() ?? rawName;
  const cleaned = base.replace(/[^\w .()-]/g, "_").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 255) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return jsonResponse({ error: "Authentication required." }, 401);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const {
    goal_id: goalId,
    private_storage_path: privateStoragePath,
    object_kind: objectKind,
    title,
    public_description: publicDescription,
    original_filename: originalFilenameInput,
    mark_complete: markComplete,
  } = body ?? {};

  if (typeof goalId !== "number" || !Number.isInteger(goalId)) {
    return jsonResponse({ error: "goal_id is required." }, 400);
  }
  if (typeof privateStoragePath !== "string" || !PRIVATE_PATH_PATTERN.test(privateStoragePath)) {
    return jsonResponse({ error: "private_storage_path is invalid." }, 400);
  }
  if (typeof objectKind !== "string" || !ALLOWED_OBJECT_KINDS.has(objectKind)) {
    return jsonResponse({ error: "object_kind must be 'responsive_record' or 'correspondence'." }, 400);
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    return jsonResponse({ error: "title is required." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration error." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: authUser, error: authUserError } = await userClient.auth.getUser();
  if (authUserError || !authUser?.user) {
    return jsonResponse({ error: "Authentication required." }, 401);
  }

  // Explicit authorization check — never inferred from a successful read.
  const { data: canManage, error: canManageError } = await userClient.rpc("rrg_can_manage_goal", {
    requested_goal_id: goalId,
  });
  if (canManageError || canManage !== true) {
    return jsonResponse({ error: "Not authorized to add a resource to this goal." }, 403);
  }

  const { data: goal, error: goalError } = await userClient
    .from("county_records_request_goals")
    .select("id, county_id, government_entity_id, status, locked")
    .eq("id", goalId)
    .single();
  if (goalError || !goal) {
    return jsonResponse({ error: "Goal not found." }, 404);
  }
  if (goal.locked) {
    return jsonResponse({ error: "This goal is locked and cannot receive resources." }, 403);
  }
  if (goal.status === "draft" || goal.status === "retired") {
    return jsonResponse({ error: "This goal is not in a state that can receive resources." }, 403);
  }
  if (!goal.government_entity_id) {
    return jsonResponse({ error: "This goal has no linked government entity." }, 403);
  }

  const requiredPrefix = `counties/${goal.county_id}/incoming/`;
  if (!privateStoragePath.startsWith(requiredPrefix)) {
    return jsonResponse({ error: "The private upload path is not within this goal's county." }, 403);
  }

  // Download using the caller's own token — the existing private-bucket
  // policy already scopes this to the caller's own county, so this also
  // acts as a second, independent confirmation of county ownership.
  const { data: downloaded, error: downloadError } = await userClient.storage
    .from(PRIVATE_BUCKET)
    .download(privateStoragePath);
  if (downloadError || !downloaded) {
    return jsonResponse({ error: "The uploaded file could not be found or read." }, 404);
  }

  const bytes = new Uint8Array(await downloaded.arrayBuffer());
  if (bytes.length < 1 || bytes.length > MAX_SIZE_BYTES) {
    return jsonResponse({ error: "The document size is outside the allowed range." }, 400);
  }

  // The final MIME type is derived from inspecting the file's own bytes,
  // reconciled against (never simply copied from) the storage object's
  // declared Content-Type — a mismatch (e.g. a renamed .exe declared as
  // application/pdf) is rejected outright as spoofing.
  const mimeType = resolveMimeType(downloaded.type, bytes);
  if (!mimeType) {
    return jsonResponse({ error: "The file's content does not match a supported, verifiable document type." }, 400);
  }
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) {
    return jsonResponse({ error: "Unsupported document MIME type." }, 400);
  }

  const sha256Hash = await sha256Hex(bytes.buffer);
  const finalFilename = `${crypto.randomUUID()}.${extension}`;
  const finalPath = `counties/${goal.county_id}/entities/${goal.government_entity_id}/goals/${goal.id}/${finalFilename}`;
  const sanitizedOriginalFilename = sanitizeOriginalFilename(originalFilenameInput);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { error: uploadError } = await serviceClient.storage
    .from(PUBLIC_BUCKET)
    .upload(finalPath, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) {
    return jsonResponse({ error: `The document could not be published: ${uploadError.message}` }, 502);
  }

  const { data: completion, error: completionError } = await userClient.rpc("rrg_add_goal_resource", {
    p_goal_id: goalId,
    p_object_kind: objectKind,
    p_storage_bucket: PUBLIC_BUCKET,
    p_storage_path: finalPath,
    p_mime_type: mimeType,
    p_size_bytes: bytes.length,
    p_sha256_hex: sha256Hash,
    p_original_filename: sanitizedOriginalFilename,
    p_title: title,
    p_public_description: typeof publicDescription === "string" ? publicDescription : null,
    p_mark_complete: markComplete === true,
  });

  if (completionError) {
    // The public bucket is public — if this cleanup delete itself fails,
    // the orphaned object remains directly fetchable by anyone who knows
    // its exact (cryptographically random) path, even though nothing in
    // the database links it and it is excluded from both archive RPCs. It
    // is undiscoverable through this app, not unreachable outright.
    const { error: cleanupError } = await serviceClient.storage.from(PUBLIC_BUCKET).remove([finalPath]);
    if (cleanupError) {
      await userClient.rpc("rrg_log_goal_evidence_cleanup_failure", {
        p_goal_id: goalId,
        p_storage_bucket: PUBLIC_BUCKET,
        p_storage_path: finalPath,
        p_reason: `db_transaction_failed: ${completionError.message}; cleanup_failed: ${cleanupError.message}`,
      });
      return jsonResponse({
        error: "The document could not be completed, and the uploaded copy could not be fully rolled back. Contact an administrator.",
        retryable: false,
      }, 500);
    }

    return jsonResponse({ error: completionError.message, retryable: true }, 400);
  }

  return jsonResponse({
    evidence_id: completion?.evidence_id,
    goal_id: goalId,
    is_primary: completion?.is_primary,
    goal_status: completion?.goal_status,
  });
});
