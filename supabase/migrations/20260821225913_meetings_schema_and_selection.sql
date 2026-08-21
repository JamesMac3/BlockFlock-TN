begin;

do $$
begin
  if to_regclass('public.counties') is null
    or to_regclass('public.posts') is null
    or to_regclass('public.portal_accounts') is null
    or to_regclass('public.security_audit_events') is null then
    raise exception 'The meetings migration requires counties, posts, portal_accounts, and security_audit_events.';
  end if;

  if to_regprocedure('public.rrg_submit_post(bigint)') is null
    or to_regprocedure('public.rrg_can_manage_county(bigint)') is null then
    raise exception 'The meetings migration requires rrg_submit_post and rrg_can_manage_county.';
  end if;
end
$$;

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  county_id bigint references public.counties(id),
  starts_at timestamptz not null,
  timezone text not null default 'America/Chicago'
    check (timezone = 'America/Chicago'),
  location_name text not null check (char_length(trim(location_name)) between 1 and 250),
  street_address text not null check (char_length(trim(street_address)) between 1 and 250),
  city text not null check (char_length(trim(city)) between 1 and 120),
  state text not null check (state = 'TN'),
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  is_pinned_statewide boolean not null default false,
  source_post_id bigint references public.posts(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled', 'expired')),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (is_pinned_statewide and county_id is null)
    or (not is_pinned_statewide and county_id is not null)
  )
);

create unique index meetings_source_post_id_key
  on public.meetings(source_post_id)
  where source_post_id is not null;

create index meetings_county_scheduled_idx
  on public.meetings(county_id, starts_at)
  where status = 'scheduled';

create index meetings_statewide_scheduled_idx
  on public.meetings(starts_at)
  where is_pinned_statewide and status = 'scheduled';

alter table public.meetings enable row level security;
alter table public.meetings force row level security;
revoke all on table public.meetings from public, anon, authenticated;

create or replace function public.rrg_upsert_meeting(
  p_meeting_id uuid,
  p_title text,
  p_county_id bigint,
  p_starts_at timestamptz,
  p_location_name text,
  p_street_address text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_is_pinned_statewide boolean
)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_actor public.portal_accounts%rowtype;
  v_existing public.meetings%rowtype;
  v_result public.meetings%rowtype;
  v_county_id bigint := p_county_id;
  v_pinned boolean := coalesce(p_is_pinned_statewide, false);
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  select * into v_actor from public.portal_accounts where user_id = v_uid;
  if not found or v_actor.status <> 'active' then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if v_actor.role = 'chapter_master' then
    v_county_id := v_actor.county_id;
    v_pinned := false;
  elsif v_actor.role <> 'admin' then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if (v_pinned and v_county_id is not null) or (not v_pinned and v_county_id is null) then
    raise exception 'A county meeting requires a county; a statewide meeting must not have one.' using errcode = '22023';
  end if;

  if not v_pinned and not public.rrg_can_manage_county(v_county_id) then
    raise exception 'Not authorized for this county.' using errcode = '42501';
  end if;

  if p_starts_at is null
    or (p_starts_at at time zone 'America/Chicago')::date < (now() at time zone 'America/Chicago')::date then
    raise exception 'The meeting date cannot be in the past.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null
    or nullif(trim(coalesce(p_location_name, '')), '') is null
    or nullif(trim(coalesce(p_street_address, '')), '') is null
    or nullif(trim(coalesce(p_city, '')), '') is null
    or upper(trim(coalesce(p_state, ''))) <> 'TN' then
    raise exception 'A title and complete Tennessee location are required.' using errcode = '22023';
  end if;

  if p_meeting_id is null then
    insert into public.meetings (
      title, county_id, starts_at, location_name, street_address, city, state,
      postal_code, is_pinned_statewide, created_by, updated_by
    ) values (
      trim(p_title), v_county_id, p_starts_at, trim(p_location_name),
      trim(p_street_address), trim(p_city), 'TN', nullif(trim(coalesce(p_postal_code, '')), ''),
      v_pinned, v_uid, v_uid
    ) returning * into v_result;
  else
    select * into v_existing from public.meetings where id = p_meeting_id for update;
    if not found then
      raise exception 'Meeting not found.' using errcode = 'P0002';
    end if;
    if v_existing.source_post_id is not null then
      raise exception 'Post-linked meetings must be edited through the post composer.' using errcode = '42501';
    end if;
    if v_actor.role = 'chapter_master'
      and v_existing.county_id is distinct from v_actor.county_id then
      raise exception 'Not authorized.' using errcode = '42501';
    end if;
    if v_existing.status <> 'scheduled' then
      raise exception 'Only scheduled meetings can be edited.' using errcode = '42501';
    end if;

    update public.meetings set
      title = trim(p_title), county_id = v_county_id, starts_at = p_starts_at,
      location_name = trim(p_location_name), street_address = trim(p_street_address),
      city = trim(p_city), state = 'TN', postal_code = nullif(trim(coalesce(p_postal_code, '')), ''),
      is_pinned_statewide = v_pinned, updated_by = v_uid, updated_at = now()
    where id = p_meeting_id
    returning * into v_result;
  end if;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid, v_result.county_id,
    case when p_meeting_id is null then 'meeting_created' else 'meeting_updated' end,
    'meetings', v_result.id::text,
    jsonb_build_object('starts_at', v_result.starts_at, 'is_pinned_statewide', v_result.is_pinned_statewide)
  );

  return v_result;
