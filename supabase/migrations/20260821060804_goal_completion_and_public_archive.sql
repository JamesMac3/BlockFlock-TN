-- Flock Block Tennessee
-- Goal resource publishing (Partial/Complete) and the goal-first public
-- archive.
--
-- Security model:
--   - archive-uploads (private), public-records-archive (public), and
--     request-templates (public) already exist live with their own storage
--     policies. This migration NEVER creates, alters, or replaces a bucket
--     or a storage.objects policy — it only fails fast (section 0) if a
--     bucket or an expected policy is missing, using the exact live policy
--     names given for this task. If those names are wrong live, Codex must
--     correct the literals below before applying; this migration must never
--     be "fixed" by creating a same-named policy to satisfy the check.
--   - rrg_add_goal_resource is the DB half of adding a hosted document to a
--     goal, called only by the promote-goal-evidence Edge Function after it
--     has already uploaded the file to public-records-archive with a
--     server-generated random filename. It re-derives and re-validates
--     every piece of authorization and file/path metadata itself — it does
--     not trust the Edge Function's prior checks. Adding a resource is
--     deliberately NOT the same action as completing a goal: by default the
--     goal moves to (or stays at) 'received' ("Partial"); only an explicit
--     p_mark_complete = true moves it to 'published' ("Complete"), and a
--     goal already 'published' is never downgraded by a later default
--     (Partial) resource add. Publishing a resource also sets the goal's
--     is_public to true atomically, so a public Storage object is never
--     left attached to an invisible private goal.
--   - rrg_add_external_source is the equivalent DB-only action for a
--     non-hosted resource (an external HTTPS link) — same authorization,
--     same Partial/Complete semantics, its own strict server-side URL
--     validation (HTTPS only, no embedded credentials, no IP-literal or
--     internal/reserved hostname — see the function body for why IP
--     literals are rejected outright rather than range-parsed).
--   - rrg_set_goal_completion is the explicit operator action that replaces
--     the frontend's previous direct status update — unlike the two RPCs
--     above (which only ever raise Partial to Complete as a side effect of
--     adding a resource, never downgrading an already-published goal), this
--     MAY deliberately move a goal back to Partial, and requires at least
--     one qualifying public resource before allowing Complete.
--   - get_public_archive_goals / get_public_archive_goal are the public,
--     goal-first archive read paths — the investigative goal is the
--     primary row, not an individual document. Both require goal.is_public
--     and status in ('received','published') AND at least one qualifying
--     resource (external HTTPS link, or hosted evidence independently
--     passing every public-suitability gate) — deliberately narrower than
--     the general-purpose rrg_goal_is_public helper, which would also allow
--     an is_public goal with no resources at all (e.g. 'ready') to leak
--     into the archive. get_public_archive_document(p_evidence_id) applies
--     the same narrowed goal gate — it remains the only way to resolve a
--     single hosted document's storage location, safely, from an id alone.
--   - security_audit_events, evidence_objects, county_contacts,
--     records_request_goal_links, county_records_request_goals are all
--     pre-existing live tables (the last two created by
--     20260814_records_request_goals.sql). This migration adds two new
--     columns (records_request_goal_links.public_description,
--     evidence_objects is not altered — original_filename already exists
--     live) and a set of SECURITY DEFINER RPCs; it never touches any
--     existing RLS.

begin;

