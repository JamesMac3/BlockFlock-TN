import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import functionSource from "../../../supabase/functions/admin-account-action/index.ts?raw";

/**
 * Static assertions against the not-yet-deployed admin-account-action Edge
 * Function's actual source text — the closest available proof of its
 * behavior since there is no live Supabase/Deno runtime in this
 * environment.
 */

describe("admin-account-action function: service-role key handling", () => {
  it("never hardcodes a service-role key literal", () => {
    expect(functionSource).not.toMatch(/service_role.{0,20}=.{0,5}["'][A-Za-z0-9._-]{20,}["']/);
    expect(functionSource).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/); // no literal JWT-shaped secret
  });

  it("reads the service-role key only from the server-side environment", () => {
    expect(functionSource).toMatch(/Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  });

  it("uses the service-role client only for the Auth Admin API, never for a database RPC", () => {
    expect(functionSource).toMatch(/serviceClient\.auth\.admin\.updateUserById/);
    expect(functionSource).not.toMatch(/serviceClient\.rpc\(/);
  });

  it("calls the DB status RPC with the caller's own forwarded JWT (userClient), not the service client", () => {
    const occurrences = [...functionSource.matchAll(/userClient\.rpc\("rrg_admin_set_account_status"/g)].length;
    expect(occurrences).toBe(2);
  });
});

describe("admin-account-action function: fail-closed suspend/restore ordering", () => {
  it("suspend: flips the database status before attempting the Auth ban", () => {
    const suspendBlockStart = functionSource.indexOf('if (action === "suspend")');
    const restoreCommentStart = functionSource.indexOf("// restore:");
    const suspendBlock = functionSource.slice(suspendBlockStart, restoreCommentStart);
    const dbCallIndex = suspendBlock.indexOf('userClient.rpc("rrg_admin_set_account_status"');
    const banCallIndex = suspendBlock.indexOf("serviceClient.auth.admin.updateUserById");
    expect(dbCallIndex).toBeGreaterThanOrEqual(0);
    expect(banCallIndex).toBeGreaterThan(dbCallIndex);
  });

  it("suspend: a failed Auth ban does not undo the database suspension, and is reported as retryable", () => {
    const suspendBlockStart = functionSource.indexOf('if (action === "suspend")');
    const restoreCommentStart = functionSource.indexOf("// restore:");
    const suspendBlock = functionSource.slice(suspendBlockStart, restoreCommentStart);
    expect(suspendBlock).not.toMatch(/rrg_admin_set_account_status[\s\S]*?p_status:\s*"active"/);
    expect(suspendBlock).toMatch(/retryable: Boolean\(banError\)/);
  });

  it("restore: clears the Auth ban before restoring the database status", () => {
    const restoreCommentIndex = functionSource.indexOf("// restore:");
    const restoreBlock = functionSource.slice(restoreCommentIndex);
    const unbanIndex = restoreBlock.indexOf('ban_duration: "none"');
    const dbRestoreIndex = restoreBlock.indexOf('p_status: "active"');
    expect(unbanIndex).toBeGreaterThanOrEqual(0);
    expect(dbRestoreIndex).toBeGreaterThan(unbanIndex);
  });

  it("restore: a failed unban never proceeds to restore the database status", () => {
    const restoreCommentIndex = functionSource.indexOf("// restore:");
    const restoreBlock = functionSource.slice(restoreCommentIndex);
    const unbanErrorCheckIndex = restoreBlock.indexOf("if (unbanError)");
    const returnBeforeDbRestore = restoreBlock.slice(unbanErrorCheckIndex, restoreBlock.indexOf('p_status: "active"'));
    expect(returnBeforeDbRestore).toMatch(/return jsonResponse/);
  });

  it("restore: a failed database restore after a successful unban is reported as a safe, retryable partial failure", () => {
    expect(functionSource).toMatch(/dbUpdated: false,\s*\n\s*authBanned: false,\s*\n\s*error: dbError\.message,\s*\n\s*retryable: true,/);
  });
});

describe("admin-account-action function: authentication and CORS", () => {
  it("requires an Authorization header and forwards it to the user client", () => {
    expect(functionSource).toMatch(/req\.headers\.get\("Authorization"\)/);
    expect(functionSource).toMatch(/Authorization: authorization/);
  });

  it("verifies the caller before doing anything else", () => {
    expect(functionSource).toMatch(/userClient\.auth\.getUser\(\)/);
  });

  it("accepts only the four supported account actions", () => {
    expect(functionSource).toContain('["suspend", "restore", "invite", "send_setup_link"]');
  });

  it("handles CORS preflight", () => {
    expect(functionSource).toMatch(/req\.method === "OPTIONS"/);
  });
});

describe("admin-account-action function: invitations", () => {
  it("derives the login identity from an authenticated database RPC, not caller input", () => {
    expect(functionSource).toMatch(/rrg_admin_get_chapter_invite_context/);
    expect(functionSource).toMatch(/login_email: loginEmail/);
    expect(functionSource).not.toMatch(/body\.login_email/);
  });

  it("registers the portal account with the caller JWT and cleans up Auth on failure", () => {
    expect(functionSource).toMatch(/userClient\.rpc\("rrg_admin_register_chapter_account"/);
    expect(functionSource).toMatch(/serviceClient\.auth\.admin\.deleteUser\(newUserId\)/);
  });

  it("uses hashed one-time tokens in application setup links", () => {
    expect(functionSource).toMatch(/properties\?\.hashed_token/);
    expect(functionSource).toMatch(/portal\/set-password\?token_hash=/);
    expect(functionSource).not.toMatch(/actionLink:\s*data\.properties\.action_link/);
  });

  it("never logs forwarding addresses or setup links", () => {
    expect(functionSource).not.toMatch(/console\.(log|error|warn)/);
  });

  it("does not send setup email while the new account is suspended", () => {
    const suspendedStart = functionSource.indexOf('if (initialState === "suspended")');
    const emailConfigStart = functionSource.indexOf('if (!resendApiKey)', suspendedStart);
    const suspendedBlock = functionSource.slice(suspendedStart, emailConfigStart);
    expect(suspendedBlock).toMatch(/invitationSent: false/);
  });
});
