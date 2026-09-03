-- Allow validated security-definer workflows to perform post state changes
-- without weakening the trigger's protection against direct client updates.

create or replace function public.enforce_post_review_workflow()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  acting_user uuid := auth.uid();
  acting_user_is_admin boolean := false;
  controlled_workflow boolean := false;
begin
  -- Trusted SQL migrations and service operations do not carry an auth user.
  if acting_user is null then
    return new;
  end if;

  select exists (
    select 1
    from public.portal_accounts as account
    where account.user_id = acting_user
      and account.role = 'admin'
      and account.status = 'active'
  ) into acting_user_is_admin;

  if acting_user_is_admin then
    return new;
  end if;

  controlled_workflow := coalesce(
    current_setting('app.rrg_post_workflow_actor', true) = acting_user::text,
    false
  );

  if controlled_workflow then
    return new;
  end if;

  if new.author_user_id is distinct from old.author_user_id
    or new.county_id is distinct from old.county_id
    or new.scope is distinct from old.scope
    or new.is_pinned is distinct from old.is_pinned
    or new.mass_email_approved is distinct from old.mass_email_approved
    or new.review_note is distinct from old.review_note
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.rejected_at is distinct from old.rejected_at
    or new.admin_edited is distinct from old.admin_edited
  then
    raise exception 'Only an active admin may change review or publication fields';
  end if;

  if old.status = 'draft' and new.status not in ('draft', 'pending') then
    raise exception 'A chapter draft may only remain a draft or be submitted';
  end if;

  if old.status = 'rejected' and new.status not in ('rejected', 'pending') then
    raise exception 'A rejected post must remain rejected until resubmitted';
  end if;

  if old.status not in ('draft', 'rejected') then
    raise exception 'This post is not editable by its chapter in the current state';
  end if;

  if new.status = 'pending' and old.status in ('draft', 'rejected') then
    new.submitted_at := now();
    new.submitted_title := new.title;
    new.submitted_body := new.body;
  else
    new.submitted_at := old.submitted_at;
    new.submitted_title := old.submitted_title;
    new.submitted_body := old.submitted_body;
  end if;

  return new;
end;
$function$;

create or replace function public.rrg_submit_post(p_post_id bigint)
returns public.posts
language plpgsql
security definer
set search_path to ''
as $function$
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

  select * into v_actor
  from public.portal_accounts
  where user_id = v_uid;

  if not found or v_actor.status <> 'active' then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_post
  from public.posts
  where id = p_post_id
  for update;

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

  perform set_config('app.rrg_post_workflow_actor', v_uid::text, true);

  update public.posts
  set
    status = v_target_status,
    submitted_at = now(),
    submitted_title = title,
    submitted_body = body,
    approved_at = case when v_target_status = 'approved' then now() else null end,
    approved_by = case when v_target_status = 'approved' then v_uid else null end,
    rejected_at = null
  where id = p_post_id
  returning * into v_post;

  perform set_config('app.rrg_post_workflow_actor', '', true);

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid,
    v_post.county_id,
    case when v_target_status = 'approved' then 'post_published' else 'post_submitted_for_review' end,
    'posts',
    v_post.id::text,
    jsonb_build_object('previous_status', v_previous_status, 'new_status', v_target_status)
  );

  return v_post;
end;
$function$;

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

  v_subject := coalesce(nullif(btrim(p_subject), ''), nullif(btrim(v_post.title), ''));
  if v_subject is null or char_length(v_subject) > 180 then
    raise exception 'Email subject must be between 1 and 180 characters.' using errcode = '22023';
  end if;

  insert into public.email_campaigns (post_id, requested_by, target_scope, county_id, subject)
  values (v_post.id, v_actor, v_post.scope, v_post.county_id, v_subject)
  returning id into v_campaign_id;

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

create or replace function public.rrg_publish_post_with_email_campaign(
  p_post_id bigint,
  p_request_email boolean default false,
  p_subject text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_post public.posts%rowtype;
  v_campaign_id bigint := null;
begin
  select * into v_post from public.rrg_submit_post(p_post_id);

  if coalesce(p_request_email, false) then
    v_campaign_id := public.rrg_request_post_email_campaign(p_post_id, p_subject);
  end if;

  return jsonb_build_object(
    'post_id', v_post.id,
    'post_status', v_post.status,
    'campaign_id', v_campaign_id,
    'campaign_status', case when v_campaign_id is null then null else 'requested' end
  );
end;
$function$;

revoke all on function public.rrg_publish_post_with_email_campaign(bigint, boolean, text) from public;
revoke all on function public.rrg_publish_post_with_email_campaign(bigint, boolean, text) from anon;
grant execute on function public.rrg_publish_post_with_email_campaign(bigint, boolean, text) to authenticated;

