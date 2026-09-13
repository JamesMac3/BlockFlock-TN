-- Applied 20260913051334. Includes backfill of the existing Nashville row.
-- Adds what the "Upcoming meetings" banner (three meetings, not one) and
-- its public-comment display need, neither of which the existing schema
-- (20260821225913_meetings_schema_and_selection.sql) supports:
--
-- 1. public.meetings gains four nullable, purely descriptive columns for
--    speaking restrictions, signup instructions, a signup deadline (kept
--    as its own timestamptz, deliberately separate from starts_at so the
--    frontend never conflates a signup-closes countdown with a
--    meeting-starts countdown), and an official source URL. All four are
--    optional — a meeting with none of them set simply has no
--    public-comment panel rendered; nothing here labels or infers
--    public-comment eligibility from a meeting's title, and a meeting
--    whose comment period is restricted to specific agenda items (a
--    zoning hearing, for example) is not assumed to allow general
--    surveillance-related comment merely because it is public.
--
-- 2. rrg_get_upcoming_meetings(p_county_id, p_limit) — a new public
--    (anon+authenticated) read RPC returning up to p_limit (default 3)
--    scheduled, not-yet-started meetings ordered strictly by starts_at
--    ascending (pinning a meeting statewide must never reorder it ahead
--    of an earlier one). p_county_id null (the statewide homepage) returns
--    scheduled meetings from every county, pinned or not; a non-null
--    p_county_id returns that county's meetings plus every
--    statewide-pinned meeting. Deduplication by id is structurally
--    guaranteed rather than needing a runtime DISTINCT: the table's own
--    check constraint already forces every pinned row's county_id to be
--    null, so a single row can never simultaneously match both the
--    p_county_id branch and the is_pinned_statewide branch of the same
--    WHERE clause. The existing single-result
--    rrg_get_next_meeting_for_county is left completely unchanged and
--    unremoved — TennesseeCountyMap.jsx's per-county meeting panel still
--    uses it; only the "Upcoming meetings" banner
--    (NextMeetingBanner.jsx) is switched to this new RPC.

do $$
begin
  if to_regclass('public.meetings') is null then
    raise exception 'This migration requires public.meetings (20260821225913_meetings_schema_and_selection.sql).';
  end if;
end
$$;

alter table public.meetings
  add column if not exists comment_speaking_limit text
    check (comment_speaking_limit is null or char_length(trim(comment_speaking_limit)) between 1 and 300),
  add column if not exists comment_signup_instructions text
    check (comment_signup_instructions is null or char_length(trim(comment_signup_instructions)) between 1 and 1000),
  add column if not exists comment_signup_deadline timestamptz,
  add column if not exists comment_source_url text
    check (comment_source_url is null or (char_length(comment_source_url) <= 2048 and comment_source_url ~ '^https://'));

comment on column public.meetings.comment_speaking_limit is
  'Optional, e.g. "Up to 2 minutes; agenda speakers prioritized." Descriptive only — never implies every meeting has an open comment period.';
comment on column public.meetings.comment_signup_instructions is
  'Optional, e.g. "In-person signup 5-6 PM; Tennessee residency proof required." Kept separate from comment_signup_deadline so instructions text and the deadline instant can each be shown/omitted independently.';
comment on column public.meetings.comment_signup_deadline is
  'Optional. Deliberately a distinct column from starts_at — the frontend must render this as its own labeled item, never merged into the meeting-start countdown.';
comment on column public.meetings.comment_source_url is
  'Optional official source (e.g. a city''s published public-comment-period policy page). HTTPS only.';

create or replace function public.rrg_get_upcoming_meetings(
  p_county_id bigint default null,
  p_limit integer default 3
)
returns table (
  id uuid, title text, county_id bigint, county_name text, starts_at timestamptz,
  timezone text, location_name text, street_address text, city text, state text,
  postal_code text, is_pinned_statewide boolean,
  comment_speaking_limit text, comment_signup_instructions text,
  comment_signup_deadline timestamptz, comment_source_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.title, m.county_id, c.name, m.starts_at, m.timezone,
    m.location_name, m.street_address, m.city, m.state, m.postal_code, m.is_pinned_statewide,
    m.comment_speaking_limit, m.comment_signup_instructions,
    m.comment_signup_deadline, m.comment_source_url
  from public.meetings m
  left join public.counties c on c.id = m.county_id
  where m.status = 'scheduled'
    and m.starts_at > now()
    and (p_county_id is null or m.county_id = p_county_id or m.is_pinned_statewide)
  order by m.starts_at asc, m.id asc
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
$$;

revoke all on function public.rrg_get_upcoming_meetings(bigint, integer) from public;
grant execute on function public.rrg_get_upcoming_meetings(bigint, integer) to anon, authenticated;


-- Explicitly public read-only projection: base meetings table remains inaccessible to anon.
update public.meetings set
comment_speaking_limit='Up to 2 minutes per speaker; 20 minutes total. Agenda speakers prioritized.',
comment_signup_instructions='Sign up in person between 5 and 6 PM Central outside the David Scobey Council Chamber. Bring proof of Tennessee residency. General comments are permitted; meeting starts at 6:30 PM.',
comment_signup_deadline=timestamptz '2026-09-15 18:00:00-05',
comment_source_url='https://www.nashville.gov/departments/council/public-comment-period'
where county_id=(select id from public.counties where name='Davidson County')
and starts_at=timestamptz '2026-09-15 18:30:00-05'
and title='Nashville Metro Council public comments (sign up 5-6 PM)';
