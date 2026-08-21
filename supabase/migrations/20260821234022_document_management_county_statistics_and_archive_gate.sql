begin;

-- Operator document management, aggregate county statistics, and the public
-- archive gate used by the cleanup-and-meetings frontend pass.
-- All operator writes remain RPC-mediated. Disassociation deletes only the
-- goal/document link; evidence metadata and the stored object are preserved.

do $$
begin
  perform id, county_id, title, status, is_public, locked
    from public.county_records_request_goals where false;
  perform id, goal_id, label, evidence_object_id, position, is_primary,
          public_description, created_by, updated_by, created_at, updated_at
    from public.records_request_goal_links where false;
  perform id, county_id, created_by, object_kind, storage_bucket, storage_path,
          mime_type, visibility, status, original_filename, verified_by,
          created_at
    from public.evidence_objects where false;
  perform id, name, camera_count, drone_count
    from public.counties where false;
  perform county_id, email from public.county_contacts where false;
  perform user_id, role, county_id, status from public.portal_accounts where false;
  perform actor_user_id, county_id, event_type, target_table, target_id, event_data
    from public.security_audit_events where false;

  if to_regprocedure('public.rrg_can_manage_county(bigint)') is null then
    raise exception 'Required function public.rrg_can_manage_county(bigint) is missing.';
  end if;
end;
$$;

