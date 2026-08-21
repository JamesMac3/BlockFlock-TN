-- Flock Block Tennessee
-- Authorized operator draft-request preview.
--
-- Gives an authenticated administrator or the assigned chapter master for a
-- goal's own county a narrow, audited way to fetch the exact fields the
-- browser PDF generator needs for one goal, but ONLY while its linked
-- request_profile is still status = 'draft'. Verified profiles continue
-- through the ordinary public generator; in_review and retired profiles
-- are rejected outright. This is intentionally the smallest possible
-- slice: one read-only, single-goal SECURITY DEFINER function that reuses
-- the existing audit table. It does not add a broad SELECT policy on
-- request_profiles, does not touch the existing public verified-profile
-- read policy, and does not add write/edit/verify capability.
--
-- Security model:
--   - Reuses public.rrg_can_manage_goal(goal_id), the existing helper that
--     already encodes "admin can manage every county; chapter_master can
--     manage only their own active-assignment county" against
--     public.portal_accounts. No new authorization logic is introduced.
--   - The function takes only a goal ID. It never accepts a county ID,
--     entity ID, or profile ID from the caller — every relationship is
--     derived server-side from the goal row itself, and cross-checked
--     against the profile's and entity's own foreign keys before anything
--     is returned.
--   - Existing RLS on request_profiles, county_records_request_goals,
--     government_entities, evidence_objects, and security_audit_events is
--     left completely unchanged and still applies to every other access
--     path. This function is an additional, narrowly authorized path, not
--     a replacement for RLS. public.security_audit_events already exists
--     live (columns: id, actor_user_id, county_id, event_type,
--     target_table, target_id, event_data, created_at; RLS enabled, not
--     forced, no client-facing policies) — this migration does not create,
--     alter, or re-grant it in any way, only inserts through it using its
--     existing shape.
--   - Returns only an explicit allowlist of columns per table — the same
--     columns the generator's adapters already support (see
--     src/features/document-request/pdf/profile-adapter.ts and
--     goal-adapter.ts) — never requester/contact/subscription data.
--   - Base-PDF evidence must independently satisfy object_kind in
--     ('base_pdf', 'continuation_pdf'), storage_bucket =
--     'request-templates', mime_type = 'application/pdf', visibility =
--     'public', and status = 'published' before its storage location is
--     ever returned; unsuitable or missing evidence is rejected, not
--     silently omitted.

begin;

-- ---------------------------------------------------------------------------
-- 0. Confirm the required foundation
-- ---------------------------------------------------------------------------
-- security_audit_events already exists live and is never created, altered,
-- or re-granted here — only its existing shape is confirmed so the audit
-- insert below fails at migration-apply time (loudly) rather than at
-- first-call time if the expected columns are ever missing.

do $$
begin
  if to_regclass('public.portal_accounts') is null then
    raise exception 'public.portal_accounts does not exist';
  end if;

  if to_regclass('public.county_records_request_goals') is null then
    raise exception 'public.county_records_request_goals does not exist';
  end if;

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

  if to_regprocedure('public.rrg_can_manage_goal(bigint)') is null then
    raise exception 'public.rrg_can_manage_goal(bigint) does not exist yet; apply 20260814_records_request_goals.sql first';
  end if;

  -- Fails fast with a clear message here if the expected live audit-table
  -- shape is ever missing a required column, instead of the INSERT inside
  -- get_draft_request_preview_bundle failing later with a less obvious error.
  perform actor_user_id, county_id, event_type, target_table, target_id, event_data
  from public.security_audit_events
  where false;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Authorized draft-request preview bundle
-- ---------------------------------------------------------------------------