end
$$;

create or replace function public.rrg_cancel_meeting(p_meeting_id uuid)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_actor public.portal_accounts%rowtype;
  v_meeting public.meetings%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  select * into v_actor from public.portal_accounts where user_id = v_uid;
  if not found or v_actor.status <> 'active' then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  select * into v_meeting from public.meetings where id = p_meeting_id for update;
  if not found then
    raise exception 'Meeting not found.' using errcode = 'P0002';
  end if;
  if v_actor.role <> 'admin'
    and (v_actor.role <> 'chapter_master' or v_meeting.county_id is distinct from v_actor.county_id) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  update public.meetings
  set status = 'cancelled', updated_by = v_uid, updated_at = now()
  where id = p_meeting_id and status = 'scheduled'
  returning * into v_meeting;

  if not found then
    raise exception 'Only a scheduled meeting can be cancelled.' using errcode = '42501';
  end if;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (v_uid, v_meeting.county_id, 'meeting_cancelled', 'meetings', v_meeting.id::text, '{}'::jsonb);

  return v_meeting;
end
$$;

create or replace function public.rrg_list_meetings(
  p_status text default null,
  p_county_id bigint default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  id uuid, title text, county_id bigint, county_name text, starts_at timestamptz,
  timezone text, location_name text, street_address text, city text, state text,
  postal_code text, is_pinned_statewide boolean, source_post_id bigint, status text,
  created_by uuid, updated_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor public.portal_accounts%rowtype;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  select * into v_actor from public.portal_accounts where user_id = auth.uid();
  if not found or v_actor.status <> 'active' or v_actor.role not in ('admin', 'chapter_master') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('scheduled', 'cancelled', 'expired') then
    raise exception 'Invalid meeting status.' using errcode = '22023';
  end if;

  return query
  select m.id, m.title, m.county_id, c.name, m.starts_at, m.timezone,
    m.location_name, m.street_address, m.city, m.state, m.postal_code,
    m.is_pinned_statewide, m.source_post_id, m.status, m.created_by, m.updated_at,
    count(*) over()
  from public.meetings m
  left join public.counties c on c.id = m.county_id
  where (p_status is null or m.status = p_status)
    and (p_county_id is null or m.county_id = p_county_id)
  order by m.starts_at asc, m.id asc
  limit v_page_size offset (v_page - 1) * v_page_size;
end
$$;

create or replace function public.rrg_get_next_meeting_for_county(p_county_id bigint default null)
returns table (
  id uuid, title text, county_id bigint, county_name text, starts_at timestamptz,
  timezone text, location_name text, street_address text, city text, state text,
  postal_code text, is_pinned_statewide boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.title, m.county_id, c.name, m.starts_at, m.timezone,
    m.location_name, m.street_address, m.city, m.state, m.postal_code, m.is_pinned_statewide
  from public.meetings m
  left join public.counties c on c.id = m.county_id
  where m.status = 'scheduled'
    and (m.starts_at at time zone 'America/Chicago')::date >= (now() at time zone 'America/Chicago')::date
    and ((p_county_id is not null and m.county_id = p_county_id) or m.is_pinned_statewide)
  order by
    case when p_county_id is not null and m.county_id = p_county_id then 0 else 1 end,
    m.starts_at asc,
    m.id asc
  limit 1;
$$;

create or replace function public.rrg_save_post_with_meeting(
  p_post_id bigint,
  p_title text,
  p_summary text,
  p_body text,
  p_county_id bigint,
  p_starts_at timestamptz,
  p_location_name text,
  p_street_address text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_is_pinned_statewide boolean,
  p_submit boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_actor public.portal_accounts%rowtype;
  v_post public.posts%rowtype;
  v_meeting public.meetings%rowtype;
  v_starting_status text;
  v_county_id bigint := p_county_id;
  v_pinned boolean := coalesce(p_is_pinned_statewide, false);
  v_address text;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  select * into v_actor from public.portal_accounts where user_id = v_uid;
  if not found or v_actor.status <> 'active' then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if v_actor.role = 'chapter_master' then
    v_county_id := v_actor.county_id;
    v_pinned := false;
  elsif v_actor.role <> 'admin' then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if (v_pinned and v_county_id is not null) or (not v_pinned and v_county_id is null) then
    raise exception 'A county meeting requires a county; a statewide meeting must not have one.' using errcode = '22023';
  end if;
  if not v_pinned and not public.rrg_can_manage_county(v_county_id) then
    raise exception 'Not authorized for this county.' using errcode = '42501';
  end if;
  if p_starts_at is null
    or (p_starts_at at time zone 'America/Chicago')::date < (now() at time zone 'America/Chicago')::date then
    raise exception 'The meeting date cannot be in the past.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_title, '')), '') is null
    or char_length(trim(p_title)) > 200
    or nullif(trim(coalesce(p_body, '')), '') is null
    or char_length(trim(p_body)) > 50000
    or char_length(trim(coalesce(p_summary, ''))) > 2000
    or nullif(trim(coalesce(p_location_name, '')), '') is null
    or nullif(trim(coalesce(p_street_address, '')), '') is null
    or nullif(trim(coalesce(p_city, '')), '') is null
    or upper(trim(coalesce(p_state, ''))) <> 'TN' then
    raise exception 'A title, body, and complete Tennessee meeting location are required.' using errcode = '22023';
  end if;

  v_address := trim(p_street_address) || ', ' || trim(p_city) || ', TN'
    || case when nullif(trim(coalesce(p_postal_code, '')), '') is null then '' else ' ' || trim(p_postal_code) end;

  if p_post_id is null then
    insert into public.posts (
      county_id, author_user_id, title, body, status, is_pinned, scope, content_type,
      summary, body_rich, event_start, event_location, event_address, show_in_status_feed
    ) values (
      v_county_id, v_uid, trim(p_title), trim(p_body), 'draft', false,
      case when v_pinned then 'global' else 'county' end, 'meeting',
      trim(coalesce(p_summary, '')), null, p_starts_at, trim(p_location_name), v_address, false
    ) returning * into v_post;
    v_starting_status := 'draft';
  else
    select * into v_post from public.posts where id = p_post_id for update;
    if not found then
      raise exception 'Post not found.' using errcode = 'P0002';
    end if;
    if v_post.content_type <> 'meeting' then
      raise exception 'Only a meeting post can be saved with a meeting.' using errcode = '42501';
    end if;
    v_starting_status := v_post.status;

    if v_actor.role = 'chapter_master' then
      if v_post.author_user_id is distinct from v_uid or v_post.county_id is distinct from v_actor.county_id then
        raise exception 'Not authorized.' using errcode = '42501';
      end if;
      if v_post.status = 'pending' then
        raise exception 'This post is awaiting review and cannot be edited until an administrator responds.' using errcode = '42501';
      end if;
      if v_post.status = 'approved' and v_actor.review_required then
        raise exception 'Changes to this approved post require administrator review.' using errcode = '42501';
      end if;
    end if;

    update public.posts set
      county_id = v_county_id, title = trim(p_title), body = trim(p_body),
      scope = case when v_pinned then 'global' else 'county' end,
      summary = trim(coalesce(p_summary, '')), body_rich = null,
      event_start = p_starts_at, event_location = trim(p_location_name),
      event_address = v_address, is_pinned = false, show_in_status_feed = false,
      updated_at = now()
    where id = p_post_id
    returning * into v_post;

    if v_actor.role = 'chapter_master' and v_starting_status = 'approved' then
      insert into public.security_audit_events (
        actor_user_id, county_id, event_type, target_table, target_id, event_data
      ) values (
        v_uid, v_post.county_id, 'approved_post_edited_by_trusted_chapter_master',
        'posts', v_post.id::text, jsonb_build_object('status', v_post.status)
      );
    end if;
  end if;

  select * into v_meeting from public.meetings where source_post_id = v_post.id for update;
  if found then
    if v_meeting.status <> 'scheduled' then
      raise exception 'A cancelled or expired meeting cannot be edited through its post.' using errcode = '42501';
    end if;
    update public.meetings set
      title = trim(p_title), county_id = v_county_id, starts_at = p_starts_at,
      location_name = trim(p_location_name), street_address = trim(p_street_address),
      city = trim(p_city), state = 'TN', postal_code = nullif(trim(coalesce(p_postal_code, '')), ''),
      is_pinned_statewide = v_pinned, updated_by = v_uid, updated_at = now()
    where id = v_meeting.id returning * into v_meeting;
  else
    insert into public.meetings (
      title, county_id, starts_at, location_name, street_address, city, state,
      postal_code, is_pinned_statewide, source_post_id, created_by, updated_by
    ) values (
      trim(p_title), v_county_id, p_starts_at, trim(p_location_name), trim(p_street_address),
      trim(p_city), 'TN', nullif(trim(coalesce(p_postal_code, '')), ''),
      v_pinned, v_post.id, v_uid, v_uid
    ) returning * into v_meeting;
  end if;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid, v_meeting.county_id,
    case when v_meeting.created_at = v_meeting.updated_at then 'meeting_created_from_post' else 'meeting_updated_from_post' end,
    'meetings', v_meeting.id::text, jsonb_build_object('post_id', v_post.id)
  );

  if coalesce(p_submit, false) and v_starting_status in ('draft', 'rejected') then
    v_post := public.rrg_submit_post(v_post.id);
  elsif coalesce(p_submit, false) and v_actor.role = 'admin' and v_starting_status = 'pending' then
    v_post := public.rrg_submit_post(v_post.id);
  end if;

  return jsonb_build_object('post', to_jsonb(v_post), 'meeting', to_jsonb(v_meeting));
end
$$;

create or replace function public.rrg_expire_past_meetings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meeting public.meetings%rowtype;
  v_count integer := 0;
begin
  for v_meeting in
    update public.meetings
    set status = 'expired', updated_at = now()
    where status = 'scheduled'
      and (starts_at at time zone 'America/Chicago')::date
        <= (now() at time zone 'America/Chicago')::date - 2
    returning *
  loop
    v_count := v_count + 1;
    insert into public.security_audit_events (
      actor_user_id, county_id, event_type, target_table, target_id, event_data
    ) values (null, v_meeting.county_id, 'meeting_expired', 'meetings', v_meeting.id::text, '{}'::jsonb);
  end loop;
  return v_count;
end
$$;

create or replace function public.rrg_admin_expire_past_meetings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.portal_accounts
    where user_id = auth.uid() and role = 'admin' and status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  return public.rrg_expire_past_meetings();
end
$$;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.rrg_upsert_meeting(uuid,text,bigint,timestamp with time zone,text,text,text,text,text,boolean)',
    'public.rrg_cancel_meeting(uuid)',
    'public.rrg_list_meetings(text,bigint,integer,integer)',
    'public.rrg_save_post_with_meeting(bigint,text,text,text,bigint,timestamp with time zone,text,text,text,text,text,boolean,boolean)',
    'public.rrg_admin_expire_past_meetings()'
  ] loop
    execute format('revoke all on function %s from public, anon;', v_function);
    execute format('grant execute on function %s to authenticated;', v_function);
  end loop;

  revoke all on function public.rrg_get_next_meeting_for_county(bigint) from public;
  grant execute on function public.rrg_get_next_meeting_for_county(bigint) to anon, authenticated;

  revoke all on function public.rrg_expire_past_meetings() from public, anon, authenticated;
  grant execute on function public.rrg_expire_past_meetings() to service_role;
end
$$;

commit;
