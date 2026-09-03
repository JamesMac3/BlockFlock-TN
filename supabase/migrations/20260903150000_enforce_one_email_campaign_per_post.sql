-- Preserve one immutable email-campaign request per post and expose its
-- operator-visible state without granting direct access to campaign rows.

create unique index if not exists email_campaigns_one_campaign_per_post_idx
  on public.email_campaigns (post_id);

create or replace function public.rrg_request_post_email_campaign(
  p_post_id bigint,
  p_subject text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
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
  elsif v_account.role <> 'admin' and v_account.role <> 'chapter_master' then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_post
  from public.posts
  where id = p_post_id
  for update;

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

  if exists (
    select 1 from public.email_campaigns where post_id = v_post.id
  ) then
    raise exception 'An email campaign has already been requested for this post.' using errcode = '23505';
  end if;

  v_subject := coalesce(nullif(btrim(p_subject), ''), nullif(btrim(v_post.title), ''));
  if v_subject is null or char_length(v_subject) > 180 then
    raise exception 'Email subject must be between 1 and 180 characters.' using errcode = '22023';
  end if;

  begin
    insert into public.email_campaigns (post_id, requested_by, target_scope, county_id, subject)
    values (v_post.id, v_actor, v_post.scope, v_post.county_id, v_subject)
    returning id into v_campaign_id;
  exception
    when unique_violation then
      raise exception 'An email campaign has already been requested for this post.' using errcode = '23505';
  end;

  perform set_config('app.rrg_post_workflow_actor', v_actor::text, true);
  update public.posts set mass_email_requested = true where id = v_post.id;
  perform set_config('app.rrg_post_workflow_actor', '', true);

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_actor,
    v_post.county_id,
    'email_campaign_requested',
    'email_campaigns',
    v_campaign_id::text,
    jsonb_build_object('post_id', v_post.id, 'scope', v_post.scope)
  );

  return v_campaign_id;
end;
$function$;

create or replace function public.rrg_get_post_email_campaign_state(p_post_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_account public.portal_accounts%rowtype;
  v_post public.posts%rowtype;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_account
  from public.portal_accounts
  where user_id = v_actor;

  if not found or v_account.status <> 'active'
     or v_account.role not in ('admin', 'chapter_master') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_post
  from public.posts
  where id = p_post_id;

  if not found then
    raise exception 'Post not found.' using errcode = 'P0002';
  end if;

  if v_account.role = 'chapter_master' and (
    v_post.author_user_id <> v_actor
    or v_post.scope <> 'county'
    or v_post.county_id <> v_account.county_id
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'requested', true,
    'campaign_id', campaign.id,
    'status', campaign.status,
    'subject', campaign.subject,
    'requested_at', campaign.requested_at
  ) into v_result
  from public.email_campaigns as campaign
  where campaign.post_id = v_post.id;

  return coalesce(v_result, jsonb_build_object('requested', false));
end;
$function$;

revoke all on function public.rrg_request_post_email_campaign(bigint, text) from public, anon;
grant execute on function public.rrg_request_post_email_campaign(bigint, text) to authenticated;

revoke all on function public.rrg_get_post_email_campaign_state(bigint) from public, anon;
grant execute on function public.rrg_get_post_email_campaign_state(bigint) to authenticated;