create or replace function public.get_draft_request_preview_bundle(p_goal_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_goal public.county_records_request_goals%rowtype;
  v_profile public.request_profiles%rowtype;
  v_entity public.government_entities%rowtype;
  v_evidence public.evidence_objects%rowtype;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if not public.rrg_can_manage_goal(p_goal_id) then
    raise exception 'Not authorized to preview this goal.' using errcode = '42501';
  end if;

  select * into v_goal
  from public.county_records_request_goals
  where id = p_goal_id;

  if not found then
    raise exception 'Goal not found.' using errcode = 'P0002';
  end if;

  if v_goal.locked then
    raise exception 'This goal is locked and cannot be previewed.' using errcode = '42501';
  end if;

  if v_goal.request_profile_id is null then
    raise exception 'This goal has no linked request profile.' using errcode = 'P0002';
  end if;

  select * into v_profile
  from public.request_profiles
  where id = v_goal.request_profile_id;

  if not found then
    raise exception 'Linked request profile not found.' using errcode = 'P0002';
  end if;

  -- This is specifically the draft-preview path. Verified profiles are
  -- served through the ordinary public generator (which itself requires
  -- status = 'verified' and a currently effective date range); in_review
  -- and retired profiles are never previewable or renderable through any
  -- path.
  if v_profile.status is distinct from 'draft' then
    raise exception 'Only draft request profiles are available through the operator preview path.' using errcode = '42501';
  end if;

  if v_profile.government_entity_id is distinct from v_goal.government_entity_id then
    raise exception 'The goal and its request profile reference different government entities.' using errcode = '42501';
  end if;

  select * into v_entity
  from public.government_entities
  where id = v_goal.government_entity_id;

  if not found then
    raise exception 'Government entity not found.' using errcode = 'P0002';
  end if;

  if v_entity.county_id is distinct from v_goal.county_id then
    raise exception 'The goal and its government entity reference different counties.' using errcode = '42501';
  end if;

  if v_profile.base_pdf_object_id is not null then
    select * into v_evidence
    from public.evidence_objects
    where id = v_profile.base_pdf_object_id;

    if not found then
      raise exception 'Base PDF evidence not found.' using errcode = 'P0002';
    end if;

    if v_evidence.object_kind not in ('base_pdf', 'continuation_pdf') then
      raise exception 'Base PDF evidence has an unsupported object_kind.' using errcode = '42501';
    end if;

    if v_evidence.storage_bucket is distinct from 'request-templates' then
      raise exception 'Base PDF evidence is not stored in the request-templates bucket.' using errcode = '42501';
    end if;

    if v_evidence.mime_type is distinct from 'application/pdf' then
      raise exception 'Base PDF evidence is not an application/pdf file.' using errcode = '42501';
    end if;

    if v_evidence.visibility is distinct from 'public' then
      raise exception 'Base PDF evidence is not marked public.' using errcode = '42501';
    end if;

    if v_evidence.status is distinct from 'published' then
      raise exception 'Base PDF evidence is not published.' using errcode = '42501';
    end if;
  end if;

  v_result := jsonb_build_object(
    'goal', jsonb_build_object(
      'id', v_goal.id,
      'county_id', v_goal.county_id,
      'government_entity_id', v_goal.government_entity_id,
      'request_profile_id', v_goal.request_profile_id,
      'title', v_goal.title,
      'public_summary', v_goal.public_summary,
      'fill_payload', v_goal.fill_payload,
      'status', v_goal.status,
      'locked', v_goal.locked,
      'locked_reason', v_goal.locked_reason
    ),
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'government_entity_id', v_profile.government_entity_id,
      'version', v_profile.version,
      'schema_version', v_profile.schema_version,
      'status', v_profile.status,
      'effective_from', v_profile.effective_from,
      'effective_to', v_profile.effective_to,
      'policy_source_url', v_profile.policy_source_url,
      'archived_policy_object_id', v_profile.archived_policy_object_id,
      'policy_summary', v_profile.policy_summary,
      'eligibility_mode', v_profile.eligibility_mode,
      'eligibility_jurisdiction', v_profile.eligibility_jurisdiction,
      'eligibility_explanation', v_profile.eligibility_explanation,
      'form_mode', v_profile.form_mode,
      'form_explanation', v_profile.form_explanation,
      'fee_rule', v_profile.fee_rule,
      'aggregation_rule', v_profile.aggregation_rule,
      'submission_instructions', v_profile.submission_instructions,
      'template_family', v_profile.template_family,
      'renderer_type', v_profile.renderer_type,
      'base_pdf_object_id', v_profile.base_pdf_object_id,
      'continuation_profile_id', v_profile.continuation_profile_id,
      'field_schema', v_profile.field_schema,
      'template_schema', v_profile.template_schema,
      'validation_schema', v_profile.validation_schema,
      'output_options', v_profile.output_options,
      'verified_by', v_profile.verified_by,
      'verified_at', v_profile.verified_at
    ),
    'entity', jsonb_build_object(
      'id', v_entity.id,
      'legal_name', v_entity.legal_name,
      'display_name', v_entity.display_name,
      'coordinator_name', v_entity.coordinator_name,
      'coordinator_title', v_entity.coordinator_title,
      'submission_email', v_entity.submission_email,
      'mailing_address', v_entity.mailing_address,
      'portal_url', v_entity.portal_url
    ),
    -- storage_bucket/storage_path are the live evidence_objects columns;
    -- returned under the bucket_id/object_path names the client's
    -- TemplateSource contract already uses (matching
    -- get_public_request_template_source's existing output shape).
    'evidence', case when v_profile.base_pdf_object_id is null then null else jsonb_build_object(
      'bucket_id', v_evidence.storage_bucket,
      'object_path', v_evidence.storage_path,
      'mime_type', v_evidence.mime_type,
      'size_bytes', v_evidence.size_bytes,
      'sha256_hex', v_evidence.sha256_hex
    ) end
  );

  -- Audit the moment the authorized bundle is returned — not "generated",
  -- since browser rendering happens afterward and may still fail. Uses the
  -- existing live security_audit_events shape exactly; goal_id and
  -- government_entity_id have no dedicated columns on that table, so they
  -- go in event_data alongside profile_status, never PDF bytes, request
  -- language, fill_payload, or any requester/contact field.
  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid,
    v_goal.county_id,
    'request_profile_preview_bundle_accessed',
    'request_profiles',
    v_profile.id::text,
    jsonb_build_object(
      'goal_id', v_goal.id,
      'government_entity_id', v_goal.government_entity_id,
      'profile_status', v_profile.status
    )
  );

  return v_result;
