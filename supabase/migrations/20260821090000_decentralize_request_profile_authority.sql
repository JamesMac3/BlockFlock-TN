-- Flock Block Tennessee
-- Decentralizes request-profile authority: an active chapter master may
-- create, edit, preview, activate, retire, and replace request profiles
-- for their own assigned county's government entities, without requiring
-- statewide administrator approval for every profile. Administrators keep
-- unrestricted authority over every county.
--
-- Security model:
--   - request_profiles, government_entities, evidence_objects,
--     portal_accounts, security_audit_events are all pre-existing live
--     tables (request_profiles created by 001_request_profiles_v1.sql).
--     This migration adds no columns and creates no tables — only
--     SECURITY DEFINER RPCs — and never touches existing RLS.
--   - County authority is resolved from a profile's
--     government_entity_id -> government_entities.county_id, then
--     delegated to the existing rrg_can_manage_county(bigint) helper
--     (admin manages every county; an active chapter_master manages only
--     their own assigned county). This is the same helper
--     20260814_records_request_goals.sql already uses for goals — no new
--     authorization concept is introduced.
--   - review_required / trusted-restricted post-approval status is a
--     posts-only concept (chapter_master_accounts_and_posts.sql). It is
--     never read here — an active chapter master's authority over their
--     own county's profiles does not depend on it. Only account.status =
--     'active' (never 'suspended') gates anything.
--   - A profile is only ever editable (rrg_update_request_profile) while
--     status = 'draft'. Once activated (status = 'verified') or retired,
--     it is immutable — a correction must go through
--     rrg_replace_request_profile, which creates a new draft version
--     rather than mutating the verified/retired row in place. This
--     matches how request_profiles.version already works for the
--     existing draft profiles in this repo (each version is its own row).
--   - rrg_activate_request_profile validates everything a SQL statement
--     can verify server-side (profile status, base-template evidence
--     existing/public/published/correctly-bucketed, the government
--     entity actually existing, and effective-date ordering). It cannot
--     itself run the PDF rendering pipeline (that is TypeScript, not
--     SQL) — "a successful document generation" is enforced as a client
--     gate: the frontend only enables the Activate control after the
--     operator's own draft preview (get_draft_request_preview_bundle +
--     generateOperatorPreviewDocument, both already live) has actually
--     succeeded for this exact profile. That UX gate is not a security
--     boundary and is not relied upon here — every check this RPC can
--     itself verify, it does.
--   - This migration is INTENTIONALLY LEFT UNAPPLIED. Codex must confirm
--     the live request_profiles/government_entities column shapes
--     against src/features/document-request/pdf/profile-schema.ts before
--     applying — this file assumes the DB columns mirror that schema's
--     field names exactly, consistent with how every other profile-
--     touching migration in this repo already assumes.

begin;

-- ---------------------------------------------------------------------------
-- 0. Confirm the required foundation (fail fast, never create/alter)
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.request_profiles') is null then
    raise exception 'public.request_profiles does not exist';
  end if;

  if to_regclass('public.government_entities') is null then
    raise exception 'public.government_entities does not exist';
  end if;

  if to_regclass('public.evidence_objects') is null then
    raise exception 'public.evidence_objects does not exist';
  end if;

  if to_regclass('public.security_audit_events') is null then
    raise exception 'public.security_audit_events does not exist; this migration requires the existing live audit table and does not create it';
  end if;

  if to_regprocedure('public.rrg_can_manage_county(bigint)') is null then
    raise exception 'public.rrg_can_manage_county(bigint) does not exist yet; apply 20260814_records_request_goals.sql first';
  end if;

  -- Fails fast if the live request_profiles shape does not match what
  -- every RPC below assumes (mirrors profile-schema.ts field-for-field,
  -- confirmed by reading that file in this repo, not guessed).
  perform id, government_entity_id, version, schema_version, status, effective_from, effective_to,
    policy_source_url, archived_policy_object_id, policy_summary, eligibility_mode,
    eligibility_jurisdiction, eligibility_explanation, form_mode, form_explanation, fee_rule,
    aggregation_rule, submission_instructions, template_family, renderer_type, base_pdf_object_id,
    continuation_profile_id, field_schema, template_schema, validation_schema, output_options,
    verified_by, verified_at, created_at
  from public.request_profiles
  where false;

  perform id, county_id, legal_name, display_name
  from public.government_entities
  where false;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. County-authority helper for a profile's own government entity
-- ---------------------------------------------------------------------------

create or replace function public.rrg_can_manage_profile_entity(p_government_entity_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select public.rrg_can_manage_county(entity.county_id)
      from public.government_entities as entity
      where entity.id = p_government_entity_id
    ),
    false
  );
$$;

