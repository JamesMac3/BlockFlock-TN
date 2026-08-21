// Flock Block Tennessee — admin-account-action
//
// Suspends or restores a chapter-master portal account. Postgres cannot
// call the Supabase Auth Admin API itself, so this Edge Function is the
// only place that both flips portal_accounts.status (via a SECURITY
// DEFINER RPC, using the acting admin's own forwarded JWT — never the
// service-role key — so auth.uid() in the resulting audit row is the real
// admin) and bans/unbans the Auth account (service-role key, used only for
// this one Admin API call, never sent to the frontend).
//
// Fail-closed ordering (matching rrg_admin_set_account_status's own
// safeguards):
//   - suspend: the database status flips to 'suspended' first and does not
//     depend on the Auth ban succeeding — every protected RLS/RPC path
//     already requires status = 'active', so the account is meaningfully
//     locked out the instant the DB write commits. If the Auth ban call
//     then fails, that is reported as a retryable partial failure, not
//     rolled back and not silently swallowed.
//   - restore: the Auth ban is cleared FIRST. Only if that succeeds does
//     this function flip the database status back to 'active' — so the UI
//     can never report an account as "active" while it is still banned at
//     the Auth layer. If the unban call fails, the database is left
//     suspended (fail closed) and the caller is told to retry.
//
// The frontend must call only this function for suspend/restore — never
// rrg_admin_set_account_status directly — because only this function can
// also apply/clear the Auth ban.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INDEFINITE_BAN_DURATION = "876000h"; // ~100 years; Supabase has no literal "forever".

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
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

  const { action, user_id: targetUserId } = body ?? {};
  if (action !== "suspend" && action !== "restore") {
    return jsonResponse({ error: "action must be 'suspend' or 'restore'." }, 400);
  }
  if (typeof targetUserId !== "string" || targetUserId.length === 0) {
    return jsonResponse({ error: "user_id is required." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration error." }, 500);
  }

  // Forwards the caller's own JWT so auth.uid() inside the RPC resolves to
  // the real acting admin — never the service-role identity.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: authUser, error: authUserError } = await userClient.auth.getUser();
  if (authUserError || !authUser?.user) {
    return jsonResponse({ error: "Authentication required." }, 401);
  }

  // Service-role client — used ONLY for the Auth Admin API ban/unban call
  // below. Never used for the DB status flip and never exposed to the
  // frontend; SUPABASE_SERVICE_ROLE_KEY only ever exists in this
  // server-side function's environment.
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  if (action === "suspend") {
    const { error: dbError } = await userClient.rpc("rrg_admin_set_account_status", {
      p_user_id: targetUserId,
      p_status: "suspended",
    });
    if (dbError) {
      return jsonResponse({ dbUpdated: false, authBanned: false, error: dbError.message }, 403);
    }

    const { error: banError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: INDEFINITE_BAN_DURATION,
    });

    return jsonResponse({
      dbUpdated: true,
      authBanned: !banError,
      error: banError ? banError.message : null,
      retryable: Boolean(banError),
    });
  }

  // restore: clear the Auth ban first; only then restore the DB status, so
  // the UI never reports "active" while the account is still banned.
  const { error: unbanError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
    ban_duration: "none",
  });

  if (unbanError) {
    return jsonResponse({
      dbUpdated: false,
      authBanned: true,
      error: unbanError.message,
      retryable: true,
    }, 502);
  }

  const { error: dbError } = await userClient.rpc("rrg_admin_set_account_status", {
    p_user_id: targetUserId,
    p_status: "active",
  });

  if (dbError) {
    // Auth is already unbanned, but the database is still suspended — a
    // safe fail-closed state (every protected path requires status =
    // 'active'), reported so the admin can retry the database half.
    return jsonResponse({
      dbUpdated: false,
      authBanned: false,
      error: dbError.message,
      retryable: true,
    }, 403);
  }

  return jsonResponse({ dbUpdated: true, authBanned: false, error: null });
});