-- ---------------------------------------------------------------------------
-- 0. Confirm the required foundation (fail fast, never create/alter)
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.county_records_request_goals') is null then
    raise exception 'public.county_records_request_goals does not exist';
  end if;

  if to_regclass('public.records_request_goal_links') is null then
    raise exception 'public.records_request_goal_links does not exist';
  end if;

  if to_regclass('public.evidence_objects') is null then
    raise exception 'public.evidence_objects does not exist';
  end if;

  if to_regclass('public.county_contacts') is null then
    raise exception 'public.county_contacts does not exist';
  end if;

  if to_regclass('public.security_audit_events') is null then
    raise exception 'public.security_audit_events does not exist; this migration requires the existing live audit table and does not create it';
  end if;

  if to_regprocedure('public.rrg_can_manage_county(bigint)') is null then
    raise exception 'public.rrg_can_manage_county(bigint) does not exist yet; apply 20260814_records_request_goals.sql first';
  end if;

  -- Buckets must already exist live — this migration never creates one.
  if not exists (select 1 from storage.buckets where id = 'archive-uploads') then
    raise exception 'storage bucket archive-uploads does not exist (expected: private incoming uploads)';
  end if;
  if not exists (select 1 from storage.buckets where id = 'public-records-archive') then
    raise exception 'storage bucket public-records-archive does not exist (expected: public published archive)';
  end if;
  if not exists (select 1 from storage.buckets where id = 'request-templates') then
    raise exception 'storage bucket request-templates does not exist';
  end if;

  -- Named-policy existence checks only — never creates, renames, or alters
  -- a policy. These are the live policy names given for this task; if they
  -- differ from what is actually live, correct the literals here rather
  -- than assuming this guess is authoritative.
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'archive_uploads_county_insert'
  ) then
    raise exception 'expected storage.objects policy archive_uploads_county_insert was not found';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'archive_uploads_county_select'
  ) then
    raise exception 'expected storage.objects policy archive_uploads_county_select was not found';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'archive_uploads_county_update'
  ) then
    raise exception 'expected storage.objects policy archive_uploads_county_update was not found';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'archive_uploads_county_delete'
  ) then
    raise exception 'expected storage.objects policy archive_uploads_county_delete was not found';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'public_records_archive_admin_insert'
  ) then
    raise exception 'expected storage.objects policy public_records_archive_admin_insert was not found';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'public_records_archive_admin_update'
  ) then
    raise exception 'expected storage.objects policy public_records_archive_admin_update was not found';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'public_records_archive_admin_delete'
  ) then
    raise exception 'expected storage.objects policy public_records_archive_admin_delete was not found';
  end if;

  perform id, county_id, created_by, object_kind, storage_bucket, storage_path, mime_type,
    size_bytes, sha256_hex, visibility, status, original_filename, verified_by, verified_at, created_at
  from public.evidence_objects
  where false;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. records_request_goal_links.public_description,
--    records_request_goal_templates.default_tier
-- ---------------------------------------------------------------------------

alter table public.records_request_goal_links add column if not exists public_description text;

-- Surfaced in the admin Goal Templates table (Default tier column) so a
-- cloned goal can be pre-assigned a tier without a separate edit step.
alter table public.records_request_goal_templates add column if not exists default_tier integer;

-- Enforced in both the UI (goal edit popout) and here: a locked goal must
-- carry a non-blank, non-whitespace-only reason, since that reason is
-- shown publicly wherever the locked goal is displayed. locked/
-- locked_reason are pre-existing live columns (not created by any
-- migration in this repo) — only a new CHECK constraint is added here.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'county_records_request_goals_locked_reason_check'
  ) then
    alter table public.county_records_request_goals
      add constraint county_records_request_goals_locked_reason_check
      check (not locked or char_length(trim(coalesce(locked_reason, ''))) > 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'records_request_goal_templates_default_tier_check'
  ) then
    alter table public.records_request_goal_templates
      add constraint records_request_goal_templates_default_tier_check
      check (default_tier is null or default_tier between 1 and 4);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'records_request_goal_links_public_description_check'
  ) then
    alter table public.records_request_goal_links
      add constraint records_request_goal_links_public_description_check
      check (public_description is null or char_length(public_description) <= 2000);
  end if;
end
$$;

comment on column public.records_request_goal_links.public_description is
  'Optional public description of this specific resource, set only via rrg_add_goal_resource / rrg_add_external_source. Distinct from county_records_request_goals.public_summary (the goal''s own purpose), which these functions never write.';

-- ---------------------------------------------------------------------------
-- 2. Add-hosted-resource RPC (Partial by default, Complete only if asked)
-- ---------------------------------------------------------------------------

