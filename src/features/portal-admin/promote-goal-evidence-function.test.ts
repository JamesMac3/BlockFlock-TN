import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import functionSource from "../../../supabase/functions/promote-goal-evidence/index.ts?raw";

/**
 * Static assertions against the not-yet-deployed promote-goal-evidence Edge
 * Function's actual source text — the closest available proof of its
 * behavior since there is no live Supabase/Deno runtime in this
 * environment.
 */

describe("promote-goal-evidence function: explicit authorization, never inferred from a read", () => {
  it("calls rrg_can_manage_goal explicitly and requires it to be exactly true before doing anything else", () => {
    expect(functionSource).toMatch(/userClient\.rpc\("rrg_can_manage_goal", \{\s*\n\s*requested_goal_id: goalId,\s*\n\s*\}\)/);
    expect(functionSource).toMatch(/canManageError \|\| canManage !== true/);
  });

  it("performs the authorization RPC call before reading the goal row", () => {
    const authzIndex = functionSource.indexOf('userClient.rpc("rrg_can_manage_goal"');
    const goalSelectIndex = functionSource.indexOf('.from("county_records_request_goals")');
    expect(authzIndex).toBeGreaterThanOrEqual(0);
    expect(goalSelectIndex).toBeGreaterThan(authzIndex);
  });

  it("documents why authorization is never inferred from a successful read", () => {
    expect(functionSource).toMatch(/never inferred from a successful read/);
  });
});

