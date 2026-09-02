import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifySvix(body: string, headers: Headers, secret: string) {
  const id = headers.get("svix-id") ?? "";
  const timestamp = headers.get("svix-timestamp") ?? "";
  const signatures = (headers.get("svix-signature") ?? "").split(" ");
  const timestampNumber = Number(timestamp);
  if (!id || !Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;
  const secretBytes = decodeBase64(secret.replace(/^whsec_/, ""));
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  return signatures.some((entry) => {
    const encoded = entry.startsWith("v1,") ? entry.slice(3) : "";
    if (!encoded) return false;
    try { return constantTimeEqual(expected, decodeBase64(encoded)); } catch { return false; }
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
  const body = await req.text();
  if (!secret || !(await verifySvix(body, req.headers, secret))) return new Response("Invalid signature", { status: 401 });

  let event: Record<string, any>;
  try { event = JSON.parse(body); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const eventId = req.headers.get("svix-id") ?? "";
  const eventType = typeof event.type === "string" ? event.type : "";
  const providerId = typeof event.data?.email_id === "string" ? event.data.email_id : "";
  const recipient = Array.isArray(event.data?.to) ? event.data.to[0] : event.data?.to;
  if (!eventId || !eventType) return new Response("Invalid event", { status: 400 });

  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const { error } = await db.rpc("rrg_process_resend_webhook", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_provider_email_id: providerId || null,
    p_recipient_email: typeof recipient === "string" ? recipient : null,
  });
  if (error) return new Response("Webhook processing failed", { status: 500 });
  return new Response("ok", { status: 200 });
});
