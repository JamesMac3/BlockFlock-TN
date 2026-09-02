// Flock Block Tennessee - chapter account administration.
// Database writes use the acting administrator's JWT. The service-role client
// is reserved for the Auth Admin API. Private forwarding addresses and setup
// links never appear in logs or successful responses.

import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const INDEFINITE_BAN_DURATION = "876000h";
const ACCOUNT_STATES = new Set(["trusted", "restricted", "suspended"]);
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

async function sendSetupEmail({ resendApiKey, from, to, countyName, loginEmail, actionLink }: {
  resendApiKey: string; from: string; to: string; countyName: string;
  loginEmail: string; actionLink: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Set up your ${countyName} FLOCKBLOCK account`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827;max-width:620px;margin:auto">
          <h1 style="font-size:24px">Set up your FLOCKBLOCK chapter account</h1>
          <p>You have been invited to manage the <strong>${escapeHtml(countyName)}</strong> chapter.</p>
          <p>Your login is <strong>${escapeHtml(loginEmail)}</strong>. Use the secure link below to choose your password.</p>
          <p><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:12px 18px;background:#d82d2d;color:#fff;text-decoration:none;font-weight:700">Choose password</a></p>
          <p>If you were not expecting this invitation, contact admin@flockblocktn.org.</p>
        </div>`,
    }),
  });
  if (!response.ok) throw new Error(`Email provider rejected the setup message (${response.status}).`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return jsonResponse({ error: "Authentication required." }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid request body." }, 400); }
  const action = String(body?.action ?? "");
  if (!["suspend", "restore", "invite", "send_setup_link"].includes(action)) {
    return jsonResponse({ error: "Unsupported account action." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const siteUrl = (Deno.env.get("SITE_URL") ?? "https://flockblocktn.org").replace(/\/$/, "");
  const accountEmailFrom = Deno.env.get("ACCOUNT_EMAIL_FROM")
    ?? "Flock Block Tennessee <accounts@auth.flockblocktn.org>";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration error." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: authUser, error: authUserError } = await userClient.auth.getUser();
  if (authUserError || !authUser?.user) return jsonResponse({ error: "Authentication required." }, 401);

  if (action === "invite") {
    const countyId = Number(body.county_id);
    const forwardingEmail = String(body.forwarding_email ?? "").trim().toLowerCase();
    const initialState = String(body.initial_state ?? "restricted");
    if (!Number.isSafeInteger(countyId) || countyId <= 0) return jsonResponse({ error: "A county is required." }, 400);
    if (forwardingEmail.length > 320 || !EMAIL_PATTERN.test(forwardingEmail)) {
      return jsonResponse({ error: "A valid forwarding email is required." }, 400);
    }
    if (!ACCOUNT_STATES.has(initialState)) return jsonResponse({ error: "Unsupported initial account state." }, 400);

    const { data: contexts, error: contextError } = await userClient.rpc(
      "rrg_admin_get_chapter_invite_context", { p_county_id: countyId },
    );
    if (contextError || !contexts?.[0]) return jsonResponse({ error: contextError?.message ?? "County not found." }, 403);
    const { county_name: countyName, login_email: loginEmail } = contexts[0];

    let newUserId: string;
    let actionLink = "";
    if (initialState === "suspended") {
      const { data, error } = await serviceClient.auth.admin.createUser({ email: loginEmail, email_confirm: true });
      if (error || !data.user) return jsonResponse({ error: error?.message ?? "The login account could not be created." }, 409);
      newUserId = data.user.id;
    } else {
      const { data, error } = await serviceClient.auth.admin.generateLink({
        type: "invite", email: loginEmail, options: { redirectTo: `${siteUrl}/#/portal/set-password` },
      });
      if (error || !data.user || !data.properties?.hashed_token) {
        return jsonResponse({ error: error?.message ?? "The setup link could not be created." }, 409);
      }
      newUserId = data.user.id;
      actionLink = `${siteUrl}/#/portal/set-password?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=invite`;
    }

    const { error: registerError } = await userClient.rpc("rrg_admin_register_chapter_account", {
      p_user_id: newUserId, p_county_id: countyId,
      p_forwarding_email: forwardingEmail, p_initial_state: initialState,
    });
    if (registerError) {
      await serviceClient.auth.admin.deleteUser(newUserId);
      return jsonResponse({ error: registerError.message }, 403);
    }

    if (initialState === "suspended") {
      const { error: banError } = await serviceClient.auth.admin.updateUserById(newUserId, {
        ban_duration: INDEFINITE_BAN_DURATION,
      });
      return jsonResponse({
        accountCreated: true, invitationSent: false, authBanned: !banError,
        retryable: Boolean(banError),
        error: banError ? "The portal is blocked, but the login ban needs to be retried." : null,
      });
    }

    if (!resendApiKey) return jsonResponse({
      accountCreated: true, invitationSent: false, retryable: true,
      error: "Email delivery is not configured. Use Send setup link after it is restored.",
    }, 502);
    try {
      await sendSetupEmail({ resendApiKey, from: accountEmailFrom, to: forwardingEmail, countyName, loginEmail, actionLink });
      return jsonResponse({ accountCreated: true, invitationSent: true, retryable: false });
    } catch (error) {
      return jsonResponse({
        accountCreated: true, invitationSent: false, retryable: true,
        error: error instanceof Error ? error.message : "The setup email could not be sent.",
      }, 502);
    }
  }

  const targetUserId = String(body.user_id ?? "");
  if (!targetUserId) return jsonResponse({ error: "user_id is required." }, 400);

  if (action === "send_setup_link") {
    if (!resendApiKey) return jsonResponse({ error: "Email delivery is not configured." }, 500);
    const { data: contexts, error: contextError } = await userClient.rpc(
      "rrg_admin_get_chapter_setup_context", { p_user_id: targetUserId },
    );
    if (contextError || !contexts?.[0]) {
      return jsonResponse({ error: contextError?.message ?? "Chapter account not found." }, 403);
    }
    const context = contexts[0];
    if (context.account_status === "suspended") {
      return jsonResponse({ error: "Restore this account before sending a setup link." }, 409);
    }
    const { data, error } = await serviceClient.auth.admin.generateLink({
      type: "recovery", email: context.login_email,
      options: { redirectTo: `${siteUrl}/#/portal/set-password` },
    });
    if (error || !data.properties?.hashed_token) {
      return jsonResponse({ error: error?.message ?? "The setup link could not be created." }, 409);
    }
    try {
      await sendSetupEmail({
        resendApiKey, from: accountEmailFrom, to: context.forwarding_email,
        countyName: context.county_name, loginEmail: context.login_email,
        actionLink: `${siteUrl}/#/portal/set-password?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`,
      });
      return jsonResponse({ invitationSent: true, retryable: false });
    } catch (error) {
      return jsonResponse({
        invitationSent: false, retryable: true,
        error: error instanceof Error ? error.message : "The setup email could not be sent.",
      }, 502);
    }
  }

  if (action === "suspend") {
    const { error: dbError } = await userClient.rpc("rrg_admin_set_account_status", {
      p_user_id: targetUserId, p_status: "suspended",
    });
    if (dbError) return jsonResponse({ dbUpdated: false, authBanned: false, error: dbError.message }, 403);
    const { error: banError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: INDEFINITE_BAN_DURATION,
    });
    return jsonResponse({
      dbUpdated: true, authBanned: !banError, error: banError ? banError.message : null,
      retryable: Boolean(banError),
    });
  }

  // restore: clear the Auth ban first; only then restore database access.
  const { error: unbanError } = await serviceClient.auth.admin.updateUserById(targetUserId, { ban_duration: "none" });
  if (unbanError) return jsonResponse({
    dbUpdated: false, authBanned: true, error: unbanError.message, retryable: true,
  }, 502);
  const { error: dbError } = await userClient.rpc("rrg_admin_set_account_status", {
    p_user_id: targetUserId, p_status: "active",
  });
  if (dbError) return jsonResponse({
    dbUpdated: false,
    authBanned: false,
    error: dbError.message,
    retryable: true,
  }, 403);
  return jsonResponse({ dbUpdated: true, authBanned: false, error: null });
});
