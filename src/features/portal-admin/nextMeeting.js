import { formatChicagoDate, formatChicagoDateTime, formatChicagoTime } from "./chicagoTime.js";

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

// Backs the "Upcoming meetings" banner (NextMeetingBanner.jsx), which
// shows up to three meetings instead of one. rrg_get_upcoming_meetings
// already excludes cancelled/expired/started meetings and orders strictly
// by starts_at ascending server-side — a pinned statewide meeting is never
// reordered ahead of an earlier one. p_county_id null (the statewide
// homepage) returns every county's scheduled meetings; a specific county
// returns that county's meetings plus every statewide-pinned meeting.
export async function fetchUpcomingMeetings(supabase, countyId, limit = 3) {
  const { data, error } = await supabase.rpc("rrg_get_upcoming_meetings", {
    p_county_id: countyId ?? null,
    p_limit: limit,
  });
  if (error) {
    console.error("Failed to load upcoming meetings:", error);
    return [];
  }
  return sortMeetingsByStartsAt(dedupeMeetingsById(Array.isArray(data) ? data : []));
}

// Defense in depth, not the primary guarantee — a pinned statewide meeting
// can never share an id with a county meeting (the table's own check
// constraint forces a pinned row's county_id to null, so the RPC's own
// WHERE clause can't match the same row twice), but a duplicate here is
// cheap to guard against and easy to unit-test without a live database.
export function dedupeMeetingsById(meetings) {
  const seen = new Set();
  const result = [];
  for (const meeting of meetings ?? []) {
    if (!meeting?.id || seen.has(meeting.id)) continue;
    seen.add(meeting.id);
    result.push(meeting);
  }
  return result;
}

// Also defense in depth — the RPC already orders by starts_at ascending —
// kept as its own pure, independently testable step so "pinning never
// reorders ahead of an earlier meeting" is provable without a live RPC.
export function sortMeetingsByStartsAt(meetings) {
  return [...(meetings ?? [])].sort((a, b) => {
    const diff = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    return diff !== 0 ? diff : String(a.id).localeCompare(String(b.id));
  });
}

/**
 * One row's display data for the "Upcoming meetings" banner. The
 * public-comment fields (comment_speaking_limit, comment_signup_instructions,
 * comment_signup_deadline, comment_source_url) are all optional columns on
 * public.meetings — `comment` is null whenever none of them are set, so a
 * meeting is never shown with a fabricated or inferred public-comment
 * panel. comment_signup_deadline is formatted and exposed completely
 * separately from the meeting's own starts_at/countdown, so a caller can
 * never accidentally conflate a signup deadline with the meeting-start
 * countdown.
 */
export function formatMeetingRow(meeting) {
  if (!meeting) return null;
  const venueParts = [meeting.location_name, meeting.street_address].filter(Boolean);
  const cityCountyText = meeting.is_pinned_statewide
    ? "Statewide"
    : [meeting.city, meeting.county_name].filter(Boolean).join(", ");
  const hasCommentInfo = Boolean(
    meeting.comment_speaking_limit
    || meeting.comment_signup_instructions
    || meeting.comment_signup_deadline
    || meeting.comment_source_url
  );
  return {
    id: meeting.id,
    title: meeting.title,
    startsAt: meeting.starts_at,
    cityCountyText,
    dateText: formatChicagoDate(meeting.starts_at),
    timeText: formatChicagoTime(meeting.starts_at),
    locationText: venueParts.join(", "),
    isPinnedStatewide: Boolean(meeting.is_pinned_statewide),
    comment: hasCommentInfo
      ? {
          speakingLimit: meeting.comment_speaking_limit ?? null,
          signupInstructions: meeting.comment_signup_instructions ?? null,
          signupDeadlineText: meeting.comment_signup_deadline
            ? formatChicagoDateTime(meeting.comment_signup_deadline)
            : null,
          sourceUrl: meeting.comment_source_url ?? null,
        }
      : null,
  };
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
