import { useEffect, useRef, useState } from "react";
import { computeCountdownParts, formatCountdown } from "./meetingCountdown.js";

/**
 * Ticks a live "19d 4h 12m 08s" countdown to `startsAtIso`, recomputed every
 * second and immediately whenever the tab becomes visible again — always
 * from Date.now() vs. the stored instant (see meetingCountdown.js), never a
 * locally decremented counter, so a throttled background-tab timer can
 * never leave the display stale or wrong; the very next tick (or the
 * visibility recompute) always self-corrects.
 *
 * Calls `onReachedStart` exactly once, the instant the countdown reaches
 * zero, so the caller can refresh which meeting is actually next — a
 * cancelled or rescheduled meeting is never left ticking toward a start
 * that will not happen. `onReachedStart` is read from a ref rather than
 * being an effect dependency, so passing a fresh inline function each
 * render never resets the running interval.
 *
 * Returns null for a missing/unparseable date (nothing to render) or the
 * "Scheduled start reached" string once started — never a negative or
 * NaN-laden countdown.
 */
export function useMeetingCountdown(startsAtIso, onReachedStart) {
  const [label, setLabel] = useState(() => formatCountdown(startsAtIso));
  const onReachedStartRef = useRef(onReachedStart);

  useEffect(() => {
    onReachedStartRef.current = onReachedStart;
  }, [onReachedStart]);

  useEffect(() => {
    if (!startsAtIso) {
      // Deferred, like every setState-in-effect elsewhere in this codebase
      // (see e.g. CountyStatisticsPanel.jsx) — avoids a synchronous
      // render-triggering setState directly inside the effect body.
      const timer = setTimeout(() => setLabel(null), 0);
      return () => clearTimeout(timer);
    }

    let firedReachedStart = false;

    function tick() {
      const parts = computeCountdownParts(startsAtIso);
      setLabel(formatCountdown(startsAtIso));
      if (parts.status === "started" && !firedReachedStart) {
        firedReachedStart = true;
        onReachedStartRef.current?.();
      }
    }

    const initialTick = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") tick();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(initialTick);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [startsAtIso]);

  return label;
}