create or replace function public.rrg_list_documents(
  p_search text default null,
  p_county_id bigint default null,
  p_sort text default 'uploaded_at',
  p_sort_direction text default 'desc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  link_id bigint,
  evidence_id uuid,
  goal_id bigint,
  county_id bigint,
  county text,
  title text,
  public_description text,
  document_type text,
  associated_goal text,
  government_entity text,
  uploaded_at timestamptz,
  uploaded_by text,
  reviewed_by text,
  archive_state text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_account public.portal_accounts%rowtype;
  v_county_id bigint;
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_sort text := lower(coalesce(p_sort, 'uploaded_at'));
  v_direction text := lower(coalesce(p_sort_direction, 'desc'));
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_account
  from public.portal_accounts
  where user_id = v_uid;

  if not found or v_account.status <> 'active'
     or v_account.role not in ('admin', 'chapter_master') then
    raise exception 'Active operator account required.' using errcode = '42501';
  end if;

  if v_account.role = 'chapter_master' then
    if v_account.county_id is null then
      raise exception 'Chapter account is not assigned to a county.' using errcode = '42501';
    end if;
    v_county_id := v_account.county_id;
  else
    v_county_id := p_county_id;
  end if;

  if v_sort not in ('uploaded_at', 'title', 'county') then
    raise exception 'Unsupported document sort.' using errcode = '22023';
  end if;
  if v_direction not in ('asc', 'desc') then
    raise exception 'Unsupported sort direction.' using errcode = '22023';
  end if;
  if v_search is not null and length(v_search) > 200 then
    raise exception 'Search must be 200 characters or fewer.' using errcode = '22023';
  end if;

  return query
  with scoped as (
    select
      link.id as link_id,
      evidence.id as evidence_id,
      goal.id as goal_id,
      goal.county_id,
      county.name as county,
      link.label as title,
      link.public_description,
      case evidence.object_kind
        when 'correspondence' then 'Response email'
        when 'responsive_record' then 'Evidence'
        else 'Other'
      end as document_type,
      goal.title as associated_goal,
      entity.display_name as government_entity,
      evidence.created_at as uploaded_at,
      coalesce(
        case uploader.role
          when 'admin' then 'Administrator'
          when 'chapter_master' then coalesce(uploader_county.name, 'County') || ' Chapter Master'
        end,
        'Not recorded'
      ) as uploaded_by,
      coalesce(
        case reviewer.role
          when 'admin' then 'Administrator'
          when 'chapter_master' then coalesce(reviewer_county.name, 'County') || ' Chapter Master'
        end,
        'Not recorded'
      ) as reviewed_by,
      case
        when evidence.visibility = 'public' and evidence.status = 'published' then 'Published'
        when evidence.status = 'hidden' then 'Hidden'
        when evidence.status = 'rejected' then 'Rejected'
        when evidence.status = 'quarantined' then 'Quarantined'
        else 'Under review'
      end as archive_state
    from public.records_request_goal_links as link
    join public.evidence_objects as evidence on evidence.id = link.evidence_object_id
    join public.county_records_request_goals as goal on goal.id = link.goal_id
    left join public.counties as county on county.id = goal.county_id
    left join public.government_entities as entity on entity.id = goal.government_entity_id
    left join public.portal_accounts as uploader on uploader.user_id = evidence.created_by
    left join public.counties as uploader_county on uploader_county.id = uploader.county_id
    left join public.portal_accounts as reviewer on reviewer.user_id = evidence.verified_by
    left join public.counties as reviewer_county on reviewer_county.id = reviewer.county_id
    where evidence.storage_bucket = 'public-records-archive'
      and evidence.object_kind in ('responsive_record', 'correspondence', 'other')
      and (v_county_id is null or goal.county_id = v_county_id)
      and (
        v_search is null
        or link.label ilike '%' || v_search || '%'
        or goal.title ilike '%' || v_search || '%'
        or entity.display_name ilike '%' || v_search || '%'
      )
  ), counted as (
    select scoped.*, count(*) over () as total_count
    from scoped
  )
  select counted.*
  from counted
  order by
    case when v_sort = 'uploaded_at' and v_direction = 'asc' then counted.uploaded_at end asc nulls last,
    case when v_sort = 'uploaded_at' and v_direction = 'desc' then counted.uploaded_at end desc nulls last,
    case when v_sort = 'title' and v_direction = 'asc' then lower(counted.title) end asc nulls last,
    case when v_sort = 'title' and v_direction = 'desc' then lower(counted.title) end desc nulls last,
    case when v_sort = 'county' and v_direction = 'asc' then lower(counted.county) end asc nulls last,
    case when v_sort = 'county' and v_direction = 'desc' then lower(counted.county) end desc nulls last,
    counted.link_id asc
  limit v_page_size
  offset (v_page - 1) * v_page_size;
end;
$$;

create or replace function public.rrg_admin_list_orphaned_documents(
  p_county_id bigint default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  link_id bigint,
  evidence_id uuid,
  goal_id bigint,
  county_id bigint,
  county text,
  title text,
  public_description text,
  document_type text,
  associated_goal text,
  government_entity text,
  uploaded_at timestamptz,
  uploaded_by text,
  reviewed_by text,
  archive_state text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_account public.portal_accounts%rowtype;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_account
  from public.portal_accounts
  where user_id = v_uid;

  if not found or v_account.status <> 'active' or v_account.role <> 'admin' then
    raise exception 'Administrator account required.' using errcode = '42501';
  end if;

  return query
  with scoped as (
    select
      null::bigint as link_id,
      evidence.id as evidence_id,
      null::bigint as goal_id,
      evidence.county_id,
      county.name as county,
      coalesce(nullif(trim(evidence.original_filename), ''), 'Untitled document') as title,
      null::text as public_description,
      case evidence.object_kind
        when 'correspondence' then 'Response email'
        when 'responsive_record' then 'Evidence'
        else 'Other'
      end as document_type,
      null::text as associated_goal,
      null::text as government_entity,
      evidence.created_at as uploaded_at,
      coalesce(
        case uploader.role
          when 'admin' then 'Administrator'
          when 'chapter_master' then coalesce(uploader_county.name, 'County') || ' Chapter Master'
        end,
        'Not recorded'
      ) as uploaded_by,
      coalesce(
        case reviewer.role
          when 'admin' then 'Administrator'
          when 'chapter_master' then coalesce(reviewer_county.name, 'County') || ' Chapter Master'
        end,
        'Not recorded'
      ) as reviewed_by,
      'Orphaned'::text as archive_state
    from public.evidence_objects as evidence
    left join public.counties as county on county.id = evidence.county_id
    left join public.portal_accounts as uploader on uploader.user_id = evidence.created_by
    left join public.counties as uploader_county on uploader_county.id = uploader.county_id
    left join public.portal_accounts as reviewer on reviewer.user_id = evidence.verified_by
    left join public.counties as reviewer_county on reviewer_county.id = reviewer.county_id
    where evidence.storage_bucket = 'public-records-archive'
      and evidence.object_kind in ('responsive_record', 'correspondence', 'other')
      and (p_county_id is null or evidence.county_id = p_county_id)
      and not exists (
        select 1
        from public.records_request_goal_links as link
        where link.evidence_object_id = evidence.id
      )
  ), counted as (
    select scoped.*, count(*) over () as total_count
    from scoped
  )
  select counted.*
  from counted
  order by counted.uploaded_at desc nulls last, counted.evidence_id
  limit v_page_size
  offset (v_page - 1) * v_page_size;
end;
$$;

create or replace function public.rrg_update_document_metadata(
  p_link_id bigint,
  p_title text,
  p_public_description text default null
)
returns public.records_request_goal_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_link public.records_request_goal_links%rowtype;
  v_goal public.county_records_request_goals%rowtype;
  v_result public.records_request_goal_links%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_description text := nullif(trim(coalesce(p_public_description, '')), '');
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if v_title = '' or length(v_title) > 200 then
    raise exception 'Document title must be between 1 and 200 characters.' using errcode = '22023';
  end if;
  if v_description is not null and length(v_description) > 2000 then
    raise exception 'Document description must be 2000 characters or fewer.' using errcode = '22023';
  end if;

  select * into v_link
  from public.records_request_goal_links
  where id = p_link_id
  for update;

  if not found or v_link.evidence_object_id is null then
    raise exception 'Document link not found.' using errcode = 'P0002';
  end if;

  select * into strict v_goal
  from public.county_records_request_goals
  where id = v_link.goal_id;

  if not public.rrg_can_manage_county(v_goal.county_id) then
    raise exception 'Not authorized to manage this document.' using errcode = '42501';
  end if;

  update public.records_request_goal_links
  set label = v_title,
      public_description = v_description,
      updated_by = v_uid,
      updated_at = now()
  where id = p_link_id
  returning * into v_result;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid, v_goal.county_id, 'goal_document_metadata_updated',
    'records_request_goal_links', v_result.id::text,
    jsonb_build_object('goal_id', v_goal.id, 'evidence_id', v_result.evidence_object_id)
  );

  return v_result;
end;
$$;

create or replace function public.rrg_move_document_to_goal(
  p_link_id bigint,
  p_target_goal_id bigint
)
returns public.records_request_goal_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_link public.records_request_goal_links%rowtype;
  v_source_goal public.county_records_request_goals%rowtype;
  v_target_goal public.county_records_request_goals%rowtype;
  v_evidence public.evidence_objects%rowtype;
  v_position integer;
  v_primary boolean;
  v_result public.records_request_goal_links%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_link
  from public.records_request_goal_links
  where id = p_link_id
  for update;

  if not found or v_link.evidence_object_id is null then
    raise exception 'Document link not found.' using errcode = 'P0002';
  end if;
  if v_link.goal_id = p_target_goal_id then
    return v_link;
  end if;

  select * into strict v_source_goal
  from public.county_records_request_goals
  where id = v_link.goal_id
  for update;

  select * into v_target_goal
  from public.county_records_request_goals
  where id = p_target_goal_id
  for update;

  if not found then
    raise exception 'Target goal not found.' using errcode = 'P0002';
  end if;

  select * into strict v_evidence
  from public.evidence_objects
  where id = v_link.evidence_object_id;

  if not public.rrg_can_manage_county(v_source_goal.county_id)
     or not public.rrg_can_manage_county(v_target_goal.county_id) then
    raise exception 'Not authorized to move this document.' using errcode = '42501';
  end if;

  if v_source_goal.county_id is distinct from v_target_goal.county_id
     or v_evidence.county_id is distinct from v_target_goal.county_id then
    raise exception 'Documents may only move between goals in their own county.' using errcode = '22023';
  end if;

  select coalesce(max(position), 0) + 1 into v_position
  from public.records_request_goal_links
  where goal_id = v_target_goal.id;

  v_primary := v_link.is_primary and not exists (
    select 1
    from public.records_request_goal_links
    where goal_id = v_target_goal.id and is_primary = true
  );

  update public.records_request_goal_links
  set goal_id = v_target_goal.id,
      position = v_position,
      is_primary = v_primary,
      updated_by = v_uid,
      updated_at = now()
  where id = v_link.id
  returning * into v_result;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid, v_target_goal.county_id, 'goal_document_moved',
    'records_request_goal_links', v_result.id::text,
    jsonb_build_object(
      'evidence_id', v_result.evidence_object_id,
      'source_goal_id', v_source_goal.id,
      'target_goal_id', v_target_goal.id
    )
  );

  return v_result;
