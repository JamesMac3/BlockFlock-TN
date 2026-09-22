begin;

-- A non-PDF profile, carried by the existing profile lifecycle RPCs.
alter table public.request_profiles drop constraint request_profiles_renderer_type_check;
alter table public.request_profiles add constraint request_profiles_renderer_type_check
  check (renderer_type in ('acroform', 'overlay', 'generated_letter', 'online_portal'));
alter table public.request_profiles drop constraint request_profiles_template_family_check;
alter table public.request_profiles add constraint request_profiles_template_family_check
  check (template_family in ('municipal_form', 'municipal_letter', 'tennessee_model', 'online_portal'));
alter table public.request_profiles drop constraint request_profiles_check3;
alter table public.request_profiles add constraint request_profiles_check3 check (
  (renderer_type in ('acroform', 'overlay') and base_pdf_object_id is not null)
  or (renderer_type in ('generated_letter', 'online_portal') and base_pdf_object_id is null)
);
alter table public.request_profiles add constraint request_profiles_portal_family_check
  check ((renderer_type = 'online_portal') = (template_family = 'online_portal'));

-- JSON lives in the existing columns, so create/update/replace and the draft
-- bundle preserve it without changing RPC signatures or copying extra columns.
create function public.rrg_validate_online_portal_profile()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_url text;
begin
  if new.renderer_type <> 'online_portal' then return new; end if;
  if new.form_mode <> 'portal_only' or new.continuation_profile_id is not null then
    raise exception 'Online portal profiles require portal_only mode and no continuation PDF.' using errcode = '22023';
  end if;
  if new.field_schema is distinct from '{"schema_version":1,"renderer_type":"online_portal","fields":[]}'::jsonb
     or new.output_options is distinct from '{"schema_version":1}'::jsonb
     or new.validation_schema is distinct from '{"schema_version":1,"required_paths":[],"rules":[],"scope_warnings":[],"broad_mode_confirmation":false}'::jsonb then
    raise exception 'Online portal profiles require the supported portal schema; PDF fields and validation rules are not supported.' using errcode = '22023';
  end if;
  if jsonb_typeof(new.template_schema) is distinct from 'object'
     or new.template_schema->'schema_version' is distinct from '1'::jsonb
     or jsonb_typeof(new.template_schema->'portal_url') is distinct from 'string'
     or jsonb_typeof(new.template_schema->'request_text') is distinct from 'string'
     or (new.template_schema - array['schema_version','portal_url','request_text']) <> '{}'::jsonb then
    raise exception 'Portal template requires schema_version, portal_url and plain request_text only.' using errcode = '22023';
  end if;
  v_url := new.template_schema->>'portal_url';
  -- HTTPS host, no credentials/whitespace/backslashes or ambiguous authority.
  if length(v_url) > 2048
     or v_url !~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]\\]*)?$'
     or v_url ~ '[[:cntrl:]]' then
    raise exception 'Enter a valid HTTPS records-request portal URL without credentials or spaces (maximum 2048 characters).' using errcode = '22023';
  end if;
  if length(new.template_schema->>'request_text') > 12000 then
    raise exception 'Default portal request text exceeds the 12000-character storage limit.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.rrg_validate_online_portal_profile() from public, anon, authenticated;
create trigger request_profiles_validate_online_portal
before insert or update on public.request_profiles
for each row execute function public.rrg_validate_online_portal_profile();