comment on function public.rrg_can_manage_profile_entity(bigint) is
  'Resolves a government entity to its county, then delegates to the existing rrg_can_manage_county — admin manages every county''s profiles, an active chapter_master only their own assigned county''s. Returns false (never null, never raises) for an unknown entity id.';

-- ---------------------------------------------------------------------------
-- 2. Create — a new draft profile for the caller's authorized entity
-- ---------------------------------------------------------------------------

create or replace function public.rrg_create_request_profile(
  p_government_entity_id bigint,
  p_policy_source_url text,
  p_eligibility_mode text,
  p_eligibility_jurisdiction text,
  p_eligibility_explanation text,
  p_form_mode text,
  p_form_explanation text,
  p_fee_rule text,
  p_aggregation_rule text,
  p_submission_instructions text,
  p_template_family text,
  p_renderer_type text,
  p_base_pdf_object_id uuid,
  p_continuation_profile_id uuid,
  p_field_schema jsonb,
  p_template_schema jsonb,
  p_validation_schema jsonb,
  p_output_options jsonb
)
returns public.request_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_next_version integer;
  v_profile public.request_profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.portal_accounts as account
    where account.user_id = v_uid and account.status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if not public.rrg_can_manage_profile_entity(p_government_entity_id) then
    raise exception 'Not authorized to manage request profiles for this government entity.' using errcode = '42501';
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
  from public.request_profiles
  where government_entity_id = p_government_entity_id;

  insert into public.request_profiles (
    government_entity_id, version, schema_version, status,
    effective_from, effective_to, policy_source_url, archived_policy_object_id, policy_summary,
    eligibility_mode, eligibility_jurisdiction, eligibility_explanation,
    form_mode, form_explanation, fee_rule, aggregation_rule, submission_instructions,
    template_family, renderer_type, base_pdf_object_id, continuation_profile_id,
    field_schema, template_schema, validation_schema, output_options,
    verified_by, verified_at
  ) values (
    p_government_entity_id, v_next_version, 1, 'draft',
    null, null, p_policy_source_url, null, null,
    p_eligibility_mode, p_eligibility_jurisdiction, p_eligibility_explanation,
    p_form_mode, p_form_explanation, p_fee_rule, p_aggregation_rule, p_submission_instructions,
    p_template_family, p_renderer_type, p_base_pdf_object_id, p_continuation_profile_id,
    p_field_schema, p_template_schema, p_validation_schema, p_output_options,
    null, null
  )
  returning * into v_profile;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  )
  select
    v_uid, entity.county_id, 'request_profile_created', 'request_profiles', v_profile.id::text,
    jsonb_build_object('government_entity_id', p_government_entity_id, 'version', v_next_version)
  from public.government_entities as entity
  where entity.id = p_government_entity_id;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Update — editable fields, only while the profile is still a draft
-- ---------------------------------------------------------------------------

create or replace function public.rrg_update_request_profile(
  p_profile_id uuid,
  p_policy_source_url text,
  p_eligibility_mode text,
  p_eligibility_jurisdiction text,
  p_eligibility_explanation text,
  p_form_mode text,
  p_form_explanation text,
  p_fee_rule text,
  p_aggregation_rule text,
  p_submission_instructions text,
  p_template_family text,
  p_renderer_type text,
  p_base_pdf_object_id uuid,
  p_continuation_profile_id uuid,
  p_field_schema jsonb,
  p_template_schema jsonb,
  p_validation_schema jsonb,
  p_output_options jsonb
)
returns public.request_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.request_profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.portal_accounts as account
    where account.user_id = v_uid and account.status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_profile from public.request_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Request profile not found.' using errcode = 'P0002';
  end if;

  if not public.rrg_can_manage_profile_entity(v_profile.government_entity_id) then
    raise exception 'Not authorized to manage request profiles for this government entity.' using errcode = '42501';
  end if;

  -- Immutable once activated or retired — a correction is a new draft
  -- version via rrg_replace_request_profile, never an in-place mutation
  -- of an already-verified/retired row.
  if v_profile.status <> 'draft' then
    raise exception 'Only a draft request profile can be edited. Activated and retired profiles are immutable — create a new version instead.' using errcode = '42501';
  end if;

  update public.request_profiles
  set
    policy_source_url = p_policy_source_url,
    eligibility_mode = p_eligibility_mode,
    eligibility_jurisdiction = p_eligibility_jurisdiction,
    eligibility_explanation = p_eligibility_explanation,
    form_mode = p_form_mode,
    form_explanation = p_form_explanation,
    fee_rule = p_fee_rule,
    aggregation_rule = p_aggregation_rule,
    submission_instructions = p_submission_instructions,
    template_family = p_template_family,
    renderer_type = p_renderer_type,
    base_pdf_object_id = p_base_pdf_object_id,
    continuation_profile_id = p_continuation_profile_id,
    field_schema = p_field_schema,
    template_schema = p_template_schema,
    validation_schema = p_validation_schema,
    output_options = p_output_options
  where id = p_profile_id
  returning * into v_profile;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  )
  select
    v_uid, entity.county_id, 'request_profile_updated', 'request_profiles', v_profile.id::text,
    jsonb_build_object('government_entity_id', v_profile.government_entity_id, 'version', v_profile.version)
  from public.government_entities as entity
  where entity.id = v_profile.government_entity_id;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Activate — every server-checkable prerequisite, then verified/immutable
