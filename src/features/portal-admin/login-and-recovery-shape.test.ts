import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import portalLoginSource from "../../components/PortalLogin.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import setPasswordSource from "../../pages/PortalSetPasswordPage.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import chapterMasterTableSource from "../../components/admin/ChapterMasterManagementTable.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import chapterAccountSettingsSource from "../../components/portal/ChapterAccountSettings.jsx?raw";

/**
 * This project has no React render harness, so these are source-shape
 * assertions proving the chapter login/password work is wired the way its
 * pure logic (loginErrorDiagnostics.test.js) assumes: PortalLogin uses the
 * shared classifier rather than a bespoke one, the forgot-password
 * guidance only ever points at the existing admin-triggered flow (never a
 * self-service reset endpoint), the recovery page reaches a real success
 * state before returning to login, and the admin "send password reset
 * link" relabel preserves the untouched send_setup_link backend contract.
 */

describe("PortalLogin: diagnostics and forgot-password guidance", () => {
  it("classifies a sign-in failure with the shared diagnostics module instead of a bespoke check", () => {
    expect(portalLoginSource).toMatch(/import \{ describeSignInError, GENERIC_CREDENTIALS_MESSAGE \} from "\.\.\/features\/portal-admin\/loginErrorDiagnostics";/);
    expect(portalLoginSource).toMatch(/setErrorMessage\(describeSignInError\(error\)\);/);
  });

  it("passes the real signInWithPassword error into failLogin for classification, not just a bare retry", () => {
    expect(portalLoginSource).toMatch(/await failLogin\(authError\);/);
  });

  it("a failed profile resolution after a successful sign-in still falls back to the generic credentials message (no auth error to classify)", () => {
    const failedBranch = portalLoginSource.match(/if \(destination === "failed"\) \{[\s\S]*?\}/)?.[0] ?? "";
    expect(failedBranch).toMatch(/await failLogin\(\);/);
  });

  it("shows forgot-password guidance that only points at the existing admin-triggered flow, never a self-service reset form or endpoint", () => {
    expect(portalLoginSource).toMatch(/Forgot your password\? An administrator can send you a password\s*\n\s*reset link\./);
    expect(portalLoginSource).toMatch(/href="mailto:admin@flockblocktn\.org"/);
    // No form field, RPC, or fetch call anywhere in this file talks to a
    // password-reset endpoint directly — the only avenue is the mailto.
    expect(portalLoginSource).not.toMatch(/resetPasswordForEmail/);
    expect(portalLoginSource).not.toMatch(/send_setup_link/);
  });
});

describe("PortalSetPasswordPage: token handling, success state, and safe logging", () => {
  it("verifies token_hash + type (invite or recovery) before showing the password form", () => {
    expect(setPasswordSource).toMatch(/const tokenHash = searchParams\.get\("token_hash"\);/);
    expect(setPasswordSource).toMatch(/type !== "invite" && type !== "recovery"/);
    expect(setPasswordSource).toMatch(/supabase\.auth\.verifyOtp\(\{ token_hash: tokenHash, type \}\)/);
  });

  it("shows a generic invalid/expired message for a bad or already-used link, without echoing the verification error", () => {
    expect(setPasswordSource).toMatch(/This setup link is invalid or has expired\. Ask an administrator to send a new one\./);
  });

  it("validates password length and requires the confirmation to match before submitting", () => {
    expect(setPasswordSource).toMatch(/password\.length < 8 \|\| password\.length > MAX_PASSWORD_LENGTH/);
    expect(setPasswordSource).toMatch(/password !== confirmation/);
  });

  it("reaches a real success state (not an instant, unannounced redirect) after saving the password", () => {
    expect(setPasswordSource).toMatch(/setVerificationState\("success"\);/);
    expect(setPasswordSource).toMatch(/verificationState === "success"/);
    expect(setPasswordSource).toMatch(/Password saved\./);
  });

  it("the success state still offers a manual way back to login, not only a timed auto-redirect", () => {
    const successBlock = setPasswordSource.match(/\{verificationState === "success" && \([\s\S]*?<\/div>\s*\)\}/)?.[0] ?? "";
    expect(successBlock).toMatch(/onClick=\{\(\) => navigate\("\/portal\/login", \{ replace: true \}\)\}/);
    expect(successBlock).toMatch(/Continue to sign in/);
  });

  it("the auto-redirect timer is cleaned up on unmount/state change", () => {
    const effectBlock = setPasswordSource.match(/useEffect\(\(\) => \{\s*\n\s*if \(verificationState !== "success"\)[\s\S]*?\}, \[verificationState, navigate\]\);/)?.[0] ?? "";
    expect(effectBlock).toMatch(/clearTimeout\(timer\)/);
  });

  it("global sign-out follows a successful password save, ending every other session (a credential-rotation event) — communicated to the user, not silent", () => {
    const submitBlock = setPasswordSource.match(/async function handleSubmit\(event\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(submitBlock).toMatch(/supabase\.auth\.signOut\(\{ scope: "global" \}\);/);
    expect(setPasswordSource).toMatch(/every other device signed in to this account has been signed out/);
  });

  it("never logs the token, the password, or the verification/update error", () => {
    expect(setPasswordSource).not.toMatch(/console\./);
  });
});

describe("ChapterMasterManagementTable: relabeled admin action, unchanged backend contract", () => {
  it("still invokes send_setup_link with the same payload shape — the backend contract is untouched", () => {
    expect(chapterMasterTableSource).toMatch(/invokeAccountAction\("send_setup_link", \{ user_id: row\.user_id \}\)/);
  });

  it("labels the button \"Send password reset link\" and explains delivery goes to the saved forwarding address", () => {
    expect(chapterMasterTableSource).toMatch(/Send password reset link/);
    expect(chapterMasterTableSource).toMatch(/emails a password reset link to this chapter's saved forwarding address/i);
    expect(chapterMasterTableSource).not.toMatch(/>Send setup link</);
  });
});

describe("ChapterAccountSettings: password change is the first, most prominent section", () => {
  it("renders the Change password section before Forwarding destination email", () => {
    const passwordIndex = chapterAccountSettingsSource.indexOf("<h3>Change password</h3>");
    const forwardingIndex = chapterAccountSettingsSource.indexOf("<h3>Forwarding destination email</h3>");
    expect(passwordIndex).toBeGreaterThan(-1);
    expect(forwardingIndex).toBeGreaterThan(-1);
    expect(passwordIndex).toBeLessThan(forwardingIndex);
  });

  it("gives the password section a distinct, visually emphasized class and a stable id", () => {
    expect(chapterAccountSettingsSource).toMatch(/className="chapter-account-settings__section chapter-account-settings__section--password" id="change-password"/);
  });

  it("still reauthenticates with the current password before calling updateUser, unchanged", () => {
    expect(chapterAccountSettingsSource).toMatch(/supabase\.auth\.signInWithPassword\(\{/);
    expect(chapterAccountSettingsSource).toMatch(/supabase\.auth\.updateUser\(\{ password: newPassword \}\)/);
  });
});
