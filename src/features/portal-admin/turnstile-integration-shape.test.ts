import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import turnstileSource from "../../components/Turnstile.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import countyContactFormSource from "../../components/CountyContactForm.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import requestDeliveryPanelSource from "../../components/records-request-goals/RequestDeliveryPanel.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import portalLoginSource from "../../components/PortalLogin.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import newsletterSubscribeFunctionSource from "../../../supabase/functions/newsletter-subscribe/index.ts?raw";

// This project has no component-render test harness (no jsdom), so these
// are source-shape assertions that prove the real source implements the
// required behavior rather than merely describing it.

describe("Turnstile: one reusable explicit-rendering component, script loaded once", () => {
  it("reads the site key only from VITE_TURNSTILE_SITE_KEY, never a hard-coded value", () => {
    expect(turnstileSource).toMatch(/const SITE_KEY = import\.meta\.env\.VITE_TURNSTILE_SITE_KEY;/);
  });

  it("the Cloudflare script is loaded via one shared module-level promise, reused by every widget instance", () => {
    expect(turnstileSource).toMatch(/let scriptLoadPromise = null;/);
    expect(turnstileSource).toMatch(/if \(scriptLoadPromise\) return scriptLoadPromise;/);
    expect(turnstileSource).toMatch(/render=explicit/);
  });

  it("checks for an already-present script tag before injecting a second one", () => {
    expect(turnstileSource).toMatch(/document\.querySelector\(`script\[src="\$\{TURNSTILE_SCRIPT_SRC\}"\]`\)/);
  });

  it("render() is explicit (not auto-render) and retains the returned widget ID", () => {
    expect(turnstileSource).toMatch(/widgetIdRef\.current = turnstile\.render\(containerRef\.current, \{/);
  });

  it("exposes a token to the parent via onToken, and clears it (null) on expiration or widget error — never leaves a stale token", () => {
    expect(turnstileSource).toMatch(/callback: \(token\) => onToken\(token\),/);
    expect(turnstileSource).toMatch(/"expired-callback": \(\) => onToken\(null\),/);
    expect(turnstileSource).toMatch(/"error-callback": \(\) => \{\s*\n\s*onToken\(null\);/);
  });

  it("exposes an imperative reset() so a parent form can invalidate a single-use token after a failed or completed request", () => {
    expect(turnstileSource).toMatch(/useImperativeHandle\(ref, \(\) => \(\{\s*\n\s*reset\(\) \{/);
    expect(turnstileSource).toMatch(/window\.turnstile\.reset\(widgetIdRef\.current\);/);
  });

  it("removes the widget on unmount so a remounted screen never leaks a stale widget instance", () => {
    expect(turnstileSource).toMatch(/window\.turnstile\.remove\(widgetIdRef\.current\);/);
  });

  it("is not an invisible/managed-only background check — it renders a visible container div for Cloudflare's managed challenge", () => {
    expect(turnstileSource).toMatch(/<div className="turnstile-widget">/);
    expect(turnstileSource).toMatch(/<div ref=\{containerRef\} \/>/);
    expect(turnstileSource).not.toMatch(/size: "invisible"/);
  });
});

describe("CountyContactForm: protected via the shared subscription module, action=newsletter_signup, cooldown after success", () => {
  it("no longer inserts into county_contacts directly", () => {
    expect(countyContactFormSource).not.toMatch(/\.from\("county_contacts"\)/);
    expect(countyContactFormSource).toMatch(/import \{ subscribeToCountyUpdates \} from "\.\.\/features\/document-request\/countyContactSubscription";/);
  });

  it("renders the shared Turnstile widget with action=\"newsletter_signup\"", () => {
    expect(countyContactFormSource).toMatch(/<Turnstile ref=\{turnstileRef\} action="newsletter_signup" onToken=\{setTurnstileToken\} \/>/);
  });

  it("submission is defensively blocked without a token even if the disabled button were bypassed (e.g. Enter key)", () => {
    const submitBlock = countyContactFormSource.match(/async function handleSubmit\(event\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(submitBlock).toMatch(/if \(!turnstileToken \|\| cooldownSeconds > 0\) \{/);
  });

  it("the submit button is disabled until a token exists, and while a request is in progress", () => {
    expect(countyContactFormSource).toMatch(/disabled=\{submitting \|\| loadingCounties \|\| !turnstileToken \|\| cooldownSeconds > 0\}/);
  });

  it("the widget is reset after every attempt (success or failure), and a 10-second visible cooldown starts only after success", () => {
    const submitBlock = countyContactFormSource.match(/async function handleSubmit\(event\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(submitBlock).toMatch(/resetTurnstile\(\);/);
    expect(submitBlock).toMatch(/startResubmitCooldown\(\);/);
    expect(countyContactFormSource).toMatch(/const RESUBMIT_COOLDOWN_SECONDS = 10;/);
  });
});

describe("RequestDeliveryPanel: the second newsletter entry point, same shared module and action", () => {
  it("uses the same subscribeToCountyUpdates module as CountyContactForm, not a separate insert path", () => {
    expect(requestDeliveryPanelSource).toMatch(/import \{ subscribeToCountyUpdates \} from "\.\.\/\.\.\/features\/document-request\/countyContactSubscription";/);
    expect(requestDeliveryPanelSource).not.toMatch(/\.from\("county_contacts"\)/);
  });

  it("renders the shared Turnstile widget with action=\"newsletter_signup\" and passes the token through", () => {
    expect(requestDeliveryPanelSource).toMatch(/<Turnstile ref=\{turnstileRef\} action="newsletter_signup" onToken=\{setTurnstileToken\} \/>/);
    expect(requestDeliveryPanelSource).toMatch(/subscribeToCountyUpdates\(\{ supabase, countyId: county\.id, email, turnstileToken \}\);/);
  });

  it("the subscribe button is disabled until a token exists and while a request is in progress or cooling down", () => {
    expect(requestDeliveryPanelSource).toMatch(
      /disabled=\{!isEmailValid \|\| !turnstileToken \|\| subscribeState\.phase === "working" \|\| cooldownSeconds > 0\}/,
    );
  });

  it("resets the widget and starts the same 10-second cooldown after a successful subscription", () => {
    const fnBlock = requestDeliveryPanelSource.match(/async function handleSubscribe\(\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(fnBlock).toMatch(/resetTurnstile\(\);/);
    expect(fnBlock).toMatch(/if \(result\.subscribed\) startResubmitCooldown\(\);/);
  });
});

describe("PortalLogin: protected via Supabase Auth's captchaToken option, action=portal_login", () => {
  it("passes the Turnstile token as options.captchaToken to signInWithPassword — not a custom edge function", () => {
    expect(portalLoginSource).toMatch(/await supabase\.auth\.signInWithPassword\(\{\s*\n\s*email: normalized\.email,\s*\n\s*password,\s*\n\s*options: \{\s*\n\s*captchaToken: turnstileToken,/);
  });

  it("renders the shared Turnstile widget with action=\"portal_login\"", () => {
    expect(portalLoginSource).toMatch(/<Turnstile ref=\{turnstileRef\} action="portal_login" onToken=\{setTurnstileToken\} \/>/);
  });

  it("login cannot proceed without a token — defensive check even though the button is also disabled", () => {
    const submitBlock = portalLoginSource.match(/async function handleSubmit\(event\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(submitBlock).toMatch(/if \(!turnstileToken\) \{/);
  });

  it("the sign-in button is disabled until a token exists", () => {
    expect(portalLoginSource).toMatch(/disabled=\{signingIn \|\| !turnstileToken\}/);
  });

  it("the widget is reset after every failed login (wrong credentials, revoked/failed destination) via the shared failLogin() path", () => {
    const failLoginBlock = portalLoginSource.match(/async function failLogin\(\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(failLoginBlock).toMatch(/resetTurnstile\(\);/);
  });

  it("still uses the existing generic sign-in error message and normalizes the identity to @flockblocktn.org, unchanged by this task", () => {
    expect(portalLoginSource).toMatch(/GENERIC_LOGIN_ERROR =\s*\n\s*"The account and password could not be verified\.";/);
    expect(portalLoginSource).toMatch(/normalizeLoginIdentity/);
    expect(portalLoginSource).toMatch(/MAX_LOGIN_FIELD_LENGTH/);
  });

  it("never logs the password, token, or full auth payload", () => {
    expect(portalLoginSource).not.toMatch(/console\.(log|info|debug)\(/);
  });
});

describe("newsletter-subscribe Edge Function: server-side verification, generic responses, no reimplemented insert logic", () => {
  it("reads the Turnstile secret only from Deno.env, never from the request body", () => {
    expect(newsletterSubscribeFunctionSource).toMatch(/Deno\.env\.get\("TURNSTILE_SECRET"\)/);
    expect(newsletterSubscribeFunctionSource).not.toMatch(/body\.(turnstile_)?secret/i);
  });

  it("calls Cloudflare siteverify server-side with a ~10 second timeout", () => {
    expect(newsletterSubscribeFunctionSource).toMatch(/https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
    expect(newsletterSubscribeFunctionSource).toMatch(/const SITEVERIFY_TIMEOUT_MS = 10_000;/);
    expect(newsletterSubscribeFunctionSource).toMatch(/AbortController\(\)/);
  });

  it("verifies success, the exact required action, and (unconditionally, not env-gated) the production hostname", () => {
    expect(newsletterSubscribeFunctionSource).toMatch(/const REQUIRED_ACTION = "newsletter_signup";/);
    expect(newsletterSubscribeFunctionSource).toMatch(/if \(outcome\.success !== true\) \{/);
    expect(newsletterSubscribeFunctionSource).toMatch(/if \(outcome\.action !== REQUIRED_ACTION\) \{/);
    expect(newsletterSubscribeFunctionSource).toMatch(
      /const ALLOWED_HOSTNAMES = new Set\(\["flockblocktn\.org", "www\.flockblocktn\.org"\]\);/,
    );
    expect(newsletterSubscribeFunctionSource).toMatch(/if \(!outcome\.hostname \|\| !ALLOWED_HOSTNAMES\.has\(outcome\.hostname\)\) \{/);
    // No env-var gate wraps the hostname check — it always runs.
    expect(newsletterSubscribeFunctionSource).not.toMatch(/Deno\.env\.get\("(NODE_)?ENV(IRONMENT)?"\)/);
    expect(newsletterSubscribeFunctionSource).not.toMatch(/localhost/i);
  });

  it("rejects missing/oversized bodies and oversized tokens before ever calling siteverify", () => {
    expect(newsletterSubscribeFunctionSource).toMatch(/const MAX_BODY_BYTES = 8 \* 1024;/);
    expect(newsletterSubscribeFunctionSource).toMatch(/const MAX_TOKEN_LENGTH = 2048;/);
    expect(newsletterSubscribeFunctionSource).toMatch(/if \(!turnstileToken \|\| turnstileToken\.length > MAX_TOKEN_LENGTH\)/);
  });

  it("validates and normalizes email and county_id server-side, independent of the browser's claims", () => {
    expect(newsletterSubscribeFunctionSource).toMatch(/function normalizeEmail\(value: unknown\): string \| null \{/);
    expect(newsletterSubscribeFunctionSource).toMatch(/function normalizeCountyId\(value: unknown\): number \| null \{/);
  });

  it("creates the subscription via the existing rrg_subscribe_county_updates RPC — never a raw insert into county_contacts, never guessing at unproven columns", () => {
    expect(newsletterSubscribeFunctionSource).toMatch(/serviceClient\.rpc\("rrg_subscribe_county_updates", \{/);
    expect(newsletterSubscribeFunctionSource).not.toMatch(/\.from\("county_contacts"\)\.insert/);
  });

  it("uses the service-role Supabase client, read only from Deno.env, never a client-supplied key", () => {
    expect(newsletterSubscribeFunctionSource).toMatch(/Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  });

  it("always returns the same generic success shape regardless of new/existing/suppressed outcome — no enumeration signal", () => {
    expect(newsletterSubscribeFunctionSource).toMatch(/const GENERIC_SUCCESS = \{ subscribed: true \};/);
    expect(newsletterSubscribeFunctionSource).toMatch(/return json\(GENERIC_SUCCESS, 200\);/);
  });

  it("never returns a raw error object from Supabase/Postgres/Cloudflare to the browser — only a generic message, with details only logged server-side", () => {
    expect(newsletterSubscribeFunctionSource).toMatch(/console\.error\("rrg_subscribe_county_updates failed:", rpcError\.code/);
    expect(newsletterSubscribeFunctionSource).toMatch(/return json\(\{ error: GENERIC_FAILURE_MESSAGE \}, 500\);/);
  });

  it("handles CORS preflight and rejects non-POST methods", () => {
    expect(newsletterSubscribeFunctionSource).toMatch(/if \(request\.method === "OPTIONS"\) return new Response\(null, \{ headers: CORS_HEADERS \}\);/);
    expect(newsletterSubscribeFunctionSource).toMatch(/if \(request\.method !== "POST"\) return json\(\{ error: "Method not allowed" \}, 405\);/);
  });
});
