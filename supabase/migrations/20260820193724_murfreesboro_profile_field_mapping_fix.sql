-- Flock Block Tennessee
-- Fix the two Murfreesboro request-profile field mappings (City government
-- entity 4, profile 56edbf40-ee40-40b9-bba3-d522cd6550cf; Police entity 5,
-- profile 10dc495d-417d-4027-8ac4-4cb9fbd5b966) and calibrate the approved
-- fill_payload for the already-unlocked Murfreesboro goals that use them.
--
-- Preconditions:
--   - Both profiles remain status = 'draft' before and after this patch.
--     This migration never sets status, verified_by, or verified_at.
--   - Both profiles keep their existing base_pdf_object_id (the archived
--     evidence rows are not touched or re-verified here).
--   - field_schema is replaced (the derived sources it currently uses are
--     unsupported by the renderer and must be rebuilt). validation_schema
--     is NOT replaced: the live schema already carries real safeguards
--     (required_paths for records_description/delivery_method, a
--     jurisdiction-specific string_length rule, and scope_warnings with
--     maximum_record_labels/maximum_date_span_days). This migration
--     changes only validation_schema.scope_warnings.broad_mode_confirmation
--     to false via a narrow jsonb_set, preserving every other existing key
--     verbatim. Every other column (policy_summary, fee_rule,
--     eligibility_mode, submission_instructions, template_schema,
--     output_options, ...) is left untouched.
--   - Goal fill_payload updates merge only the specific request.* keys
--     listed below into the existing request object, so
--     request.records_description and any other approved keys already
--     present are preserved exactly.
--   - Every update is guarded by a precondition check against the exact
--     row identity (id/government_entity_id/status/renderer_type/
--     base_pdf_object_id for profiles; title/government_entity_id/
--     request_profile_id/locked for goals), plus a check that
--     validation_schema and validation_schema.scope_warnings are JSON
--     objects before the nested boolean is touched. A mismatch raises an
--     exception and rolls back the whole patch rather than silently
--     skipping or touching an unexpected row.
--   - Re-running this migration is safe: preconditions check stable
--     identity facts, not the current (possibly already-fixed)
--     field_schema/fill_payload contents. The validation_schema update is
--     idempotent: setting broad_mode_confirmation to false a second time
--     is a no-op.

begin;

-- ---------------------------------------------------------------------------
-- 0. Confirm the required foundation
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.request_profiles') is null then
    raise exception 'public.request_profiles does not exist';
  end if;

  if to_regclass('public.county_records_request_goals') is null then
    raise exception 'public.county_records_request_goals does not exist';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. City of Murfreesboro request profile: field_schema replaced,
--    validation_schema preserved except broad_mode_confirmation
-- ---------------------------------------------------------------------------
--
-- Source PDF: murfreesboro-city.pdf (2 pages, 40 AcroForm fields, no XFA).
-- Replaces unsupported derived sources (request.delivery_is_*,
-- request.has_department_or_division, request.has_record_category_label)
-- with mappings the existing renderer actually supports. "Other" is
-- intentionally left unmapped: it is a genuine free-scope checkbox that no
-- current approved payload requires. Identity, citizenship, signature, and
-- request-date fields (First Name and Last Name, Email, Phone,
-- Address/City/State/Zip, Yes/No citizenship, Signature of Requestor,
-- Date mm/dd/yyyy) are not present in field_schema at all, so the renderer
-- leaves them blank and editable. Text field max_length values match the
-- live source PDF's field constraints.

do $$
declare
  v_count integer;
  v_validation_schema jsonb;
