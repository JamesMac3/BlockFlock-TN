/**
 * Pure helpers for the "Clone Template to County" workflow
 * (rrg_clone_template_to_county). Nothing here touches Supabase, React, or
 * the DOM, so the response contract and error mapping can be proven
 * without rendering anything — see RecordsRequestGoalsManager's
 * TemplateCloneForm for the only caller.
 */

/**
 * The RPC returns exactly one JSON object — never an array, a bare
 * integer, or a complete goal row. goal_id/county_id/template_id are
 * Postgres bigint columns, which supabase-js can hand back as either a JS
 * number or a numeric string depending on size; normalizeCloneId below is
 * the single place that reconciles that, matching how this component
 * already treats county/template/goal IDs elsewhere (parseInt'd <select>
 * values compared with ===).
 */
export type CloneTemplateResult = {
  created: boolean;
  goalId: number;
  countyId: number;
  templateId: number;
};

export type CloneOutcome = { result: CloneTemplateResult; error?: undefined } | { result?: undefined; error: string };

const SAFE_POSITIVE_INTEGER_STRING = /^[1-9]\d*$/;

/**
 * Normalizes one bigint-shaped RPC field into a JS number. Returns null
 * instead of throwing so the caller can decide how to report a malformed
 * response rather than crashing the render.
 */
export function normalizeCloneId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return SAFE_POSITIVE_INTEGER_STRING.test(trimmed) ? Number(trimmed) : null;
  }
  return null;
}

/**
 * Validates and normalizes the raw RPC payload into a CloneTemplateResult.
 * Returns null for anything that is not the single JSON object the backend
 * contract promises — an array, a bare integer, a full goal row, or a
 * response missing or mistyping one of the four required fields. Callers
 * must never assume `data[0]` or call `.single()` upstream; this is the
 * one place that decides whether a response is trustworthy.
 */
export function parseCloneTemplateResult(data: unknown): CloneTemplateResult | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const record = data as Record<string, unknown>;
  if (typeof record.created !== "boolean") return null;

  const goalId = normalizeCloneId(record.goal_id);
  const countyId = normalizeCloneId(record.county_id);
  const templateId = normalizeCloneId(record.template_id);
  if (goalId === null || countyId === null || templateId === null) return null;

  return { created: record.created, goalId, countyId, templateId };
}

/**
 * Maps a Supabase error from rrg_clone_template_to_county to a specific,
 * user-facing message covering every documented code. Falls through to a
 * network-aware, then fully generic, message for anything else so an
 * unexpected failure still reports something actionable.
 */
export function describeCloneTemplateError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "The template could not be cloned. Please try again.";
  }

  const code = (error as { code?: unknown }).code;
  switch (code) {
    case "22023":
      return "A target county and a template must both be selected.";
    case "P0002":
      return "The selected county could not be found, or the template is missing or inactive.";
    case "42501":
      return "You are not authorized to clone this template to the selected county.";
    case "28000":
      return "Your session has expired. Please sign in again.";
    case "40001":
      return "The underlying data changed while cloning. Please try again.";
    default:
      break;
  }

  const rawMessage = (error as { message?: unknown }).message;
  const message = typeof rawMessage === "string" ? rawMessage : "";
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("failed to fetch") || lowerMessage.includes("network")) {
    return "A network error occurred while cloning. Check your connection and try again.";
  }

  return message || "The template could not be cloned. Please try again.";
}

/** Success copy for the two documented outcomes. */
export function formatCloneResultMessage(result: CloneTemplateResult, countyName: string): string {
  return result.created
    ? `Goal added to ${countyName}.`
    : `This template already exists in ${countyName}.`;
}

/**
 * Minimal shape of the Supabase client this module needs — just enough to
 * call .rpc(), so a plain mock object (no real supabase-js import) is
 * enough to unit test cloneTemplateToCounty below.
 */
export type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/**
 * The single call site for rrg_clone_template_to_county. Always sends
 * exactly p_county_id and p_template_id (both required bigint IDs) and
 * always checks `error` before touching `data`. Never uses `.single()` or
 * `data[0]` — the RPC returns one JSON object directly.
 */
export async function cloneTemplateToCounty(
  client: RpcClient,
  params: { countyId: number; templateId: number }
): Promise<CloneOutcome> {
  const { data, error } = await client.rpc("rrg_clone_template_to_county", {
    p_county_id: params.countyId,
    p_template_id: params.templateId,
  });

  if (error) {
    return { error: describeCloneTemplateError(error) };
  }

  const result = parseCloneTemplateResult(data);
  if (!result) {
    return {
      error:
        "The clone request completed, but the response was not in the expected format. Check County Goals before retrying.",
    };
  }

  return { result };
}
