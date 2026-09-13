-- Reviewed 2026-09-12. Only September 15 has a confirmed actionable agenda.
-- Agenda: https://nashville.legistar.com/MeetingDetail.aspx?ID=1349495&GUID=D2BE5CCA-A4E3-4CCB-9746-8EEEC7B1724B
-- Rules: https://www.nashville.gov/departments/council/public-comment-period
-- General comments allowed; agenda speakers prioritized. TN residency proof required.
-- In-person signup 5-6 PM; meeting 6:30 PM; up to 2 minutes per speaker.
-- October 6, October 20, November 5 held pending agenda verification.
-- Rutherford Planning Commission September 28 and Murfreesboro September 17 excluded:
-- suitable general-comment opportunity not confirmed (Murfreesboro time also uncertain).
-- Live duplicate review found no county 1/20 meetings in the research window.
lock table public.meetings in share row exclusive mode;
do $$
declare
  target_county bigint;
begin
  select id into strict target_county from public.counties where name = 'Davidson County';
  if exists (
    select 1 from public.meetings
    where county_id = target_county
      and (starts_at at time zone 'America/Chicago')::date = date '2026-09-15'
      and (title ilike '%council%' or starts_at = timestamptz '2026-09-15 18:30:00-05')
  ) then
    raise notice 'Existing Council/date or same-time meeting: skipped without changing it.';
  else
    insert into public.meetings
      (title,county_id,starts_at,timezone,location_name,street_address,city,state,postal_code,is_pinned_statewide,status)
    values
      ('Nashville Metro Council public comments (sign up 5-6 PM)',
       target_county,timestamptz '2026-09-15 18:30:00-05','America/Chicago',
       'David Scobey Council Chamber, Historic Metro Courthouse',
       '1 Public Square','Nashville','TN','37201',false,'scheduled');
  end if;
end
$$;