begin
  select count(*) into v_count
  from public.request_profiles
  where id = '56edbf40-ee40-40b9-bba3-d522cd6550cf'
    and government_entity_id = 4
    and status = 'draft'
    and renderer_type = 'acroform'
    and base_pdf_object_id = '28bc3e20-31b1-41b1-bd1b-87e7c73aa2af';

  if v_count <> 1 then
    raise exception
      'Precondition failed: Murfreesboro City request profile 56edbf40-ee40-40b9-bba3-d522cd6550cf was not found as a draft acroform profile for entity 4 with base_pdf_object_id 28bc3e20-31b1-41b1-bd1b-87e7c73aa2af (found % matching rows). Aborting rather than updating an unexpected profile.',
      v_count;
  end if;

  select validation_schema into v_validation_schema
  from public.request_profiles
  where id = '56edbf40-ee40-40b9-bba3-d522cd6550cf';

  if jsonb_typeof(v_validation_schema) <> 'object' then
    raise exception
      'Precondition failed: City validation_schema is not a JSON object; refusing to modify it.';
  end if;

  if jsonb_typeof(v_validation_schema -> 'scope_warnings') <> 'object' then
    raise exception
      'Precondition failed: City validation_schema.scope_warnings is not a JSON object; refusing to modify it.';
  end if;

  update public.request_profiles
  set
    field_schema = jsonb_build_object(
      'schema_version', 1,
      'renderer_type', 'acroform',
      'fields', jsonb_build_array(
        jsonb_build_object('source', 'request.delivery_method', 'pdf_field', 'Electronic Copy', 'kind', 'checkbox', 'required', true, 'option_value', 'electronic'),
        jsonb_build_object('source', 'request.delivery_method', 'pdf_field', 'OnSite Pickup Copy', 'kind', 'checkbox', 'required', true, 'option_value', 'onsite_pickup'),
        jsonb_build_object('source', 'request.delivery_method', 'pdf_field', 'USPS First Class Mail Copy', 'kind', 'checkbox', 'required', true, 'option_value', 'usps_mail'),
        jsonb_build_object('source', 'request.delivery_method', 'pdf_field', 'Inspection Only  No copies The TPRA does not permit fees or require a written request for', 'kind', 'checkbox', 'required', true, 'option_value', 'inspection'),
        jsonb_build_object('source', 'request.department_or_division', 'pdf_field', 'Purchasing', 'kind', 'checkbox', 'required', false, 'option_value', 'Purchasing'),
        jsonb_build_object('source', 'request.department_or_division', 'pdf_field', 'Type Dept', 'kind', 'text', 'required', false, 'max_length', 200),
        jsonb_build_object('source', 'request.records_description', 'pdf_field', 'Description of Request', 'kind', 'text', 'required', true, 'multiline', true, 'max_length', 12000)
      )
    ),
    -- Narrow update: preserve required_paths, rules (including the
    -- City-specific records_description string_length rule), and every
    -- scope_warnings key except broad_mode_confirmation, which is turned
    -- off because the site has no input through which a requester could
    -- supply that confirmation for these intentionally curated,
    -- no-date-range current-contract requests.
    validation_schema = jsonb_set(
      validation_schema,
      '{scope_warnings,broad_mode_confirmation}',
      'false'::jsonb,
      true
    ),
    updated_at = now()
  where id = '56edbf40-ee40-40b9-bba3-d522cd6550cf';
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Murfreesboro Police Department request profile: field_schema
--    replaced, validation_schema preserved except broad_mode_confirmation
-- ---------------------------------------------------------------------------
--
-- Source PDF: murfreesboro-police.pdf (2 pages, 36 AcroForm fields, no
-- XFA). "Other" is mapped to record_category_label = "Contracts" (the only
-- approved category value used today); "Other Records" is the free-text
-- description of that category. "Date of Event" only receives a value when
-- an approved date is present (field is not required). Identity,
-- citizenship, signature, and request-date fields (First Name and Last
-- Name, Email, Phone, Address/City/State/Zip, Dept Name, Media Outlet
-- Name, Firm Name, Client, Yes/No citizenship, Check Box7-11, Time of
-- Event, Case or MPPAT Number, Location of Incident, Name of Officers
-- involved, Date (mm/dd/yyyy)) are not present in field_schema, so the
-- renderer leaves them blank and editable. Text field max_length values
-- match the live source PDF's field constraints.