end;
$$;

comment on function public.get_draft_request_preview_bundle(bigint) is
  'Returns the generator-safe preview bundle (goal, request profile, government entity, base-PDF evidence metadata) for one goal, authorized via rrg_can_manage_goal, and only for a draft-status request profile. Never returns contact subscriptions, requester identity, or credentials. Records an access event in the existing public.security_audit_events table on success.';

-- Defense in depth: explicit, minimal grants. No default privileges are
-- left in place — PUBLIC and anon are revoked first, then only
-- `authenticated` is granted EXECUTE. Authorization itself is enforced
-- inside the function body (rrg_can_manage_goal), not by the grant alone.
revoke all on function public.get_draft_request_preview_bundle(bigint) from public;
revoke all on function public.get_draft_request_preview_bundle(bigint) from anon;
grant execute on function public.get_draft_request_preview_bundle(bigint) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- 2. One-result Supabase verification
-- ---------------------------------------------------------------------------

select jsonb_build_object(
  'preview_function_exists', to_regprocedure('public.get_draft_request_preview_bundle(bigint)') is not null,
  'preview_function_is_security_definer', (
    select prosecdef
    from pg_proc
    where oid = 'public.get_draft_request_preview_bundle(bigint)'::regprocedure
  ),
  'preview_function_has_empty_search_path', (
    select proconfig @> array['search_path=']
    from pg_proc
    where oid = 'public.get_draft_request_preview_bundle(bigint)'::regprocedure
  ),
  'security_audit_events_untouched_here', to_regclass('public.security_audit_events') is not null
) as operator_draft_request_preview_migration;
