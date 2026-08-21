// Classifies a Supabase RPC error so the UI can show an honest, specific
// state instead of a generic "could not be loaded" message or a silently
// empty table. PostgREST reports an unknown/unapplied function as PGRST202
// ("Could not find the function ... in the schema cache").
export function classifyRpcError(error) {
  if (!error) return null;

  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();

  if (code === "PGRST202" || message.includes("schema cache") || message.includes("could not find the function")) {
    return "missing-migration";
  }
  if (code === "42501" || message.includes("not authorized")) {
    return "not-authorized";
  }
  if (code === "PGRST301" || message.includes("jwt") || message.includes("authentication required")) {
    return "authentication-required";
  }
  return "network";
}

export const RPC_ERROR_MESSAGES = {
  "missing-migration": "The required backend migration for this feature has not been installed yet. Contact an administrator.",
  "not-authorized": "You are not authorized to view this.",
  "authentication-required": "Your session has expired. Please sign in again.",
  "network": "This could not be loaded right now.",
};