do $$
declare
  v_count integer;
  v_validation_schema jsonb;
begin
  select count(*) into v_count
  from public.request_profiles
  where id = '10dc495d-417d-4027-8ac4-4cb9fbd5b966'
    and government_entity_id = 5
    and status = 'draft'
    and renderer_type = 'acroform'
    and base_pdf_object_id = 'fe502656-cbb9-427f-82cd-4428ecac4318';

  if v_count <> 1 then
    raise exception
      'Precondition failed: Murfreesboro Police request profile 10dc495d-417d-4027-8ac4-4cb9fbd5b966 was not found as a draft acroform profile for entity 5 with base_pdf_object_id fe502656-cbb9-427f-82cd-4428ecac4318 (found % matching rows). Aborting rather than updating an unexpected profile.',
      v_count;
  end if;

  select validation_schema into v_validation_schema
  from public.request_profiles
  where id = '10dc495d-417d-4027-8ac4-4cb9fbd5b966';

  if jsonb_typeof(v_validation_schema) <> 'object' then
    raise exception
      'Precondition failed: Police validation_schema is not a JSON object; refusing to modify it.';
  end if;

  if jsonb_typeof(v_validation_schema -> 'scope_warnings') <> 'object' then
    raise exception
      'Precondition failed: Police validation_schema.scope_warnings is not a JSON object; refusing to modify it.';
  end if;

  update public.request_profiles
  set
    field_schema = jsonb_build_object(
      'schema_version', 1,
      'renderer_type', 'acroform',
      'fields', jsonb_build_array(
        jsonb_build_object('source', 'request.delivery_method', 'pdf_field', 'Electronic Copy', 'kind', 'checkbox', 'required', true, 'option_value', 'electronic'),
        jsonb_build_object('source', 'request.delivery_method', 'pdf_field', 'OnSite Pickup Copy', 'kind', 'checkbox', 'required', true, 'option_value', 'onsite_pickup'),
        jsonb_build_object('source', 'request.delivery_method', 'pdf_field', 'USPS First Class Mail Copy', 'kind', 'checkbox', 'required', true, 'option_value', 'usps_mail'),
        jsonb_build_object('source', 'request.delivery_method', 'pdf_field', 'Inspection Only  No copies The TPRA does not permit fees or require a written request for', 'kind', 'checkbox', 'required', true, 'option_value', 'inspection'),
        jsonb_build_object('source', 'request.record_category_label', 'pdf_field', 'Other', 'kind', 'checkbox', 'required', false, 'option_value', 'Contracts'),
        jsonb_build_object('source', 'request.record_category_label', 'pdf_field', 'Other Records', 'kind', 'text', 'required', false, 'max_length', 200),
        jsonb_build_object('source', 'request.date_from_mm_dd_yyyy', 'pdf_field', 'Date of Event', 'kind', 'text', 'required', false, 'max_length', 10),
        jsonb_build_object('source', 'request.records_description', 'pdf_field', 'Request Description', 'kind', 'text', 'required', true, 'multiline', true, 'max_length', 12000)
      )
    ),
    -- Narrow update: same rationale as the City profile above. Preserves
    -- required_paths, rules (including the Police-specific
    -- records_description string_length rule), and every scope_warnings
    -- key except broad_mode_confirmation.
    validation_schema = jsonb_set(
      validation_schema,
      '{scope_warnings,broad_mode_confirmation}',
      'false'::jsonb,
      true
    ),
    updated_at = now()
  where id = '10dc495d-417d-4027-8ac4-4cb9fbd5b966';
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Calibrate approved fill_payload for the already-unlocked goals that
--    use these profiles. Each update merges only the listed keys into the
--    existing request object; request.records_description and any other
--    approved key are preserved exactly.
-- ---------------------------------------------------------------------------

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.county_records_request_goals
  where title = 'City Contract Register'
    and government_entity_id = 4
    and request_profile_id = '56edbf40-ee40-40b9-bba3-d522cd6550cf'
    and locked = false;

  if v_count <> 1 then
    raise exception
      'Precondition failed: expected exactly one unlocked "City Contract Register" goal for entity 4 linked to the city request profile (found %). Aborting rather than updating an unexpected goal.',
      v_count;
  end if;

  update public.county_records_request_goals
  set fill_payload = jsonb_set(
    fill_payload,
    '{request}',
    coalesce(fill_payload -> 'request', '{}'::jsonb)
      || jsonb_build_object('department_or_division', 'Purchasing', 'delivery_method', 'electronic')
  )
  where title = 'City Contract Register'
    and government_entity_id = 4
    and request_profile_id = '56edbf40-ee40-40b9-bba3-d522cd6550cf'
    and locked = false;
