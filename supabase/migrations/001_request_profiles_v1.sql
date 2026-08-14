begin;

create type public.request_profile_status as enum (
  'draft',
  'in_review',
  'verified',
  'retired'
);

create type public.request_template_family as enum (
  'municipal_form',
  'municipal_letter',
  'tennessee_model'
);

create type public.request_renderer_type as enum (
  'acroform',
  'overlay',
  'generated_letter'
);

create type public.request_eligibility_mode as enum (
  'not_stated',
  'residency_required',
  'citizenship_required',
  'conditional',
  'other',
  'unknown'
);

create type public.request_form_mode as enum (
  'not_required',
  'optional',
  'required',
  'portal_only',
  'unknown'
);

create table public.request_profiles (
  id uuid primary key default gen_random_uuid(),
  government_entity_id uuid not null
    references public.government_entities(id) on delete restrict,
  version integer not null check (version >= 1),
  schema_version integer not null default 1 check (schema_version = 1),
  status public.request_profile_status not null default 'draft',

  effective_from date,
  effective_to date,
  policy_source_url text not null,
  archived_policy_object_id uuid
    references public.evidence_objects(id) on delete restrict,
  policy_summary text,

  eligibility_mode public.request_eligibility_mode not null default 'unknown',
  eligibility_jurisdiction text,
  eligibility_explanation text,
  form_mode public.request_form_mode not null default 'unknown',
  form_explanation text,
  fee_rule text,
  aggregation_rule text,
  submission_instructions text,

  template_family public.request_template_family not null,
  renderer_type public.request_renderer_type not null,
  base_pdf_object_id uuid
    references public.evidence_objects(id) on delete restrict,
  continuation_profile_id uuid,
  field_schema jsonb not null default '{}'::jsonb,
  template_schema jsonb not null default '{}'::jsonb,
  validation_schema jsonb not null default '{}'::jsonb,
  output_options jsonb not null default '{}'::jsonb,

  verified_by uuid references public.portal_accounts(id) on delete restrict,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint request_profiles_entity_version_unique
    unique (government_entity_id, version),
  constraint request_profiles_effective_range_valid
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint request_profiles_verified_metadata_required
    check (
      status <> 'verified'
      or (verified_by is not null and verified_at is not null)
    ),
  constraint request_profiles_base_pdf_matches_renderer
    check (
      (renderer_type in ('acroform', 'overlay') and base_pdf_object_id is not null)
      or (renderer_type = 'generated_letter' and base_pdf_object_id is null)
    ),
  constraint request_profiles_json_objects_only
    check (
      jsonb_typeof(field_schema) = 'object'
      and jsonb_typeof(template_schema) = 'object'
      and jsonb_typeof(validation_schema) = 'object'
      and jsonb_typeof(output_options) = 'object'
    ),
  constraint request_profiles_no_self_continuation
    check (continuation_profile_id is null or continuation_profile_id <> id)
);

alter table public.request_profiles
  add constraint request_profiles_continuation_profile_fk
  foreign key (continuation_profile_id)
  references public.request_profiles(id)
  on delete restrict;

create index request_profiles_entity_status_effective_idx
  on public.request_profiles (government_entity_id, status, effective_from, effective_to);

create index request_profiles_continuation_idx
  on public.request_profiles (continuation_profile_id)
  where continuation_profile_id is not null;

comment on table public.request_profiles is
  'Immutable after verification. Corrections create a new entity-scoped version.';

alter table public.request_profiles enable row level security;
alter table public.request_profiles force row level security;

revoke all on table public.request_profiles from anon, authenticated;
grant select on table public.request_profiles to anon, authenticated;

create policy request_profiles_read_current_verified
on public.request_profiles
for select
to anon, authenticated
using (
  status = 'verified'
  and (effective_from is null or effective_from <= current_date)
  and (effective_to is null or effective_to >= current_date)
);

-- Intentionally no client INSERT, UPDATE, or DELETE policies in this portable
-- migration. Add write policies only after binding them to the project's
-- existing portal_accounts county, role, and suspension checks. Verification
-- and retirement should be performed by narrow security-definer RPCs that
-- also append security_audit_events.

commit;