-- Invoker deliberately retains table RLS. Preview also checks county authority;
-- a public profile alone never makes a private goal publicly preparable.
create function public.rrg_prepare_online_request(p_goal_id bigint, p_preview boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_goal public.county_records_request_goals%rowtype;
  v_profile public.request_profiles%rowtype;
  v_entity public.government_entities%rowtype;
  v_text text;
  v_source text;
begin
  if coalesce(p_preview, false) and
     (auth.uid() is null or not public.rrg_can_manage_goal(p_goal_id)) then
    raise exception 'Not authorized to preview this request.' using errcode = '42501';
  end if;
  select * into v_goal from public.county_records_request_goals where id = p_goal_id;
  if not found then raise exception 'Request not available.' using errcode = 'P0002'; end if;
  if v_goal.locked or (not coalesce(p_preview, false) and not public.rrg_goal_is_public(p_goal_id)) then
    raise exception 'Request not available.' using errcode = '42501';
  end if;
  select * into v_profile from public.request_profiles where id = v_goal.request_profile_id;
  if not found or v_profile.renderer_type <> 'online_portal' then
    raise exception 'An online portal profile is not available for this request.' using errcode = 'P0002';
  end if;
  if coalesce(p_preview, false) then
    if not public.rrg_can_manage_profile_entity(v_profile.government_entity_id)
       or v_profile.status not in ('draft','verified') then
      raise exception 'This profile is not available for operator preview.' using errcode = '42501';
    end if;
  elsif v_profile.status <> 'verified' then
    raise exception 'This request profile has not been approved yet.' using errcode = '42501';
  end if;
  if v_profile.status = 'verified' and
     ((v_profile.effective_from is not null and v_profile.effective_from > current_date)
       or (v_profile.effective_to is not null and v_profile.effective_to < current_date)) then
    raise exception 'This request profile is not currently effective.' using errcode = '42501';
  end if;
  select * into v_entity from public.government_entities where id = v_goal.government_entity_id;
  if not found or not v_entity.active
     or v_entity.id is distinct from v_profile.government_entity_id
     or v_entity.county_id is distinct from v_goal.county_id then
    raise exception 'The request and profile must refer to the same active government entity and county.' using errcode = '42501';
  end if;
  -- Preserve saved request language exactly. No public_summary substitution,
  -- HTML evaluation, placeholder interpolation, or silent truncation.
  if (v_goal.fill_payload #> '{request,records_description}') is not null
     and (v_goal.fill_payload #> '{request,records_description}') <> 'null'::jsonb
     and jsonb_typeof(v_goal.fill_payload #> '{request,records_description}') <> 'string' then
    raise exception 'Records description must be plain text.' using errcode = '22023';
  end if;
  v_text := v_goal.fill_payload #>> '{request,records_description}';
  v_source := 'goal';
  if v_text is null or v_text !~ '[^[:space:]]' then
    v_text := v_profile.template_schema->>'request_text';
    v_source := 'profile_default';
  end if;
  if v_text is null or v_text !~ '[^[:space:]]' then
    raise exception 'Add records request language to the goal or the portal profile before preparing this request.' using errcode = '22023';
  end if;
  if length(v_text) > 12000 then
    raise exception 'Records request language exceeds the 12000-character storage limit; shorten it before preparing.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'mode','online_portal', 'goal_id',v_goal.id, 'profile_id',v_profile.id,
    'profile_version',v_profile.version, 'profile_status',v_profile.status,
    'preview',coalesce(p_preview,false), 'title',v_goal.title,
    'entity_name',coalesce(v_entity.display_name,v_entity.legal_name),
    'portal_url',v_profile.template_schema->>'portal_url',
    'request_text',v_text, 'text_source',v_source,
    'submission_instructions',v_profile.submission_instructions,
    'eligibility_mode',v_profile.eligibility_mode,
    'eligibility_jurisdiction',v_profile.eligibility_jurisdiction,
    'eligibility_explanation',v_profile.eligibility_explanation,
    'fee_rule',v_profile.fee_rule
  );
end;
$$;
revoke all on function public.rrg_prepare_online_request(bigint,boolean) from public;
grant execute on function public.rrg_prepare_online_request(bigint,boolean) to anon, authenticated;
comment on function public.rrg_prepare_online_request(bigint,boolean) is
  'Read-only portal request preparation. RLS enforced; public verified/effective goals or authorized operator previews. Copy/open is not submission.';
notify pgrst, 'reload schema';
commit;
