import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchUpcomingMeetings, formatMeetingRow } from "../features/portal-admin/nextMeeting";
import { useMeetingCountdown } from "../features/portal-admin/useMeetingCountdown";
import "./NextMeetingBanner.css";

const MEETING_LIMIT = 3;
const PERIODIC_REFRESH_MS = 60_000;

// Renders nothing when there are no upcoming meetings — no banner, no
// placeholder, no "no meetings scheduled" text. countyId may be
// null/undefined for the statewide homepage (every county's scheduled
// meetings, pinned or not); a specific county gets that county's meetings
// plus every statewide-pinned meeting — see rrg_get_upcoming_meetings and
// fetchUpcomingMeetings (nextMeeting.js), which already sorts strictly by
// starts_at ascending, dedupes by id, and excludes
// cancelled/expired/already-started meetings server-side.
export default function NextMeetingBanner({ countyId, className = "" }) {
  const [meetings, setMeetings] = useState([]);
  // "Latest request wins" — load() is called from several independent
  // triggers (mount/county change, any row's countdown reaching zero, the
  // tab becoming visible again, and the periodic refresh below), so a
  // slower, older in-flight request must never overwrite a newer result.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = (requestIdRef.current += 1);
    const rows = await fetchUpcomingMeetings(supabase, countyId ?? null, MEETING_LIMIT);
    if (requestIdRef.current === requestId) setMeetings(rows);
  }, [countyId]);

  useEffect(() => {
    load();
  }, [load]);

  // Refetches whenever the tab regains focus, so a meeting cancelled,
  // rescheduled, or newly added while the visitor was away is reflected
  // without waiting for a countdown to reach zero.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [load]);

  // Refetches periodically while the page stays open — independent of any
  // one row's countdown reaching zero, since a newly scheduled meeting
  // could enter the top three (or an existing one drop out) without any
  // currently-shown countdown ever hitting zero.
  useEffect(() => {
    const interval = setInterval(load, PERIODIC_REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  if (meetings.length === 0) return null;

  return (
    <aside className={`next-meeting-banner ${className}`.trim()} aria-label="Upcoming meetings">
      <span className="next-meeting-banner__label">Upcoming meetings</span>
      {meetings.map((meeting) => (
        <MeetingRow key={meeting.id} meeting={meeting} onReachedStart={load} />
      ))}
    </aside>
  );
}

function MeetingRow({ meeting, onReachedStart }) {
  // Refetches the whole list once this specific meeting's start time
  // arrives — it should no longer occupy one of the top three slots,
  // cancelled/rescheduled or not.
  const countdown = useMeetingCountdown(meeting.starts_at, onReachedStart);
  const row = formatMeetingRow(meeting);
  if (!row) return null;

  return (
    <div className="next-meeting-banner__row">
      <strong className="next-meeting-banner__title">{row.title}</strong>
      {row.cityCountyText && <span className="next-meeting-banner__place">{row.cityCountyText}</span>}
      <span className="next-meeting-banner__when">{row.dateText} · {row.timeText}</span>
      {row.locationText && <span className="next-meeting-banner__where">{row.locationText}</span>}
      {/* No aria-live here on purpose — a per-second update must never be
          announced to screen readers every tick. */}
      {countdown && <span className="next-meeting-banner__countdown">{countdown}</span>}

      {row.comment && (
        <div className="next-meeting-banner__comment">
          {row.comment.speakingLimit && (
            <span className="next-meeting-banner__comment-item">{row.comment.speakingLimit}</span>
          )}
          {row.comment.signupInstructions && (
            <span className="next-meeting-banner__comment-item">{row.comment.signupInstructions}</span>
          )}
          {/* Its own labeled line, deliberately separate from the
              meeting-start countdown above — a signup deadline is not the
              same thing as the meeting starting. */}
          {row.comment.signupDeadlineText && (
            <span className="next-meeting-banner__comment-deadline">
              Sign-up closes {row.comment.signupDeadlineText}
            </span>
          )}
          {row.comment.sourceUrl && (
            <a
              className="next-meeting-banner__comment-link"
              href={row.comment.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Official source
            </a>
          )}
        </div>
      )}
    </div>
  );
}
