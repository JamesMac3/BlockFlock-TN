begin;

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
      elsif v_post.status = 'approved' then
        raise exception 'This post has already been approved and cannot be edited by its author.' using errcode = '42501';
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

revoke all on function public.rrg_save_post_with_meeting(
  bigint, text, text, text, bigint, timestamp with time zone,
  text, text, text, text, text, boolean, boolean
) from public, anon;
grant execute on function public.rrg_save_post_with_meeting(
  bigint, text, text, text, bigint, timestamp with time zone,
  text, text, text, text, text, boolean, boolean
) to authenticated;

commit;

