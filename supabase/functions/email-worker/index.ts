import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const JSON_HEADERS = { "Content-Type": "application/json" };
const FROM_UPDATES = "Flock Block Tennessee <updates@updates.flockblocktn.org>";
const FROM_REMINDERS = "Flock Block Tennessee <reminders@updates.flockblocktn.org>";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function paragraphs(value: unknown): string {
  return String(value ?? "")
    .split(/\n{2,}/)
    .map((part) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(part).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function emailShell(title: string, body: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f2efe7;color:#111827;font-family:Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto;padding:32px 20px">
    <div style="background:#071526;color:#fff;padding:22px 28px;font-size:24px;font-weight:800">FLOCKBLOCK</div>
    <div style="background:#fff;padding:30px 28px;border:1px solid #d7dce3">
      <h1 style="margin:0 0 20px;font-size:30px;line-height:1.2">${escapeHtml(title)}</h1>${body}
    </div>
    <div style="padding:18px 28px;color:#596273;font-size:13px;line-height:1.5">${footer}</div>
  </div></body></html>`;
}

async function sendResend(apiKey: string, payload: Record<string, unknown>) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body?.id !== "string") {
    const code = typeof body?.name === "string" ? body.name : `resend_${response.status}`;
    throw new Error(code);
  }
  return body.id as string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const workerSecret = Deno.env.get("EMAIL_WORKER_SECRET") ?? "";
  if (!workerSecret || req.headers.get("x-worker-secret") !== workerSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const siteUrl = (Deno.env.get("SITE_URL") ?? "https://flockblocktn.org").replace(/\/$/, "");
  if (!supabaseUrl || !serviceKey || !resendKey) {
    return new Response(JSON.stringify({ error: "Server email configuration is incomplete." }), { status: 500, headers: JSON_HEADERS });
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const result = { campaigns_sent: 0, campaigns_failed: 0, reminders_sent: 0, reminders_failed: 0 };

  const { data: deliveries, error: deliveryClaimError } = await db.rpc("rrg_claim_email_deliveries", { p_limit: 50 });
  if (deliveryClaimError) return new Response(JSON.stringify({ error: "Could not claim campaign deliveries." }), { status: 500, headers: JSON_HEADERS });

  for (const delivery of deliveries ?? []) {
    try {
      const snapshot = delivery.post_snapshot ?? {};
      const unsubscribeUrl = `${supabaseUrl}/functions/v1/email-unsubscribe?token=${encodeURIComponent(delivery.unsubscribe_token)}`;
      const postUrl = `${siteUrl}/status`;
      const body = `${snapshot.summary ? `<p style="font-size:18px;line-height:1.5;color:#374151">${escapeHtml(snapshot.summary)}</p>` : ""}
        ${paragraphs(snapshot.body)}
        <p style="margin:24px 0 0"><a href="${escapeHtml(postUrl)}" style="display:inline-block;background:#df2f2f;color:#fff;text-decoration:none;padding:12px 18px;font-weight:700">Read on FLOCKBLOCK</a></p>`;
      const html = emailShell(snapshot.title ?? delivery.subject, body,
        `You received this county update because this address subscribed on FLOCKBLOCK. <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a>.`);
      const providerId = await sendResend(resendKey, {
        from: FROM_UPDATES,
        to: [delivery.recipient_email],
        reply_to: delivery.reply_to_email,
        subject: delivery.subject,
        html,
        text: `${snapshot.title ?? delivery.subject}\n\n${snapshot.summary ?? ""}\n\n${snapshot.body ?? ""}\n\nUnsubscribe: ${unsubscribeUrl}`,
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [{ name: "campaign_id", value: String(delivery.campaign_id) }],
      });
      await db.rpc("rrg_record_email_delivery_result", { p_delivery_id: delivery.delivery_id, p_sent: true, p_provider_email_id: providerId });
      result.campaigns_sent++;
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 80) : "send_failed";
      await db.rpc("rrg_record_email_delivery_result", { p_delivery_id: delivery.delivery_id, p_sent: false, p_error_code: code });
      result.campaigns_failed++;
    }
  }

  const { data: reminders, error: reminderClaimError } = await db.rpc("rrg_claim_due_reminders", { p_limit: 50 });
  if (reminderClaimError) return new Response(JSON.stringify({ error: "Could not claim reminders.", ...result }), { status: 500, headers: JSON_HEADERS });

  for (const reminder of reminders ?? []) {
    try {
      const body = `<p style="font-size:18px;line-height:1.6">One week ago, you prepared a public-records request for <strong>${escapeHtml(reminder.goal_title)}</strong>.</p>
        <p style="line-height:1.6">If you received a response, please forward it to <a href="mailto:${escapeHtml(reminder.chapter_contact_email)}">${escapeHtml(reminder.chapter_contact_email)}</a> so your local chapter can review and archive the records.</p>`;
      const html = emailShell("Reminder: send us the records you received", body,
        `This is the one-time reminder you requested while preparing a records request for ${escapeHtml(reminder.county_name)}.`);
      const providerId = await sendResend(resendKey, {
        from: FROM_REMINDERS,
        to: [reminder.recipient_email],
        reply_to: reminder.chapter_contact_email,
        subject: `Reminder: ${reminder.goal_title}`,
        html,
        text: `One week ago, you prepared a public-records request for ${reminder.goal_title}. If you received a response, forward it to ${reminder.chapter_contact_email}.`,
        tags: [{ name: "reminder_id", value: String(reminder.reminder_id) }],
      });
      await db.rpc("rrg_record_reminder_result", { p_reminder_id: reminder.reminder_id, p_sent: true, p_provider_email_id: providerId });
      result.reminders_sent++;
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 80) : "send_failed";
      await db.rpc("rrg_record_reminder_result", { p_reminder_id: reminder.reminder_id, p_sent: false, p_error_code: code });
      result.reminders_failed++;
    }
  }

  return new Response(JSON.stringify(result), { status: 200, headers: JSON_HEADERS });
});
