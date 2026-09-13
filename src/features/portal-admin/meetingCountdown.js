// Pure countdown math, deliberately separated from any timer/DOM concerns
// (see useMeetingCountdown.js for those) so it can be unit-tested directly
// with an injected `nowMs` rather than mocking the system clock or waiting
// on real timers.
//
// The countdown always counts down to a fixed UTC instant (the meeting's
// stored starts_at, a timestamptz) — a pure millisecond difference between
// two Date.now()-style instants. That arithmetic is entirely unaffected by
// daylight-saving transitions: a spring-forward/fall-back boundary changes
// how a wall-clock instant is *displayed* in America/Chicago (already
// handled correctly by chicagoTime.js's Intl-based formatters, which this
// module does not duplicate), never how many real milliseconds separate
// two fixed instants. No DST-specific branch is needed here, or correct,
// for that reason.

export function computeCountdownParts(startsAtIso, nowMs = Date.now()) {
  if (!startsAtIso) return { status: "invalid" };
  const startMs = new Date(startsAtIso).getTime();
  if (!Number.isFinite(startMs)) return { status: "invalid" };

  const remainingMs = startMs - nowMs;
  // Never negative — reaching or passing the start time is its own
  // terminal state, not a countdown value.
  if (remainingMs <= 0) return { status: "started" };

  const totalSeconds = Math.floor(remainingMs / 1000);
  return {
    status: "upcoming",
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/**
 * "19d 4h 12m 08s" for an upcoming meeting, "Scheduled start reached" once
 * the start time arrives (never a negative countdown), or null for a
 * missing/unparseable date — callers should render nothing in that case
 * rather than "NaNd NaNh...".
 */
export function formatCountdown(startsAtIso, nowMs = Date.now()) {
  const parts = computeCountdownParts(startsAtIso, nowMs);
  if (parts.status === "invalid") return null;
  if (parts.status === "started") return "Scheduled start reached";
  const seconds = String(parts.seconds).padStart(2, "0");
  return `${parts.days}d ${parts.hours}h ${parts.minutes}m ${seconds}s`;
}