end;
$$;

create or replace function public.rrg_disassociate_document(p_link_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_link public.records_request_goal_links%rowtype;
  v_goal public.county_records_request_goals%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_link
  from public.records_request_goal_links
  where id = p_link_id
  for update;

  if not found or v_link.evidence_object_id is null then
    raise exception 'Document link not found.' using errcode = 'P0002';
  end if;

  select * into strict v_goal
  from public.county_records_request_goals
  where id = v_link.goal_id;

  if not public.rrg_can_manage_county(v_goal.county_id) then
    raise exception 'Not authorized to disassociate this document.' using errcode = '42501';
  end if;

  delete from public.records_request_goal_links where id = v_link.id;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid, v_goal.county_id, 'goal_document_disassociated',
    'records_request_goal_links', v_link.id::text,
    jsonb_build_object(
      'goal_id', v_goal.id,
      'evidence_id', v_link.evidence_object_id,
      'stored_object_preserved', true
    )
  );

  return true;
end;
$$;

create or replace function public.rrg_get_document_for_portal(p_evidence_id uuid)
returns table (
  evidence_id uuid,
  title text,
  public_description text,
  document_type text,
  county text,
  government_entity text,
  associated_goal text,
  mime_type text,
  original_filename text,
  storage_bucket text,
  storage_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_evidence public.evidence_objects%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_evidence
  from public.evidence_objects
  where id = p_evidence_id
    and storage_bucket = 'public-records-archive'
    and object_kind in ('responsive_record', 'correspondence', 'other');

  if not found then
    return;
  end if;
  if v_evidence.county_id is null
     or not public.rrg_can_manage_county(v_evidence.county_id) then
    return;
  end if;

  return query
  select
    v_evidence.id,
    coalesce(linked.label, nullif(trim(v_evidence.original_filename), ''), 'Untitled document'),
    linked.public_description,
    case v_evidence.object_kind
      when 'correspondence' then 'Response email'
      when 'responsive_record' then 'Evidence'
      else 'Other'
    end,
    county.name,
    linked.government_entity,
    linked.goal_title,
    v_evidence.mime_type,
    v_evidence.original_filename,
    v_evidence.storage_bucket,
    v_evidence.storage_path
  from public.counties as county
  left join lateral (
    select
      link.label,
      link.public_description,
      goal.title as goal_title,
      entity.display_name as government_entity
    from public.records_request_goal_links as link
    join public.county_records_request_goals as goal on goal.id = link.goal_id
    left join public.government_entities as entity on entity.id = goal.government_entity_id
    where link.evidence_object_id = v_evidence.id
      and goal.county_id = v_evidence.county_id
    order by link.is_primary desc, link.position asc, link.id asc
    limit 1
  ) as linked on true
  where county.id = v_evidence.county_id;
end;
$$;

create or replace function public.rrg_get_county_statistics(p_county_id bigint)
returns table (
  county_id bigint,
  county_name text,
  camera_count integer,
  drone_count integer,
  subscriber_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not public.rrg_can_manage_county(p_county_id) then
    raise exception 'Not authorized to view statistics for this county.' using errcode = '42501';
  end if;

  return query
  select
    county.id,
    county.name,
    coalesce(county.camera_count, 0),
    coalesce(county.drone_count, 0),
    (
      select count(distinct lower(trim(contact.email)))
      from public.county_contacts as contact
      where contact.county_id = county.id
        and nullif(trim(contact.email), '') is not null
    )::bigint
  from public.counties as county
  where county.id = p_county_id;

  if not found then
    raise exception 'County not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.rrg_update_county_statistics(
  p_county_id bigint,
  p_camera_count integer,
  p_drone_count integer
)
returns table (
  county_id bigint,
  county_name text,
  camera_count integer,
  drone_count integer,
  subscriber_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not public.rrg_can_manage_county(p_county_id) then
    raise exception 'Not authorized to update statistics for this county.' using errcode = '42501';
  end if;
  if p_camera_count is null or p_camera_count < 0 or p_camera_count > 100000
     or p_drone_count is null or p_drone_count < 0 or p_drone_count > 100000 then
    raise exception 'Camera and drone counts must be whole numbers between 0 and 100000.' using errcode = '22023';
  end if;

  update public.counties
  set camera_count = p_camera_count,
      drone_count = p_drone_count
  where id = p_county_id;

  if not found then
    raise exception 'County not found.' using errcode = 'P0002';
  end if;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid, p_county_id, 'county_statistics_updated', 'counties', p_county_id::text,
    jsonb_build_object('camera_count', p_camera_count, 'drone_count', p_drone_count)
  );

  return query
  select * from public.rrg_get_county_statistics(p_county_id);
end;
$$;

-- Ready, unlocked, public goals belong in the investigative-goals archive
-- even before a response has been linked. Evidence visibility remains
-- independently gated and resource_count counts only qualifying resources.
create or replace function public.get_public_archive_goals()
returns table (
  goal_id bigint,
  title text,
  public_summary text,
  county text,
  government_entity text,
  tier integer,
  completion_state text,
  resource_count bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with qualifying_links as (
    select link.goal_id, link.id as link_id
    from public.records_request_goal_links as link
    left join public.evidence_objects as evidence on evidence.id = link.evidence_object_id
    where
      (link.evidence_object_id is null and link.external_url ~ '^https://')
      or (
        link.evidence_object_id is not null
        and evidence.id is not null
        and evidence.visibility = 'public'
        and evidence.status = 'published'
        and evidence.object_kind <> 'submitted_request'
        and evidence.storage_bucket = any(array['public-records-archive', 'request-templates'])
      )
  )
  select
    goal.id,
    goal.title,
    goal.public_summary,
    county.name,
    entity.display_name,
    goal.tier,
    case goal.status
      when 'published' then 'Complete'
      when 'received' then 'Partial'
      else 'Ready'
    end,
    count(ql.link_id),
    goal.updated_at
  from public.county_records_request_goals as goal
  left join qualifying_links as ql on ql.goal_id = goal.id
  left join public.counties as county on county.id = goal.county_id
  left join public.government_entities as entity on entity.id = goal.government_entity_id
  where goal.is_public = true
    and goal.locked = false
    and goal.status in ('ready', 'received', 'published')
  group by goal.id, goal.title, goal.public_summary, county.name,
           entity.display_name, goal.tier, goal.status, goal.updated_at
  order by goal.updated_at desc;
$$;

create or replace function public.get_public_archive_goal(p_goal_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_goal public.county_records_request_goals%rowtype;
  v_county_name text;
  v_entity_name text;
  v_resources jsonb;
begin
  select * into v_goal
  from public.county_records_request_goals
  where id = p_goal_id;

  if not found
     or not v_goal.is_public
     or v_goal.locked
     or v_goal.status not in ('ready', 'received', 'published') then
    return null;
  end if;

  select name into v_county_name from public.counties where id = v_goal.county_id;
  select display_name into v_entity_name
    from public.government_entities where id = v_goal.government_entity_id;

  select coalesce(jsonb_agg(resource order by position asc), '[]'::jsonb)
  into v_resources
  from (
    select
      link.position,
      jsonb_build_object(
        'link_id', link.id,
        'position', link.position,
        'label', link.label,
        'public_description', link.public_description,
        'source_kind', case when link.evidence_object_id is not null then 'hosted' else 'external' end,
        'evidence_id', link.evidence_object_id,
        'external_url', link.external_url,
        'document_type', case evidence.object_kind
          when 'correspondence' then 'Response email'
          when 'responsive_record' then 'Evidence'
          when 'base_pdf' then 'Template'
          when 'continuation_pdf' then 'Template'
          else case when link.evidence_object_id is not null then 'Other' else null end
        end,
        'created_at', link.created_at,
        'uploaded_by', coalesce(
          case uploader.role
            when 'admin' then 'Administrator'
            when 'chapter_master' then coalesce(uploader_county.name, 'County') || ' Chapter Master'
          end,
          case when link.evidence_object_id is not null then 'Not recorded' else null end
        ),
        'reviewed_by', coalesce(
          case reviewer.role
            when 'admin' then 'Administrator'
            when 'chapter_master' then coalesce(reviewer_county.name, 'County') || ' Chapter Master'
          end,
          case when link.evidence_object_id is not null then 'Not recorded' else null end
        )
      ) as resource
    from public.records_request_goal_links as link
    left join public.evidence_objects as evidence on evidence.id = link.evidence_object_id
    left join public.portal_accounts as uploader on uploader.user_id = evidence.created_by
    left join public.counties as uploader_county on uploader_county.id = uploader.county_id
    left join public.portal_accounts as reviewer on reviewer.user_id = evidence.verified_by
    left join public.counties as reviewer_county on reviewer_county.id = reviewer.county_id
    where link.goal_id = p_goal_id
      and (
        (link.evidence_object_id is null and link.external_url ~ '^https://')
        or (
          evidence.id is not null
          and evidence.visibility = 'public'
          and evidence.status = 'published'
          and evidence.object_kind <> 'submitted_request'
          and evidence.storage_bucket = any(array['public-records-archive', 'request-templates'])
        )
      )
  ) as ordered_resources;

  return jsonb_build_object(
    'goal_id', v_goal.id,
    'title', v_goal.title,
    'public_summary', v_goal.public_summary,
    'county', v_county_name,
    'government_entity', v_entity_name,
    'tier', v_goal.tier,
    'completion_state', case v_goal.status
      when 'published' then 'Complete'
      when 'received' then 'Partial'
      else 'Ready'
    end,
    'resources', v_resources
  );
end;
$$;

create or replace function public.get_public_archive_document(p_evidence_id uuid)
returns table (
  evidence_id uuid,
  title text,
  document_type text,
  county text,
  government_entity text,
  goal_titles text[],
  public_description text,
  upload_date timestamptz,
  uploaded_by text,
  reviewed_by text,
  mime_type text,
  original_filename text,
  storage_bucket text,
  storage_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  with qualifying as (
    select
      evidence.id as evidence_id,
      evidence.object_kind,
      evidence.created_at as upload_date,
      evidence.created_by,
      evidence.verified_by,
      evidence.mime_type,
      evidence.original_filename,
      evidence.storage_bucket,
      evidence.storage_path,
      link.id as link_id,
      link.label,
      link.public_description,
      goal.id as goal_id,
      goal.title as goal_title,
      county.name as county_name,
      entity.display_name as entity_name
    from public.evidence_objects as evidence
    join public.records_request_goal_links as link on link.evidence_object_id = evidence.id
    join public.county_records_request_goals as goal on goal.id = link.goal_id
    left join public.counties as county on county.id = goal.county_id
    left join public.government_entities as entity on entity.id = goal.government_entity_id
    where evidence.id = p_evidence_id
      and goal.is_public = true
      and goal.locked = false
      and goal.status in ('ready', 'received', 'published')
      and evidence.visibility = 'public'
      and evidence.status = 'published'
      and evidence.object_kind <> 'submitted_request'
      and evidence.storage_bucket = any(array['public-records-archive', 'request-templates'])
  ), representative as (
    select distinct on (evidence_id)
      evidence_id, object_kind, upload_date, created_by, verified_by,
      mime_type, original_filename, storage_bucket, storage_path,
      label, public_description, county_name, entity_name
    from qualifying
    order by evidence_id, goal_id, link_id
  ), goal_titles_agg as (
    select evidence_id, array_agg(distinct goal_title order by goal_title) as goal_titles
    from qualifying
    group by evidence_id
  )
  select
    representative.evidence_id,
    representative.label,
    case representative.object_kind
      when 'correspondence' then 'Response email'
      when 'responsive_record' then 'Evidence'
      when 'base_pdf' then 'Template'
      when 'continuation_pdf' then 'Template'
      else 'Other'
    end,
    representative.county_name,
    representative.entity_name,
    goal_titles_agg.goal_titles,
    representative.public_description,
    representative.upload_date,
    coalesce(
      case uploader.role
        when 'admin' then 'Administrator'
        when 'chapter_master' then coalesce(uploader_county.name, 'County') || ' Chapter Master'
      end,
      'Not recorded'
    ),
    coalesce(
      case reviewer.role
        when 'admin' then 'Administrator'
        when 'chapter_master' then coalesce(reviewer_county.name, 'County') || ' Chapter Master'
      end,
      'Not recorded'
    ),
    representative.mime_type,
    representative.original_filename,
    representative.storage_bucket,
    representative.storage_path
  from representative
  join goal_titles_agg using (evidence_id)
  left join public.portal_accounts as uploader on uploader.user_id = representative.created_by
  left join public.counties as uploader_county on uploader_county.id = uploader.county_id
  left join public.portal_accounts as reviewer on reviewer.user_id = representative.verified_by
  left join public.counties as reviewer_county on reviewer_county.id = reviewer.county_id
  limit 1;
$$;

comment on function public.rrg_list_documents(text, bigint, text, text, integer, integer) is
  'Authenticated operator list of linked archive documents. Admins may scope any county; chapter masters are forced to their assigned county. Server-side pagination is capped at 100.';
comment on function public.rrg_admin_list_orphaned_documents(bigint, integer, integer) is
  'Active-admin-only list of archive evidence with no goal link. The stored object is not modified.';
comment on function public.rrg_update_document_metadata(bigint, text, text) is
  'Updates only the public goal-link title and description for an authorized archive document.';
comment on function public.rrg_move_document_to_goal(bigint, bigint) is
  'Moves a hosted document link to another authorized goal in the same evidence county. Cross-county moves are rejected.';
comment on function public.rrg_disassociate_document(bigint) is
  'Deletes only a goal/document association and preserves the evidence row and stored object for operator review.';
comment on function public.rrg_get_document_for_portal(uuid) is
  'Authenticated county-authorized resolver for linked or orphaned public-records-archive objects. Bucket/path are server-derived.';
comment on function public.rrg_get_county_statistics(bigint) is
  'Returns editable camera/drone totals plus a read-only distinct newsletter-email count. Never returns contact addresses.';
comment on function public.rrg_update_county_statistics(bigint, integer, integer) is
  'County-authorized update of camera/drone totals. Newsletter subscriber count remains derived and read-only.';
comment on function public.get_public_archive_goals() is
  'Public archive list of unlocked public goals in ready, received, or published state. Ready goals may have zero resources; resource_count includes only independently public resources.';
comment on function public.get_public_archive_goal(bigint) is
  'Public detail for an unlocked public goal in ready, received, or published state. Resources are independently visibility-gated and may be empty.';
comment on function public.get_public_archive_document(uuid) is
  'Public resolver for independently public evidence linked through an unlocked public ready, received, or published goal.';

revoke all on function public.rrg_list_documents(text, bigint, text, text, integer, integer) from public, anon;
revoke all on function public.rrg_admin_list_orphaned_documents(bigint, integer, integer) from public, anon;
revoke all on function public.rrg_update_document_metadata(bigint, text, text) from public, anon;
revoke all on function public.rrg_move_document_to_goal(bigint, bigint) from public, anon;
revoke all on function public.rrg_disassociate_document(bigint) from public, anon;
revoke all on function public.rrg_get_document_for_portal(uuid) from public, anon;
revoke all on function public.rrg_get_county_statistics(bigint) from public, anon;
revoke all on function public.rrg_update_county_statistics(bigint, integer, integer) from public, anon;

grant execute on function public.rrg_list_documents(text, bigint, text, text, integer, integer) to authenticated;
grant execute on function public.rrg_admin_list_orphaned_documents(bigint, integer, integer) to authenticated;
grant execute on function public.rrg_update_document_metadata(bigint, text, text) to authenticated;
grant execute on function public.rrg_move_document_to_goal(bigint, bigint) to authenticated;
grant execute on function public.rrg_disassociate_document(bigint) to authenticated;
grant execute on function public.rrg_get_document_for_portal(uuid) to authenticated;
grant execute on function public.rrg_get_county_statistics(bigint) to authenticated;
grant execute on function public.rrg_update_county_statistics(bigint, integer, integer) to authenticated;

revoke all on function public.get_public_archive_goals() from public;
revoke all on function public.get_public_archive_goal(bigint) from public;
revoke all on function public.get_public_archive_document(uuid) from public;
grant execute on function public.get_public_archive_goals() to anon, authenticated;
grant execute on function public.get_public_archive_goal(bigint) to anon, authenticated;
grant execute on function public.get_public_archive_document(uuid) to anon, authenticated;

commit;
