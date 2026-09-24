import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";

// Generic, reusable counterpart to rpcErrors.js for supabase.functions.invoke(...)
// errors specifically. `supabase.rpc(...)` and `supabase.functions.invoke(...)`
// surface failures through entirely different shapes (a PostgREST error object
// vs. one of these three FunctionsError subclasses), so this stays a
// separate module rather than folding into rpcErrors.js.
//
// The confirmed production bug this exists to fix: a FunctionsHttpError's
// own `.message` is ALWAYS the literal string "Edge Function returned a
// non-2xx status code" (see @supabase/functions-js's FunctionsHttpError
// constructor — it never reads the response body). The function's actual
// JSON error body only lives on `.context`, which for both
// FunctionsHttpError and FunctionsRelayError is the raw fetch Response —
// this is the SDK's own documented pattern (see FunctionsClient.js's
// invoke() doc comment: `await error.context.json()`), not an assumption.

const GENERIC_MESSAGE = "This could not be completed right now. Please try again.";
const NETWORK_MESSAGE = "A network error occurred while contacting the server. Check your connection and try again.";

/**
 * Safely extracts a user-facing message (and a `retryable` hint, when the
 * function's own JSON body included one) from whatever
 * `const { error } = await supabase.functions.invoke(...)` returned.
 * Never throws — a malformed, non-JSON, or unexpectedly-shaped body
 * degrades to a safe generic message instead of surfacing raw HTML, a
 * parser exception, or internal details.
 *
 * `retryable` defaults to true (the generic/unknown-error case is treated
 * as retryable, matching how a transient failure should be presented)
 * except when the body explicitly says `retryable: false` — callers that
 * care about that distinction should read it from the return value rather
 * than assuming every failure can be retried.
 */
export async function extractFunctionInvokeError(error) {
  if (!error) {
    return { message: GENERIC_MESSAGE, retryable: true, known: false };
  }

  if (error instanceof FunctionsHttpError || error instanceof FunctionsRelayError) {
    const response = error.context;
    if (response && typeof response.clone === "function") {
      try {
        const body = await response.clone().json();
        if (body && typeof body.error === "string" && body.error.trim().length > 0) {
          return { message: body.error, retryable: body.retryable !== false, known: true };
        }
      } catch {
        // Non-JSON or malformed body (e.g. a raw gateway HTML error page,
        // or a truncated response) — fall through to the generic message
        // rather than surfacing a parser error or raw markup.
      }
    }
    return { message: GENERIC_MESSAGE, retryable: true, known: false };
  }

  if (error instanceof FunctionsFetchError) {
    // No HTTP response ever arrived (DNS failure, timeout, CORS-blocked
    // preflight, offline) — there is no JSON body to read.
    return { message: NETWORK_MESSAGE, retryable: true, known: false };
  }

  // An error shape this module doesn't specifically recognize (e.g. some
  // future SDK version, or a caller that passed something unexpected) —
  // still degrade safely rather than throwing.
  return { message: GENERIC_MESSAGE, retryable: true, known: false };
}
