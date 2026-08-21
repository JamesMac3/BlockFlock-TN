import { formatChicagoDateTime } from "./chicagoTime.js";

// Single shared entry point for every public "next meeting" surface
// (homepage banner, county status-page banner, county map meeting text) —
// all of them must apply the exact same precedence (county-specific over
// the statewide pinned fallback) and the exact same "render nothing when
// there is no meeting" rule, so that behavior lives here once rather than
// being reimplemented per surface.
export async function fetchNextMeeting(supabase, countyId) {
  const { data, error } = await supabase.rpc("rrg_get_next_meeting_for_county", {
    p_county_id: countyId ?? null,
  });
  if (error) {
    console.error("Failed to load next meeting:", error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export function formatMeetingBanner(meeting) {
  if (!meeting) return null;
  const locationParts = [meeting.location_name, meeting.street_address, meeting.city, meeting.state]
    .filter(Boolean);
  return {
    title: meeting.title,
    dateTimeText: formatChicagoDateTime(meeting.starts_at),
    locationText: locationParts.join(", "),
    isPinnedStatewide: Boolean(meeting.is_pinned_statewide),
    countyName: meeting.county_name ?? null,
  };
}
