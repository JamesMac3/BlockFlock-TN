import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

function page(title: string, message: string, status = 200) {
  return new Response(`<!doctype html><html><meta name="viewport" content="width=device-width"><body style="margin:0;background:#071526;color:#f8f4ea;font-family:Arial,sans-serif"><main style="max-width:680px;margin:12vh auto;padding:32px"><h1>${title}</h1><p style="font-size:18px;line-height:1.6">${message}</p><a style="color:#55e1ff" href="https://flockblocktn.org">Return to FLOCKBLOCK</a></main></body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return page("Not available", "This link cannot be used that way.", 405);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return page("Invalid unsubscribe link", "This unsubscribe link is incomplete or invalid.", 400);
  }
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
  const { data, error } = await db.rpc("rrg_unsubscribe_email", { p_token: token });
  if (error) return page("Could not unsubscribe", "Please try again later.", 500);
  return data ? page("You are unsubscribed", "This address will no longer receive FLOCKBLOCK county update emails.") : page("Link not found", "This unsubscribe link is no longer available.", 404);
});