-- ---------------------------------------------------------------------------

create or replace function public.rrg_activate_request_profile(p_profile_id uuid)
returns public.request_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.request_profiles%rowtype;
  v_entity public.government_entities%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.portal_accounts as account
    where account.user_id = v_uid and account.status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_profile from public.request_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Request profile not found.' using errcode = 'P0002';
  end if;

  if not public.rrg_can_manage_profile_entity(v_profile.government_entity_id) then
    raise exception 'Not authorized to manage request profiles for this government entity.' using errcode = '42501';
  end if;

  if v_profile.status <> 'draft' then
    raise exception 'Only a draft request profile can be activated.' using errcode = '42501';
  end if;

  -- Government entity and county relationship.
  select * into v_entity from public.government_entities where id = v_profile.government_entity_id;
  if not found then
    raise exception 'The linked government entity no longer exists.' using errcode = 'P0002';
  end if;
  if v_entity.county_id is null then
    raise exception 'The linked government entity has no county.' using errcode = '42501';
  end if;

  -- Renderer configuration / base-template evidence — acroform and overlay
  -- renderers require a base PDF that is real, public, published, and in
  -- the request-templates bucket; generated_letter needs none.
  if v_profile.renderer_type in ('acroform', 'overlay') then
    if v_profile.base_pdf_object_id is null then
      raise exception 'This renderer type requires a base PDF template.' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.evidence_objects as evidence
      where evidence.id = v_profile.base_pdf_object_id
        and evidence.visibility = 'public'
        and evidence.status = 'published'
        and evidence.mime_type = 'application/pdf'
        and evidence.storage_bucket = 'request-templates'
    ) then
      raise exception 'The base PDF template is missing, unpublished, or not correctly stored.' using errcode = '42501';
    end if;
  end if;

  -- Profile schema — the renderer type must actually match its own
  -- field_schema (the same invariant requestProfileSchema enforces
  -- client-side; re-checked here since the RPC is the authoritative gate).
  if coalesce(v_profile.field_schema ->> 'renderer_type', '') <> v_profile.renderer_type then
    raise exception 'The field schema''s renderer type does not match the profile''s renderer type.' using errcode = '42501';
  end if;

  -- Required effective-date rules: activation sets effective_from to today
  -- if not already set, and any existing effective_to must not precede it.
  if v_profile.effective_to is not null
    and v_profile.effective_to < coalesce(v_profile.effective_from, current_date)
  then
    raise exception 'The effective date range is inverted.' using errcode = '42501';
  end if;

  update public.request_profiles
  set
    status = 'verified',
    verified_by = v_uid,
    verified_at = now(),
    effective_from = coalesce(effective_from, current_date)
  where id = p_profile_id
  returning * into v_profile;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid, v_entity.county_id, 'request_profile_activated', 'request_profiles', v_profile.id::text,
    jsonb_build_object('government_entity_id', v_profile.government_entity_id, 'version', v_profile.version)
  );

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Retire — from draft or verified, never re-retiring an already-retired row
-- ---------------------------------------------------------------------------

create or replace function public.rrg_retire_request_profile(p_profile_id uuid)
returns public.request_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.request_profiles%rowtype;
  v_previous_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.portal_accounts as account
    where account.user_id = v_uid and account.status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_profile from public.request_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Request profile not found.' using errcode = 'P0002';
  end if;

  if not public.rrg_can_manage_profile_entity(v_profile.government_entity_id) then
    raise exception 'Not authorized to manage request profiles for this government entity.' using errcode = '42501';
  end if;

  if v_profile.status = 'retired' then
    raise exception 'This request profile is already retired.' using errcode = '42501';
  end if;

  v_previous_status := v_profile.status;

  update public.request_profiles
  set status = 'retired'
  where id = p_profile_id
  returning * into v_profile;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  )
  select
    v_uid, entity.county_id, 'request_profile_retired', 'request_profiles', v_profile.id::text,
    jsonb_build_object('government_entity_id', v_profile.government_entity_id, 'version', v_profile.version, 'previous_status', v_previous_status)
  from public.government_entities as entity
  where entity.id = v_profile.government_entity_id;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Replace — retires the current profile (if not already retired) and
