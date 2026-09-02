-- Mirrors the live 2026-09-02 defense-in-depth correction.

create or replace function public.rrg_request_post_email_campaign(
  p_post_id bigint,
  p_subject text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_account public.portal_accounts%rowtype;
  v_post public.posts%rowtype;
  v_campaign_id bigint;
  v_subject text;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_account
  from public.portal_accounts
  where user_id = v_actor;

  if not found or v_account.status <> 'active' then
    raise exception 'An active portal account is required.' using errcode = '42501';
  end if;

  if v_account.role = 'chapter_master' and v_account.review_required then
    raise exception 'Trusted chapter access required.' using errcode = '42501';
  elsif v_account.role not in ('admin', 'chapter_master') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'Post not found.' using errcode = 'P0002';
  end if;

  if v_account.role = 'chapter_master' and (
    v_post.author_user_id <> v_actor
    or v_post.scope <> 'county'
    or v_post.county_id <> v_account.county_id
  ) then
    raise exception 'Chapter masters may email only their own county posts.' using errcode = '42501';
  end if;

  if v_post.status not in ('draft', 'pending', 'approved') then
    raise exception 'Only draft, pending, or approved posts may be prepared for email.' using errcode = '22023';
  end if;

  v_subject := coalesce(nullif(btrim(p_subject), ''), nullif(btrim(v_post.title), ''));
  if v_subject is null or char_length(v_subject) > 180 then
    raise exception 'Email subject must be between 1 and 180 characters.' using errcode = '22023';
  end if;

  insert into public.email_campaigns (post_id, requested_by, target_scope, county_id, subject)
  values (v_post.id, v_actor, v_post.scope, v_post.county_id, v_subject)
  returning id into v_campaign_id;

  update public.posts set mass_email_requested = true where id = v_post.id;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_actor, v_post.county_id, 'email_campaign_requested', 'email_campaigns',
    v_campaign_id::text, jsonb_build_object('post_id', v_post.id, 'scope', v_post.scope)
  );

  return v_campaign_id;
end;
$$;

create or replace function public.rrg_submit_post(p_post_id bigint)
returns public.posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_actor public.portal_accounts%rowtype;
  v_post public.posts%rowtype;
  v_previous_status text;
  v_target_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  select * into v_actor from public.portal_accounts where user_id = v_uid;
  if not found or v_actor.status <> 'active' then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'Post not found.' using errcode = 'P0002';
  end if;
  v_previous_status := v_post.status;

  if v_actor.role = 'admin' then
    if v_previous_status not in ('draft', 'pending', 'rejected') then
      raise exception 'This post cannot be published from its current status.' using errcode = '42501';
    end if;
    v_target_status := 'approved';
  elsif v_actor.role = 'chapter_master' then
    if v_post.author_user_id is distinct from v_uid then
      raise exception 'Not authorized.' using errcode = '42501';
    end if;
    if v_post.scope <> 'county'
       or v_post.county_id is null
       or v_post.county_id is distinct from v_actor.county_id then
      raise exception 'Chapter posts must belong to the caller''s county.' using errcode = '42501';
    end if;
    if v_previous_status not in ('draft', 'rejected') then
      raise exception 'This post cannot be submitted from its current status.' using errcode = '42501';
    end if;
    v_target_status := case when v_actor.review_required then 'pending' else 'approved' end;
  else
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  update public.posts
  set status = v_target_status,
      submitted_at = now(),
      approved_at = case when v_target_status = 'approved' then now() else null end,
      approved_by = case when v_target_status = 'approved' then v_uid else null end,
      rejected_at = null
  where id = p_post_id
  returning * into v_post;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid, v_post.county_id,
    case when v_target_status = 'approved' then 'post_published' else 'post_submitted_for_review' end,
    'posts', v_post.id::text,
    jsonb_build_object('previous_status', v_previous_status, 'new_status', v_target_status)
  );

  return v_post;
end;
$$;

revoke all on function public.rrg_request_post_email_campaign(bigint, text) from public, anon;
revoke all on function public.rrg_submit_post(bigint) from public, anon;
grant execute on function public.rrg_request_post_email_campaign(bigint, text) to authenticated;
grant execute on function public.rrg_submit_post(bigint) to authenticated;
