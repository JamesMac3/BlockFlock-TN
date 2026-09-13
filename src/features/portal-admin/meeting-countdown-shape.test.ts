import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import hookSource from "./useMeetingCountdown.js?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import bannerSource from "../../components/NextMeetingBanner.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import countyMapSource from "../../components/jurisdiction-map/TennesseeCountyMap.jsx?raw";

/**
 * This project has no React render harness, so these are source-shape
 * assertions proving the countdown hook is wired the way the pure logic in
 * meetingCountdown.test.js assumes it is used: ticking every second,
 * recomputing immediately on tab-visibility-regained, firing
 * onReachedStart exactly once, cleaning up both the interval and the
 * visibilitychange listener, and never wrapping the ticking text in an
 * aria-live region. The countdown math itself (boundaries, negative-time
 * guard, invalid dates, DST) is executed for real in
 * tests/meetingCountdown.test.js.
 */

describe("useMeetingCountdown: ticking, visibility recompute, and cleanup", () => {
  it("recomputes every second via setInterval(tick, 1000)", () => {
    expect(hookSource).toMatch(/setInterval\(tick, 1000\)/);
  });

  it("recomputes immediately when the tab becomes visible again", () => {
    expect(hookSource).toMatch(/document\.visibilityState === "visible"\) tick\(\)/);
    expect(hookSource).toMatch(/addEventListener\("visibilitychange", handleVisibilityChange\)/);
  });

  it("cleans up the interval and the visibilitychange listener on unmount/dependency change", () => {
    const effectBlock = hookSource.match(/useEffect\(\(\) => \{\s*\n\s*if \(!startsAtIso\)[\s\S]*?\}, \[startsAtIso\]\);/)?.[0] ?? "";
    expect(effectBlock).toMatch(/clearInterval\(interval\)/);
    expect(effectBlock).toMatch(/removeEventListener\("visibilitychange", handleVisibilityChange\)/);
  });

  it("fires onReachedStart at most once per startsAtIso via a local guard flag", () => {
    expect(hookSource).toMatch(/let firedReachedStart = false;/);
    expect(hookSource).toMatch(/if \(parts\.status === "started" && !firedReachedStart\) \{/);
    expect(hookSource).toMatch(/firedReachedStart = true;/);
  });

  it("reads onReachedStart from a ref, not an effect dependency, so a fresh inline callback never resets the interval", () => {
    expect(hookSource).toMatch(/onReachedStartRef\.current = onReachedStart;/);
    expect(hookSource).toMatch(/onReachedStartRef\.current\?\.\(\);/);
    // The ticking effect's own dependency array must be [startsAtIso] only.
    expect(hookSource).toMatch(/\}, \[startsAtIso\]\);/);
  });

  it("degrades to no countdown (null) for a missing startsAtIso, without throwing", () => {
    expect(hookSource).toMatch(/if \(!startsAtIso\) \{/);
    expect(hookSource).toMatch(/setLabel\(null\)/);
  });
});

describe("TennesseeCountyMap: single-meeting countdown wiring, never announced every tick", () => {
  it("uses useMeetingCountdown and refreshes the meeting on visibility regained", () => {
    expect(countyMapSource).toMatch(/useMeetingCountdown\(meeting\?\.starts_at, load\)/);
    expect(countyMapSource).toMatch(/document\.visibilityState === "visible"\) load\(\)/);
  });

  it("never wraps the countdown in an aria-live region", () => {
    const countdownLine = countyMapSource.split("\n").find((line) => line.includes("countdown") && line.includes("{"));
    expect(countdownLine).toBeTruthy();
    expect(countdownLine).not.toMatch(/aria-live/);
  });

  it("guards its meeting-fetch against a slower, older in-flight request overwriting a newer result", () => {
    expect(countyMapSource).toMatch(/requestIdRef\.current/);
  });
});

describe("NextMeetingBanner: three-meeting countdown wiring, never announced every tick", () => {
  it("uses useMeetingCountdown once per row, keyed by that row's own meeting", () => {
    expect(bannerSource).toMatch(/useMeetingCountdown\(meeting\.starts_at, onReachedStart\)/);
    expect(bannerSource).toMatch(/<MeetingRow key=\{meeting\.id\} meeting=\{meeting\} onReachedStart=\{load\} \/>/);
  });

  it("refreshes the meeting list on visibility regained and on a periodic interval while the page stays open", () => {
    expect(bannerSource).toMatch(/document\.visibilityState === "visible"\) load\(\)/);
    expect(bannerSource).toMatch(/setInterval\(load, PERIODIC_REFRESH_MS\)/);
    expect(bannerSource).toMatch(/clearInterval\(interval\)/);
  });

  it("never wraps the countdown in an aria-live region", () => {
    const countdownLine = bannerSource.split("\n").find((line) => line.includes("countdown") && line.includes("{"));
    expect(countdownLine).toBeTruthy();
    expect(countdownLine).not.toMatch(/aria-live/);
  });

  it("guards its meeting-fetch against a slower, older in-flight request overwriting a newer result", () => {
    expect(bannerSource).toMatch(/requestIdRef\.current/);
  });
});
