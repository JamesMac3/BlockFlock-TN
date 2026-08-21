import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchNextMeeting, formatMeetingBanner } from "../features/portal-admin/nextMeeting";
import "./NextMeetingBanner.css";

// Renders nothing — no banner, no placeholder, no "no meeting scheduled"
// text — when rrg_get_next_meeting_for_county returns no row. countyId may
// be null/undefined to request the statewide-pinned-only fallback path
// (used by the homepage banner, which has no selected county).
export default function NextMeetingBanner({ countyId, className = "" }) {
  const [meeting, setMeeting] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const row = await fetchNextMeeting(supabase, countyId ?? null);
      if (active) setMeeting(row);
    }
    load();
    return () => { active = false; };
  }, [countyId]);

  const banner = formatMeetingBanner(meeting);
  if (!banner) return null;

  return (
    <aside className={`next-meeting-banner ${className}`.trim()} aria-label="Upcoming meeting">
      <span className="next-meeting-banner__label">
        {banner.isPinnedStatewide ? "Next statewide meeting" : "Next meeting"}
      </span>
      <strong className="next-meeting-banner__title">{banner.title}</strong>
      <span className="next-meeting-banner__when">{banner.dateTimeText}</span>
      {banner.locationText && <span className="next-meeting-banner__where">{banner.locationText}</span>}
    </aside>
  );
}