--    creates a new draft version in the same transaction, so a correction
--    to a verified profile never leaves the entity with zero usable rows
--    mid-flight.
-- ---------------------------------------------------------------------------

create or replace function public.rrg_replace_request_profile(p_profile_id uuid)
returns public.request_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_source public.request_profiles%rowtype;
  v_new public.request_profiles%rowtype;
  v_next_version integer;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.portal_accounts as account
    where account.user_id = v_uid and account.status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_source from public.request_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Request profile not found.' using errcode = 'P0002';
  end if;

  if not public.rrg_can_manage_profile_entity(v_source.government_entity_id) then
    raise exception 'Not authorized to manage request profiles for this government entity.' using errcode = '42501';
  end if;

  if v_source.status = 'draft' then
    raise exception 'A draft profile can be edited directly with rrg_update_request_profile — replace is only for a verified or retired profile.' using errcode = '42501';
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
  from public.request_profiles
  where government_entity_id = v_source.government_entity_id;

  insert into public.request_profiles (
    government_entity_id, version, schema_version, status,
    effective_from, effective_to, policy_source_url, archived_policy_object_id, policy_summary,
    eligibility_mode, eligibility_jurisdiction, eligibility_explanation,
    form_mode, form_explanation, fee_rule, aggregation_rule, submission_instructions,
    template_family, renderer_type, base_pdf_object_id, continuation_profile_id,
    field_schema, template_schema, validation_schema, output_options,
    verified_by, verified_at
  ) values (
    v_source.government_entity_id, v_next_version, 1, 'draft',
    null, null, v_source.policy_source_url, v_source.archived_policy_object_id, v_source.policy_summary,
    v_source.eligibility_mode, v_source.eligibility_jurisdiction, v_source.eligibility_explanation,
    v_source.form_mode, v_source.form_explanation, v_source.fee_rule, v_source.aggregation_rule, v_source.submission_instructions,
    v_source.template_family, v_source.renderer_type, v_source.base_pdf_object_id, v_source.continuation_profile_id,
    v_source.field_schema, v_source.template_schema, v_source.validation_schema, v_source.output_options,
    null, null
  )
  returning * into v_new;

  if v_source.status = 'verified' then
    update public.request_profiles set status = 'retired' where id = v_source.id;
  end if;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  )
  select
    v_uid, entity.county_id, 'request_profile_replaced', 'request_profiles', v_new.id::text,
    jsonb_build_object(
      'government_entity_id', v_source.government_entity_id,
      'replaced_profile_id', v_source.id,
      'replaced_version', v_source.version,
      'new_version', v_next_version
    )
  from public.government_entities as entity
  where entity.id = v_source.government_entity_id;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants (defense in depth: revoke first, grant only what's needed)
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.rrg_can_manage_profile_entity(bigint)',
    'public.rrg_create_request_profile(bigint, text, text, text, text, text, text, text, text, text, text, text, uuid, uuid, jsonb, jsonb, jsonb, jsonb)',
    'public.rrg_update_request_profile(uuid, text, text, text, text, text, text, text, text, text, text, text, uuid, uuid, jsonb, jsonb, jsonb, jsonb)',
    'public.rrg_activate_request_profile(uuid)',
    'public.rrg_retire_request_profile(uuid)',
    'public.rrg_replace_request_profile(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public;', fn);
    execute format('revoke all on function %s from anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- One-result Supabase verification
-- ---------------------------------------------------------------------------

select jsonb_build_object(
  'rrg_can_manage_profile_entity_exists', to_regprocedure('public.rrg_can_manage_profile_entity(bigint)') is not null,
  'rrg_create_request_profile_exists', to_regprocedure(
    'public.rrg_create_request_profile(bigint, text, text, text, text, text, text, text, text, text, text, text, uuid, uuid, jsonb, jsonb, jsonb, jsonb)'
  ) is not null,
  'rrg_update_request_profile_exists', to_regprocedure(
    'public.rrg_update_request_profile(uuid, text, text, text, text, text, text, text, text, text, text, text, uuid, uuid, jsonb, jsonb, jsonb, jsonb)'
  ) is not null,
  'rrg_activate_request_profile_exists', to_regprocedure('public.rrg_activate_request_profile(uuid)') is not null,
  'rrg_retire_request_profile_exists', to_regprocedure('public.rrg_retire_request_profile(uuid)') is not null,
  'rrg_replace_request_profile_exists', to_regprocedure('public.rrg_replace_request_profile(uuid)') is not null
) as decentralize_request_profile_authority_migration;
