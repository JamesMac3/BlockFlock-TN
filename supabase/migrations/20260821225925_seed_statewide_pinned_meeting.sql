insert into public.meetings (
  title, county_id, starts_at, timezone, location_name, street_address,
  city, state, postal_code, is_pinned_statewide, status, created_by, updated_by
)
select
  'Flock Block Tennessee Statewide Meeting',
  null,
  timestamptz '2026-09-01T22:00:00Z',
  'America/Chicago',
  '200 North Castle Heights Ave',
  '200 North Castle Heights Ave',
  'Lebanon',
  'TN',
  null,
  true,
  'scheduled',
  null,
  null
where not exists (
  select 1 from public.meetings
  where is_pinned_statewide = true
    and starts_at = timestamptz '2026-09-01T22:00:00Z'
);