end
$$;

do $$
declare
  v_titles text[] := array[
    'Murfreesboro Police Contract Register',
    'Flock Contracts and Invoice Trail',
    'Axon Contracts and Pricing',
    'Motorola Contracts and Maintenance',
    'Leonardo / ELSAG Contracts and Invoices'
  ];
  v_title text;
  v_count integer;
begin
  foreach v_title in array v_titles loop
    select count(*) into v_count
    from public.county_records_request_goals
    where title = v_title
      and government_entity_id = 5
      and request_profile_id = '10dc495d-417d-4027-8ac4-4cb9fbd5b966'
      and locked = false;

    if v_count <> 1 then
      raise exception
        'Precondition failed: expected exactly one unlocked "%" goal for entity 5 linked to the police request profile (found %). Aborting rather than updating an unexpected goal.',
        v_title, v_count;
    end if;

    update public.county_records_request_goals
    set fill_payload = jsonb_set(
      fill_payload,
      '{request}',
      coalesce(fill_payload -> 'request', '{}'::jsonb)
        || jsonb_build_object('record_category_label', 'Contracts', 'delivery_method', 'electronic')
    )
    where title = v_title
      and government_entity_id = 5
      and request_profile_id = '10dc495d-417d-4027-8ac4-4cb9fbd5b966'
      and locked = false;
  end loop;
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- 4. One-result Supabase verification
-- ---------------------------------------------------------------------------
-- Confirms both profiles remain drafts (never verified by this patch), the
-- field_schema mapping counts match the source PDFs, broad_mode_confirmation
-- is now false, and required_paths/rules/scope_warnings siblings survived
-- the narrow update untouched.

select jsonb_build_object(
  'city_profile', (
    select jsonb_build_object(
      'status', status,
      'verified_by', verified_by,
      'verified_at', verified_at,
      'field_count', jsonb_array_length(field_schema -> 'fields'),
      'required_paths', validation_schema -> 'required_paths',
      'rule_count', jsonb_array_length(validation_schema -> 'rules'),
      'scope_warnings', validation_schema -> 'scope_warnings'
    )
    from public.request_profiles
    where id = '56edbf40-ee40-40b9-bba3-d522cd6550cf'
  ),
  'police_profile', (
    select jsonb_build_object(
      'status', status,
      'verified_by', verified_by,
      'verified_at', verified_at,
      'field_count', jsonb_array_length(field_schema -> 'fields'),
      'required_paths', validation_schema -> 'required_paths',
      'rule_count', jsonb_array_length(validation_schema -> 'rules'),
      'scope_warnings', validation_schema -> 'scope_warnings'
    )
    from public.request_profiles
    where id = '10dc495d-417d-4027-8ac4-4cb9fbd5b966'
  ),
  'calibrated_goals', (
    select jsonb_object_agg(title, fill_payload -> 'request')
    from public.county_records_request_goals
    where request_profile_id in (
      '56edbf40-ee40-40b9-bba3-d522cd6550cf',
      '10dc495d-417d-4027-8ac4-4cb9fbd5b966'
    )
  )
) as murfreesboro_profile_field_mapping_fix;
