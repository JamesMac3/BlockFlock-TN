-- Qualify evidence columns that collide with RETURNS TABLE output variables.
create or replace function public.rrg_get_document_for_portal(
  p_evidence_id uuid
)
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
as $function$
declare
  v_uid uuid := auth.uid();
  v_evidence public.evidence_objects%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select eo.*
    into v_evidence
    from public.evidence_objects as eo
   where eo.id = p_evidence_id
     and eo.storage_bucket = 'public-records-archive'
     and eo.object_kind in ('responsive_record', 'correspondence', 'other');

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
$function$;

revoke all on function public.rrg_get_document_for_portal(uuid) from public, anon;
grant execute on function public.rrg_get_document_for_portal(uuid) to authenticated;