create or replace function public.rrg_add_goal_resource(
  p_goal_id bigint,
  p_object_kind text,
  p_storage_bucket text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256_hex text,
  p_original_filename text,
  p_title text,
  p_public_description text,
  p_mark_complete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_goal public.county_records_request_goals%rowtype;
  v_title text;
  v_evidence_id uuid;
  v_is_primary boolean;
  v_next_position integer;
  v_new_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  -- Lock the goal row first so two concurrent additions for the same
  -- goal serialize rather than racing on the one-primary-link unique index.
  select * into v_goal
  from public.county_records_request_goals
  where id = p_goal_id
  for update;

  if not found then
    raise exception 'Goal not found.' using errcode = 'P0002';
  end if;

  -- Authorization is re-derived from the locked goal row itself, never
  -- inferred from the Edge Function's prior check.
  if not public.rrg_can_manage_county(v_goal.county_id) then
    raise exception 'Not authorized to add a resource to this goal.' using errcode = '42501';
  end if;

  if v_goal.status in ('draft', 'retired') then
    raise exception 'This goal is not in a state that can receive resources.' using errcode = '42501';
  end if;

  if v_goal.locked then
    raise exception 'This goal is locked and cannot receive resources.' using errcode = '42501';
  end if;

  if v_goal.government_entity_id is null then
    raise exception 'This goal has no linked government entity.' using errcode = '42501';
  end if;

  if p_object_kind not in ('responsive_record', 'correspondence') then
    raise exception 'Unsupported document type for a goal resource.' using errcode = '22023';
  end if;

  if p_storage_bucket is distinct from 'public-records-archive' then
    raise exception 'Hosted resources must be stored in the public-records-archive bucket.' using errcode = '42501';
  end if;

  if p_storage_path !~ (
    '^counties/' || v_goal.county_id::text
    || '/entities/' || v_goal.government_entity_id::text
    || '/goals/' || v_goal.id::text
    || '/[^/]+$'
  ) then
    raise exception 'The storage path does not match this goal''s authorized location.' using errcode = '42501';
  end if;

  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 52428800 then
    raise exception 'The document size is outside the allowed range.' using errcode = '22023';
  end if;

  if p_sha256_hex !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid sha256 hash is required.' using errcode = '22023';
  end if;

  if p_mime_type not in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'message/rfc822',
    'text/csv',
    'text/plain'
  ) then
    raise exception 'Unsupported document MIME type.' using errcode = '22023';
  end if;

  if p_original_filename is not null and char_length(p_original_filename) > 255 then
    raise exception 'The original filename is too long to record.' using errcode = '22023';
  end if;

  v_title := trim(p_title);
  if v_title is null or char_length(v_title) = 0 or char_length(v_title) > 200 then
    raise exception 'A document title (1-200 characters) is required.' using errcode = '22023';
  end if;

  if p_public_description is not null and char_length(p_public_description) > 2000 then
    raise exception 'The public description must be 2000 characters or fewer.' using errcode = '22023';
  end if;

  insert into public.evidence_objects (
    county_id, object_kind, storage_bucket, storage_path, mime_type, size_bytes, sha256_hex,
    original_filename, visibility, status, created_by, verified_by, verified_at
  ) values (
    v_goal.county_id, p_object_kind, p_storage_bucket, p_storage_path, p_mime_type, p_size_bytes, p_sha256_hex,
    p_original_filename, 'public', 'published', v_uid, v_uid, now()
  )
  returning id into v_evidence_id;

  select coalesce(max(position) + 1, 0) into v_next_position
  from public.records_request_goal_links
  where goal_id = v_goal.id;

  select not exists (
    select 1 from public.records_request_goal_links
    where goal_id = v_goal.id and is_primary
  ) into v_is_primary;

  insert into public.records_request_goal_links (
    goal_id, label, evidence_object_id, public_description, position, is_primary, created_by
  ) values (
    v_goal.id, v_title, v_evidence_id,
    nullif(trim(coalesce(p_public_description, '')), ''),
    v_next_position, v_is_primary, v_uid
  );

  -- Partial by default (goal.status = 'received'), Complete only when
  -- explicitly requested. A goal already 'published' is never downgraded
  -- by a later default (Partial) resource add.
  if p_mark_complete then
    v_new_status := 'published';
  elsif v_goal.status <> 'published' then
    v_new_status := 'received';
  else
    v_new_status := v_goal.status;
  end if;

  -- Publishing a hosted resource implies the goal itself is meant to be
  -- publicly discoverable — is_public is set atomically alongside status so
  -- a public Storage object is never left attached to an invisible private
  -- goal.
  update public.county_records_request_goals
  set status = v_new_status, is_public = true
  where id = v_goal.id;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid, v_goal.county_id, 'goal_resource_added', 'county_records_request_goals', v_goal.id::text,
    jsonb_build_object(
      'goal_id', v_goal.id, 'evidence_id', v_evidence_id, 'object_kind', p_object_kind,
      'previous_is_public', v_goal.is_public, 'new_is_public', true
    )
  );

  if p_mark_complete then
    insert into public.security_audit_events (
      actor_user_id, county_id, event_type, target_table, target_id, event_data
    ) values (
      v_uid, v_goal.county_id, 'goal_marked_complete', 'county_records_request_goals', v_goal.id::text,
      jsonb_build_object('goal_id', v_goal.id)
    );
  end if;

  return jsonb_build_object('evidence_id', v_evidence_id, 'goal_id', v_goal.id, 'is_primary', v_is_primary, 'goal_status', v_new_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Add-external-source RPC (same Partial/Complete semantics)
-- ---------------------------------------------------------------------------

create or replace function public.rrg_add_external_source(
  p_goal_id bigint,
  p_label text,
  p_external_url text,
  p_public_description text,
  p_mark_complete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_goal public.county_records_request_goals%rowtype;
  v_label text;
  v_authority text;
  v_host text;
  v_is_primary boolean;
  v_next_position integer;
  v_new_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  select * into v_goal
  from public.county_records_request_goals
  where id = p_goal_id
  for update;

  if not found then
    raise exception 'Goal not found.' using errcode = 'P0002';
  end if;

  if not public.rrg_can_manage_county(v_goal.county_id) then
    raise exception 'Not authorized to add a resource to this goal.' using errcode = '42501';
  end if;

  if v_goal.status in ('draft', 'retired') then
    raise exception 'This goal is not in a state that can receive resources.' using errcode = '42501';
  end if;

  if v_goal.locked then
    raise exception 'This goal is locked and cannot receive resources.' using errcode = '42501';
  end if;

  v_label := trim(p_label);
  if v_label is null or char_length(v_label) = 0 or char_length(v_label) > 200 then
    raise exception 'A label (1-200 characters) is required.' using errcode = '22023';
  end if;

  if p_public_description is not null and char_length(p_public_description) > 2000 then
    raise exception 'The public description must be 2000 characters or fewer.' using errcode = '22023';
  end if;

  -- HTTPS only, no embedded credentials, no IP-literal or internal host.
  -- Never trust a client-side startsWith("https://") check alone.
  --
  -- Rather than attempt incomplete IPv4/IPv6 private-range parsing (which
  -- can never enumerate every private/reserved/link-local/cloud-metadata
  -- range correctly), this rejects ALL IP literals outright and requires a
  -- conventional multi-label public DNS hostname instead. Punycode
  -- hostnames (xn--...) are ordinary ASCII labels and pass through
  -- unaffected; ordinary public destinations (e.g. muckrock.com,
  -- murfreesborotn.gov) are unaffected.
  if p_external_url is null or p_external_url !~ '^https://[^/@[:space:]]+' then
    raise exception 'A valid HTTPS URL is required.' using errcode = '22023';
  end if;

  v_authority := regexp_replace(p_external_url, '^https://([^/?#]+).*$', '\1');
  if v_authority ~ '@' then
    raise exception 'The URL may not include embedded credentials.' using errcode = '22023';
  end if;

  -- IPv6 literals are written in brackets in a URL authority (e.g. [::1] or
  -- [2001:db8::1]:443). A conventional DNS hostname never begins with '[',
  -- so this is rejected outright rather than partially parsed.
  if v_authority ~ '^\[' then
    raise exception 'IP-address destinations are not an allowed public web address.' using errcode = '22023';
  end if;

  v_host := lower(regexp_replace(v_authority, ':[0-9]+$', ''));

  if v_host ~ '[[:space:][:cntrl:]]' then
    raise exception 'The destination host contains invalid characters.' using errcode = '22023';
  end if;

  -- IPv4 literals — any address, public or private — are rejected outright.
  if v_host ~ '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' then
    raise exception 'IP-address destinations are not an allowed public web address.' using errcode = '22023';
  end if;

  if v_host = '' or v_host = 'localhost' or v_host !~ '\.' then
    raise exception 'A conventional public hostname is required.' using errcode = '22023';
  end if;

  if v_host ~ '\.local$'
    or v_host ~ '\.localhost$'
    or v_host ~ '\.internal$'
    or v_host ~ '\.test$'
    or v_host ~ '\.invalid$'
  then
    raise exception 'This destination is not an allowed public web address.' using errcode = '22023';
  end if;

  select coalesce(max(position) + 1, 0) into v_next_position
  from public.records_request_goal_links
  where goal_id = v_goal.id;

  select not exists (
    select 1 from public.records_request_goal_links
    where goal_id = v_goal.id and is_primary
  ) into v_is_primary;

  insert into public.records_request_goal_links (
    goal_id, label, external_url, public_description, position, is_primary, created_by
  ) values (
    v_goal.id, v_label, p_external_url,
    nullif(trim(coalesce(p_public_description, '')), ''),
    v_next_position, v_is_primary, v_uid
  );

  if p_mark_complete then
    v_new_status := 'published';
  elsif v_goal.status <> 'published' then
    v_new_status := 'received';
  else
    v_new_status := v_goal.status;
  end if;

  update public.county_records_request_goals
  set status = v_new_status, is_public = true
  where id = v_goal.id;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid, v_goal.county_id, 'goal_external_source_added', 'county_records_request_goals', v_goal.id::text,
    jsonb_build_object(
      'goal_id', v_goal.id, 'host', v_host,
      'previous_is_public', v_goal.is_public, 'new_is_public', true
    )
  );

  if p_mark_complete then
    insert into public.security_audit_events (
      actor_user_id, county_id, event_type, target_table, target_id, event_data
    ) values (
      v_uid, v_goal.county_id, 'goal_marked_complete', 'county_records_request_goals', v_goal.id::text,
      jsonb_build_object('goal_id', v_goal.id)
    );
  end if;

  return jsonb_build_object('goal_id', v_goal.id, 'is_primary', v_is_primary, 'goal_status', v_new_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3b. Explicit Complete/Partial completion-state RPC
-- ---------------------------------------------------------------------------

-- Replaces the frontend's previous direct
-- `.from('county_records_request_goals').update({status: ...})` call.
-- Unlike rrg_add_goal_resource/rrg_add_external_source (which only ever
-- raise a goal from Partial to Complete as a side effect of adding a
-- resource, and never downgrade an already-published goal), this is an
-- explicit operator action and so MAY deliberately move a goal from
-- Complete back to Partial. It never adds, removes, or touches a resource
-- or evidence row itself.
create or replace function public.rrg_set_goal_completion(p_goal_id bigint, p_complete boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_goal public.county_records_request_goals%rowtype;
  v_qualifying_count bigint;
  v_previous_status text;
  v_new_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  select * into v_goal
  from public.county_records_request_goals
  where id = p_goal_id
  for update;

  if not found then
    raise exception 'Goal not found.' using errcode = 'P0002';
  end if;

  if not public.rrg_can_manage_county(v_goal.county_id) then
    raise exception 'Not authorized to change this goal''s completion state.' using errcode = '42501';
  end if;

  if v_goal.status in ('draft', 'retired') then
    raise exception 'This goal is not in a state that can be marked Complete or Partial.' using errcode = '42501';
  end if;

  if v_goal.locked then
    raise exception 'This goal is locked.' using errcode = '42501';
  end if;

  v_previous_status := v_goal.status;

  if p_complete then
    -- The same qualifying-resource definition used by the public archive
    -- gate (external HTTPS link, or hosted evidence that is itself public/
    -- published/non-submitted_request/in an allowed bucket) — a goal can
    -- never be marked Complete with nothing publicly showable.
    select count(*) into v_qualifying_count
    from public.records_request_goal_links as link
    left join public.evidence_objects as evidence on evidence.id = link.evidence_object_id
    where link.goal_id = v_goal.id
      and (
        (link.evidence_object_id is null and link.external_url is not null and link.external_url ~ '^https://')
        or (
          link.evidence_object_id is not null
          and evidence.id is not null
          and evidence.visibility = 'public'
          and evidence.status = 'published'
          and evidence.object_kind <> 'submitted_request'
          and evidence.storage_bucket = any(array['public-records-archive', 'request-templates'])
        )
      );

    if v_qualifying_count = 0 then
      raise exception 'At least one qualifying public resource is required before marking this goal Complete.' using errcode = '42501';
    end if;

    v_new_status := 'published';
  else
    v_new_status := 'received';
  end if;

  update public.county_records_request_goals
  set status = v_new_status
  where id = v_goal.id;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid, v_goal.county_id, 'goal_completion_state_changed', 'county_records_request_goals', v_goal.id::text,
    jsonb_build_object('goal_id', v_goal.id, 'previous_status', v_previous_status, 'new_status', v_new_status)
  );

  return jsonb_build_object('goal_id', v_goal.id, 'previous_status', v_previous_status, 'new_status', v_new_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Cleanup-failure audit logging RPC
-- ---------------------------------------------------------------------------

create or replace function public.rrg_log_goal_evidence_cleanup_failure(
  p_goal_id bigint,
  p_storage_bucket text,
  p_storage_path text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_goal public.county_records_request_goals%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  select * into v_goal from public.county_records_request_goals where id = p_goal_id;
  if not found then
    raise exception 'Goal not found.' using errcode = 'P0002';
  end if;

  if not public.rrg_can_manage_county(v_goal.county_id) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid,
    v_goal.county_id,
    'goal_evidence_cleanup_failed',
    'county_records_request_goals',
    p_goal_id::text,
    jsonb_build_object('storage_bucket', p_storage_bucket, 'storage_path', p_storage_path, 'reason', p_reason)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. County-contacts admin RPC
-- ---------------------------------------------------------------------------

-- Server-side paginated, filtered, sorted — never fetches all contacts
-- into the browser and hides the excess client-side. p_page_size is hard-
-- clamped to [1, 100] regardless of what is requested. Still exposes only
-- the same explicit allowlist as before; RLS on county_contacts itself is
-- never broadened.
create or replace function public.rrg_admin_list_county_contacts(
  p_search text default null,
  p_county_id bigint default null,
  p_sort text default 'county',
  p_sort_direction text default 'asc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  county_id bigint,
  county_name text,
  email text,
  phone text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.portal_accounts as admin_account
    where admin_account.user_id = auth.uid()
      and admin_account.role = 'admin'
      and admin_account.status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
    select
      contact.county_id,
      county.name,
      contact.email,
      contact.phone,
      contact.created_at,
      count(*) over() as total_count
    from public.county_contacts as contact
    left join public.counties as county on county.id = contact.county_id
    where (p_county_id is null or contact.county_id = p_county_id)
      and (
        v_search is null
        or county.name ilike '%' || v_search || '%'
        or contact.email ilike '%' || v_search || '%'
        or contact.phone ilike '%' || v_search || '%'
      )
    order by
      case when p_sort = 'county' and p_sort_direction = 'asc' then county.name end asc,
      case when p_sort = 'county' and p_sort_direction = 'desc' then county.name end desc,
      case when p_sort = 'email' and p_sort_direction = 'asc' then contact.email end asc,
      case when p_sort = 'email' and p_sort_direction = 'desc' then contact.email end desc,
      case when p_sort = 'created_at' and p_sort_direction = 'asc' then contact.created_at end asc,
      case when p_sort = 'created_at' and p_sort_direction = 'desc' then contact.created_at end desc,
      county.name asc,
      contact.created_at desc
    limit v_page_size
    offset (v_page - 1) * v_page_size;
end;
$$;

comment on function public.rrg_admin_list_county_contacts(text, bigint, text, text, integer, integer) is
  'Admin-only. Server-side paginated (hard max 100/page), filtered, sorted list of county_contacts. Never queries county_contacts directly from the frontend and never broadens its RLS. total_count reflects the full filtered result set, not just the returned page.';

-- ---------------------------------------------------------------------------
-- 6. Goal-first public archive RPCs
-- ---------------------------------------------------------------------------

-- Deliberately narrower than rrg_goal_is_public (which also allows
-- is_public goals in 'profile_needed'/'ready'/'requested'/'unavailable' —
-- states with no resources to show). A goal only qualifies for the public
-- archive once it holds status 'received' (Partial) or 'published'
-- (Complete) AND has at least one qualifying resource — an external HTTPS
-- link, or hosted evidence that is itself public/published/non-
-- submitted_request/in an allowed bucket. resource_count reflects only
-- qualifying resources, never the raw link count (which could otherwise
-- leak the existence/number of private or unpublished attachments).
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
      (link.evidence_object_id is null and link.external_url is not null and link.external_url ~ '^https://')
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
    goal.id as goal_id,
    goal.title,
    goal.public_summary,
    county.name as county,
    entity.display_name as government_entity,
    goal.tier,
    case when goal.status = 'published' then 'Complete' else 'Partial' end as completion_state,
    count(ql.link_id) as resource_count,
    goal.updated_at
  from public.county_records_request_goals as goal
  join qualifying_links as ql on ql.goal_id = goal.id
  left join public.counties as county on county.id = goal.county_id
  left join public.government_entities as entity on entity.id = goal.government_entity_id
  where goal.is_public = true
    and goal.status in ('received', 'published')
  group by goal.id, goal.title, goal.public_summary, county.name, entity.display_name, goal.tier, goal.status, goal.updated_at
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
  select * into v_goal from public.county_records_request_goals where id = p_goal_id;
  if not found then
    return null;
  end if;

  -- Same status/is_public gate as get_public_archive_goals: a goal only
  -- becomes individually viewable once it's public AND holds status
  -- 'received'/'published' — never the broader rrg_goal_is_public set.
  if not v_goal.is_public or v_goal.status not in ('received', 'published') then
    return null;
  end if;

  select county.name into v_county_name from public.counties as county where county.id = v_goal.county_id;
  select entity.display_name into v_entity_name from public.government_entities as entity where entity.id = v_goal.government_entity_id;

  select coalesce(jsonb_agg(resource order by sort_key asc), '[]'::jsonb) into v_resources
  from (
    select jsonb_build_object(
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
        else null
      end,
      'created_at', link.created_at,
      'uploaded_by', coalesce(uploader_label.label, case when link.evidence_object_id is not null then 'Not recorded' else null end),
      'reviewed_by', coalesce(reviewer_label.label, case when link.evidence_object_id is not null then 'Not recorded' else null end)
    ) as resource,
    lpad(link.position::text, 10, '0') as sort_key
    from public.records_request_goal_links as link
    left join public.evidence_objects as evidence
      on evidence.id = link.evidence_object_id
      and evidence.visibility = 'public'
      and evidence.status = 'published'
      and evidence.object_kind <> 'submitted_request'
      and evidence.storage_bucket = any(array['public-records-archive', 'request-templates'])
    left join lateral (
      select case
        when uploader_account.role = 'admin' then 'Administrator'
        when uploader_account.role = 'chapter_master' then coalesce(uploader_county.name, 'County') || ' Chapter Master'
      end as label
      from public.portal_accounts as uploader_account
      left join public.counties as uploader_county on uploader_county.id = uploader_account.county_id
      where uploader_account.user_id = evidence.created_by
    ) as uploader_label on true
    left join lateral (
      select case
        when reviewer_account.role = 'admin' then 'Administrator'
        when reviewer_account.role = 'chapter_master' then coalesce(reviewer_county.name, 'County') || ' Chapter Master'
      end as label
      from public.portal_accounts as reviewer_account
      left join public.counties as reviewer_county on reviewer_county.id = reviewer_account.county_id
      where reviewer_account.user_id = evidence.verified_by
    ) as reviewer_label on true
    where link.goal_id = p_goal_id
      -- A hosted link only appears once its evidence independently passes
      -- every public-suitability gate; an external link needs no evidence
      -- row at all. A hosted link whose evidence fails the gate (private,
      -- unpublished, quarantined, wrong bucket, submitted_request) is
      -- silently excluded rather than exposing any hint of its existence.
      and (link.evidence_object_id is null or evidence.id is not null)
    order by link.position
  ) as ordered_resources;

  -- Consistent with get_public_archive_goals: a goal with zero qualifying
  -- resources is not individually viewable either, even if it is public
  -- and in a qualifying status.
  if jsonb_array_length(v_resources) = 0 then
    return null;
  end if;

  return jsonb_build_object(
    'goal_id', v_goal.id,
    'title', v_goal.title,
    'public_summary', v_goal.public_summary,
    'county', v_county_name,
    'government_entity', v_entity_name,
    'tier', v_goal.tier,
    'completion_state', case when v_goal.status = 'published' then 'Complete' else 'Partial' end,
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
      -- Requires linkage through a public goal that is itself 'received'
      -- or 'published' — the same narrower gate used by
      -- get_public_archive_goals/get_public_archive_goal, not the broader
      -- rrg_goal_is_public set.
      and goal.is_public = true
      and goal.status in ('received', 'published')
      and evidence.visibility = 'public'
      and evidence.status = 'published'
      and evidence.object_kind <> 'submitted_request'
      and evidence.storage_bucket = any(array['public-records-archive', 'request-templates'])
  ),
  representative as (
    select distinct on (evidence_id)
      evidence_id, object_kind, upload_date, created_by, verified_by,
      mime_type, original_filename, storage_bucket, storage_path,
      label, public_description, county_name, entity_name
    from qualifying
    order by evidence_id, goal_id, link_id
  ),
  goal_titles_agg as (
    select evidence_id, array_agg(distinct goal_title order by goal_title) as goal_titles
    from qualifying
    group by evidence_id
  )
  select
    representative.evidence_id,
    representative.label as title,
    case representative.object_kind
      when 'correspondence' then 'Response email'
      when 'responsive_record' then 'Evidence'
      when 'base_pdf' then 'Template'
      when 'continuation_pdf' then 'Template'
      else 'Evidence'
    end as document_type,
    representative.county_name as county,
    representative.entity_name as government_entity,
    goal_titles_agg.goal_titles,
    representative.public_description,
    representative.upload_date,
    coalesce(uploader_label.label, 'Not recorded') as uploaded_by,
    coalesce(reviewer_label.label, 'Not recorded') as reviewed_by,
    representative.mime_type,
    representative.original_filename,
    representative.storage_bucket,
    representative.storage_path
  from representative
  join goal_titles_agg using (evidence_id)
  left join lateral (
    select case
      when uploader_account.role = 'admin' then 'Administrator'
      when uploader_account.role = 'chapter_master' then coalesce(uploader_county.name, 'County') || ' Chapter Master'
    end as label
    from public.portal_accounts as uploader_account
    left join public.counties as uploader_county on uploader_county.id = uploader_account.county_id
    where uploader_account.user_id = representative.created_by
  ) as uploader_label on true
  left join lateral (
    select case
      when reviewer_account.role = 'admin' then 'Administrator'
      when reviewer_account.role = 'chapter_master' then coalesce(reviewer_county.name, 'County') || ' Chapter Master'
    end as label
    from public.portal_accounts as reviewer_account
    left join public.counties as reviewer_county on reviewer_county.id = reviewer_account.county_id
    where reviewer_account.user_id = representative.verified_by
  ) as reviewer_label on true
  limit 1;
$$;

comment on function public.get_public_archive_goals() is
  'Public (anon+authenticated). One row per public goal with status received (Partial) or published (Complete) AND at least one qualifying resource (external HTTPS link, or hosted evidence independently passing every public-suitability gate). resource_count reflects only qualifying resources. Never exposes fill_payload or generated request language.';

comment on function public.get_public_archive_goal(bigint) is
  'Public (anon+authenticated). Returns the goal header plus its ordered (by position) hosted+external resources as one jsonb object, or null if the goal is not public, not received/published, or has zero qualifying resources. A hosted resource is included only if its evidence independently passes every public-suitability gate; nothing about an excluded resource is exposed.';

comment on function public.get_public_archive_document(uuid) is
  'Public (anon+authenticated). Resolves one hosted document''s storage location from an evidence id alone, requiring linkage through a public goal with status received or published — never accepts a bucket/path from the caller. Returns zero rows (never a distinguishable error) for any id that fails any gate.';

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.rrg_add_goal_resource(bigint, text, text, text, text, bigint, text, text, text, text, boolean)',
    'public.rrg_add_external_source(bigint, text, text, text, boolean)',
    'public.rrg_set_goal_completion(bigint, boolean)',
    'public.rrg_log_goal_evidence_cleanup_failure(bigint, text, text, text)',
    'public.rrg_admin_list_county_contacts(text, bigint, text, text, integer, integer)'
  ]
  loop
    execute format('revoke all on function %s from public;', fn);
    execute format('revoke all on function %s from anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;

  foreach fn in array array[
    'public.get_public_archive_goals()',
    'public.get_public_archive_goal(bigint)',
    'public.get_public_archive_document(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public;', fn);
    execute format('grant execute on function %s to anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- 8. One-result Supabase verification
-- ---------------------------------------------------------------------------

select jsonb_build_object(
  'public_description_column_exists', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records_request_goal_links' and column_name = 'public_description'
  ),
  'default_tier_column_exists', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records_request_goal_templates' and column_name = 'default_tier'
  ),
  'locked_reason_check_exists', exists (
    select 1 from pg_constraint where conname = 'county_records_request_goals_locked_reason_check'
  ),
  'rrg_add_goal_resource_exists', to_regprocedure(
    'public.rrg_add_goal_resource(bigint, text, text, text, text, bigint, text, text, text, text, boolean)'
  ) is not null,
  'rrg_add_external_source_exists', to_regprocedure(
    'public.rrg_add_external_source(bigint, text, text, text, boolean)'
  ) is not null,
  'rrg_set_goal_completion_exists', to_regprocedure(
    'public.rrg_set_goal_completion(bigint, boolean)'
  ) is not null,
  'get_public_archive_goals_exists', to_regprocedure('public.get_public_archive_goals()') is not null,
  'get_public_archive_goal_exists', to_regprocedure('public.get_public_archive_goal(bigint)') is not null,
  'get_public_archive_document_exists', to_regprocedure('public.get_public_archive_document(uuid)') is not null
) as goal_completion_and_public_archive_migration;