describe("promote-goal-evidence function: never trusts caller-provided identity", () => {
  it("request body accepts no county, entity, or bucket", () => {
    const destructure = functionSource.match(/const \{([\s\S]*?)\} = body \?\? \{\};/)?.[1] ?? "";
    expect(destructure).not.toMatch(/county/i);
    expect(destructure).not.toMatch(/entity/i);
    expect(destructure).not.toMatch(/bucket/i);
  });

  it("derives county_id and government_entity_id from the fetched goal row, not the request body", () => {
    expect(functionSource).toMatch(/goal\.county_id/);
    expect(functionSource).toMatch(/goal\.government_entity_id/);
  });

  it("generates the final filename with a cryptographically random UUID, never the caller's original filename", () => {
    expect(functionSource).toMatch(/crypto\.randomUUID\(\)/);
    expect(functionSource).toMatch(/const finalFilename = `\$\{crypto\.randomUUID\(\)\}\.\$\{extension\}`;/);
  });

  it("accepts an original_filename only as sanitized, length-bounded metadata — never as part of the storage path", () => {
    expect(functionSource).toMatch(/function sanitizeOriginalFilename/);
    expect(functionSource).toMatch(/\.slice\(0, 255\)/);
    const finalPathLine = functionSource.match(/const finalPath = `[^`]*`;/)?.[0] ?? "";
    expect(finalPathLine).not.toMatch(/originalFilename/i);
  });

  it("derives the file extension from the resolved (sniffed + reconciled) MIME type via a fixed allowlist map, never from the uploaded filename", () => {
    expect(functionSource).toMatch(/const extension = MIME_EXTENSIONS\[mimeType\];/);
  });
});

describe("promote-goal-evidence function: exact private-path validation, not a prefix check", () => {
  it("validates the incoming path against an anchored regex requiring exactly one filename segment", () => {
    expect(functionSource).toMatch(/const PRIVATE_PATH_PATTERN = \/\^counties\\\/\(\\d\+\)\\\/incoming\\\/\[\^\/\]\+\$\/;/);
    expect(functionSource).toMatch(/!PRIVATE_PATH_PATTERN\.test\(privateStoragePath\)/);
  });

  it("still independently confirms the path belongs to the authorized goal's own county after the format check", () => {
    expect(functionSource).toMatch(/const requiredPrefix = `counties\/\$\{goal\.county_id\}\/incoming\/`;/);
    expect(functionSource).toMatch(/!privateStoragePath\.startsWith\(requiredPrefix\)/);
  });
});

describe("promote-goal-evidence function: real MIME verification, not a trusted declared type", () => {
  it("never uses the storage object's declared Content-Type as the final MIME type without reconciling it against sniffed bytes", () => {
    expect(functionSource).toMatch(/function sniffMimeType\(bytes\)/);
    expect(functionSource).toMatch(/function resolveMimeType\(declaredType, bytes\)/);
    expect(functionSource).toMatch(/const mimeType = resolveMimeType\(downloaded\.type, bytes\);/);
    expect(functionSource).not.toMatch(/const mimeType = downloaded\.type;/);
  });

  it("checks the PDF magic-byte signature (%PDF-) rather than trusting a declared application/pdf", () => {
    expect(functionSource).toMatch(/bytesHex\(5\) === "255044462d"/);
  });

  it("checks PNG/JPEG/TIFF magic-byte signatures", () => {
    expect(functionSource).toMatch(/bytesHex\(4\) === "89504e47"/); // PNG
    expect(functionSource).toMatch(/bytesHex\(3\) === "ffd8ff"/); // JPEG
    expect(functionSource).toMatch(/bytesHex\(4\) === "49492a00" \|\| bytesHex\(4\) === "4d4d002a"/); // TIFF
  });

  it("rejects a declared type that does not match the sniffed family (spoofing rejection)", () => {
    expect(functionSource).toMatch(/return declaredType === sniffed \? sniffed : null;/);
    expect(functionSource).toMatch(/return ZIP_FAMILY_MIME_TYPES\.has\(declaredType\) \? declaredType : null;/);
  });

  it("returns a hard failure response when MIME resolution fails, distinct from an unsupported-but-verifiable type", () => {
    expect(functionSource).toMatch(/if \(!mimeType\) \{\s*\n\s*return jsonResponse\(\{ error: "The file's content does not match a supported, verifiable document type\." \}, 400\);/);
  });

  it("checks the OLE Compound File signature (legacy .doc/.xls) as its own top-level branch inside sniffMimeType, before the text/null-byte fallback", () => {
    const fnBody = functionSource.match(/function sniffMimeType\(bytes\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const oleIndex = fnBody.indexOf('bytesHex(8) === "d0cf11e0a1b11ae1"');
    const textFallbackIndex = fnBody.indexOf("isPlausibleText");
    expect(oleIndex).toBeGreaterThan(-1);
    expect(textFallbackIndex).toBeGreaterThan(-1);
    expect(oleIndex).toBeLessThan(textFallbackIndex);
  });

  it("resolveMimeType checks the ole-compound-file family against the legacy Office allowlist, not nested inside the text-family branch", () => {
    expect(functionSource).toMatch(/if \(sniffed === "ole-compound-file"\) \{\s*\n\s*return LEGACY_OFFICE_MIME_TYPES\.has\(declaredType\) \? declaredType : null;/);
  });

  // Real byte-level proof (not source-text regex matching alone) that a
  // valid .doc/.xls is accepted, a PDF-declared-as-OLE and an OLE-declared-
  // as-PDF are both rejected, and random binary bytes are rejected — see
  // src/features/portal-admin/mimeSniffing.js (a pure mirror of this
  // function's logic) and tests/mimeSniffing.test.js.
});

describe("promote-goal-evidence function: public upload never overwrites silently, and the DB transaction uses the user's own JWT", () => {
  it("uploads with upsert: false", () => {
    expect(functionSource).toMatch(/upsert: false/);
  });

  it("uses the service-role client only for the public-bucket upload, never for the completion RPC", () => {
    expect(functionSource).toMatch(/serviceClient\.storage\s*\n\s*\.from\(PUBLIC_BUCKET\)\s*\n\s*\.upload/);
    expect(functionSource).not.toMatch(/serviceClient\.rpc\(/);
  });

  it("calls the renamed rrg_add_goal_resource RPC with the caller's own forwarded-JWT client, including mark_complete", () => {
    expect(functionSource).toMatch(/userClient\.rpc\("rrg_add_goal_resource"/);
    expect(functionSource).toMatch(/p_mark_complete: markComplete === true,/);
    expect(functionSource).not.toMatch(/rrg_complete_goal_with_evidence/);
  });
});

describe("promote-goal-evidence function: honest, logged cleanup on partial failure", () => {
  it("attempts to delete the orphaned public object on a failed DB transaction", () => {
    expect(functionSource).toMatch(/serviceClient\.storage\.from\(PUBLIC_BUCKET\)\.remove\(\[finalPath\]\)/);
  });

  it("does not claim the object becomes unreachable — only that it is undiscoverable through the app", () => {
    expect(functionSource).toMatch(/directly fetchable by anyone who knows/);
    expect(functionSource).not.toMatch(/is unreachable/);
  });

  it("logs a cleanup failure via the audit RPC when the cleanup delete itself fails", () => {
    expect(functionSource).toMatch(/userClient\.rpc\("rrg_log_goal_evidence_cleanup_failure"/);
  });

  it("never exposes the raw storage path in the HTTP response when cleanup fails (it is legitimately included in the audit log for admin remediation)", () => {
    const responseBlock = functionSource.match(
      /return jsonResponse\(\{\s*\n\s*error: "The document could not be completed[\s\S]*?\}, 500\);/,
    )?.[0] ?? "";
    expect(responseBlock.length).toBeGreaterThan(0);
    expect(responseBlock).not.toMatch(/finalPath/);
  });
});
