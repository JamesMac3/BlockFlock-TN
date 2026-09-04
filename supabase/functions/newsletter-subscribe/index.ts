// Flock Block Tennessee - public newsletter/county-contact subscription.
//
// This is the single protected entry point for both public subscription
// UIs (the site-wide CountyContactForm and the records-request delivery
// panel's optional "county updates" field). Neither caller inserts into
// county_contacts directly; both invoke this function, which:
//   1. Verifies the Cloudflare Turnstile token server-side (never trusts
//      the browser's claim that a challenge was solved).
//   2. Validates/normalizes email and county_id server-side.
//   3. Creates the subscription via the existing, already-audited
//      rrg_subscribe_county_updates RPC (granted to anon/authenticated) —
//      this function never reimplements that RPC's insert/conflict logic
//      or guesses at county_contacts' schema.
//   4. Always returns the same generic success shape for a genuinely new
//      subscription, an already-existing one, or a suppressed address, so
//      the response can never be used to enumerate registered emails.
//
// TURNSTILE_SECRET and SUPABASE_SERVICE_ROLE_KEY are read only from
// Deno.env — never accepted from the request body, never logged.

import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BODY_BYTES = 8 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 320;
const MAX_TOKEN_LENGTH = 2048;
const MAX_PHONE_LENGTH = 32;
const REQUIRED_ACTION = "newsletter_signup";
const ALLOWED_HOSTNAMES = new Set(["flockblocktn.org", "www.flockblocktn.org"]);
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 10_000;

// Generic response for every outcome that isn't a hard validation/server
// failure — a brand-new subscription, an already-registered email+county
// pair, and a suppressed address (bounce/complaint/admin block) are all
// indistinguishable to the caller by design.
const GENERIC_SUCCESS = { subscribed: true };
const GENERIC_FAILURE_MESSAGE = "The subscription could not be saved. Please try again later.";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(normalized)) return null;
  return normalized;
}

function normalizeCountyId(value: unknown): number | null {
  const countyId = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(countyId) || countyId <= 0) return null;
  return countyId;
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_PHONE_LENGTH);
}

async function verifyTurnstileToken(token: string, secret: string, remoteIp: string | null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SITEVERIFY_TIMEOUT_MS);
  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (remoteIp) form.set("remoteip", remoteIp);

    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) return { ok: false as const, reason: "siteverify_http_error" };
    const outcome = await response.json();
    return { ok: true as const, outcome };
  } catch (error) {
    console.error("Turnstile siteverify request failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false as const, reason: "siteverify_unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return json({ error: "Request body too large." }, 413);

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request body too large." }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json({ error: "Invalid request body." }, 400);
  }

  const turnstileToken = typeof body.turnstile_token === "string" ? body.turnstile_token : "";
  if (!turnstileToken || turnstileToken.length > MAX_TOKEN_LENGTH) {
    return json({ error: "Verification is required." }, 400);
  }

  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "Enter a valid email address." }, 400);

  const countyId = normalizeCountyId(body.county_id);
  if (!countyId) return json({ error: "A valid county is required." }, 400);

  // phone is optional and not part of the task's core three-field
  // contract, but county_contacts.phone is a proven, already-used column
  // (see the prior direct-insert code in CountyContactForm.jsx) — accepted
  // here, validated and bounded, purely so that existing SMS-alert
  // functionality isn't silently dropped by routing through this endpoint.
  const phone = normalizePhone(body.phone);

  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET");
  if (!turnstileSecret) {
    console.error("TURNSTILE_SECRET is not configured.");
    return json({ error: GENERIC_FAILURE_MESSAGE }, 500);
  }

  const remoteIp = request.headers.get("cf-connecting-ip");
  const verification = await verifyTurnstileToken(turnstileToken, turnstileSecret, remoteIp);
  if (!verification.ok) {
    return json({ error: "Verification could not be completed. Please try again." }, 502);
  }

  const outcome = verification.outcome as {
    success?: boolean;
    action?: string;
    hostname?: string;
    "error-codes"?: string[];
  };

  if (outcome.success !== true) {
    return json({ error: "Verification failed. Please try again." }, 403);
  }
  if (outcome.action !== REQUIRED_ACTION) {
    return json({ error: "Verification failed. Please try again." }, 403);
  }
  // Always enforced, not gated by an environment flag — this endpoint only
  // ever runs as deployed (live) infrastructure, and server-side
  // verification must never be weakened just because a request originated
  // from a development build. Local development uses either a dedicated
  // Cloudflare Turnstile test site key or hostnames already allow-listed
  // for the production widget in the Cloudflare dashboard — never a
  // bypass here.
  if (!outcome.hostname || !ALLOWED_HOSTNAMES.has(outcome.hostname)) {
    return json({ error: "Verification failed. Please try again." }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Server configuration is incomplete (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).");
    return json({ error: GENERIC_FAILURE_MESSAGE }, 500);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data, error: rpcError } = await serviceClient.rpc("rrg_subscribe_county_updates", {
    p_county_id: countyId,
    p_email: email,
  });

  if (rpcError) {
    console.error("rrg_subscribe_county_updates failed:", rpcError.code ?? rpcError.message ?? "unknown error");
    return json({ error: GENERIC_FAILURE_MESSAGE }, 500);
  }

  // Best-effort only: phone is a secondary field, and a failure to attach
  // it must never turn an otherwise-successful subscription into an error
  // response (and must never reveal anything about the row to the client).
  if (phone) {
    const { error: phoneError } = await serviceClient
      .from("county_contacts")
      .update({ phone })
      .eq("county_id", countyId)
      .eq("email", email);
    if (phoneError) {
      console.error("county_contacts phone update failed:", phoneError.code ?? phoneError.message ?? "unknown error");
    }
  }

  void data; // { subscribed: boolean, reason?: 'suppressed' } — intentionally not distinguished in the response.
  return json(GENERIC_SUCCESS, 200);
});
