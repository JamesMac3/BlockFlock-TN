-- Flock Block Tennessee
-- Chapter-master account lifecycle (trusted/restricted/suspended), a
-- protected forwarding-email setting, and a secured post-submission path.
--
-- Security model:
--   - portal_accounts, posts, counties, security_audit_events are all
--     pre-existing live tables with no DDL in this repo (only referenced
--     via to_regclass preconditions elsewhere). This migration adds exactly
--     one new column (portal_accounts.forwarding_email) and a set of
--     SECURITY DEFINER RPCs; it never touches posts/portal_accounts RLS,
--     which are configured live and not visible from this repo.
--   - Every account-state/forwarding-email mutation goes through an RPC
--     that re-derives authorization from the live portal_accounts row
--     server-side — never trusts a client-provided role/status/county.
--   - rrg_admin_set_account_status is the DB-only half of suspend/restore.
--     The frontend must never call it directly for a suspend/restore
--     action — only the admin-account-action Edge Function may, using the
--     acting admin's own forwarded JWT (so auth.uid() in the audit row is
--     the real admin, not a service-role identity), because only an Edge
--     Function can also call the Supabase Auth Admin API to ban/unban the
--     account. This RPC still independently re-checks admin authorization
--     inside its own body as defense in depth against being called any
--     other way.
--   - rrg_submit_post replaces the client's previous raw
--     `posts.update({status: 'approved', ...})` call. Trusted chapter
--     masters and admins publish immediately; restricted chapter masters
--     are routed to 'pending' for administrator approval. Restricted status
--     never affects goal creation/editing, request-profile preview, or
--     document uploads — only post publication.
--   - security_audit_events is used exactly as it already exists live
--     (id, actor_user_id, county_id, event_type, target_table, target_id,
--     event_data, created_at) — never created or altered here.

begin;

-- ---------------------------------------------------------------------------
-- 0. Confirm the required foundation
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.portal_accounts') is null then
    raise exception 'public.portal_accounts does not exist';
  end if;

  if to_regclass('public.posts') is null then
    raise exception 'public.posts does not exist';
  end if;

  if to_regclass('public.counties') is null then
    raise exception 'public.counties does not exist';
  end if;

  if to_regclass('public.security_audit_events') is null then
    raise exception 'public.security_audit_events does not exist; this migration requires the existing live audit table and does not create it';
  end if;

  perform actor_user_id, county_id, event_type, target_table, target_id, event_data
  from public.security_audit_events
  where false;

  -- Fails fast if the live posts shape does not match what rrg_submit_post
  -- below assumes (confirmed by reading postPayload.js/AdminPostDashboard.jsx
  -- in this repo, not guessed).
  perform id, title, county_id, status, author_user_id, submitted_at, approved_at, approved_by, rejected_at
  from public.posts
  where false;
end
$$;

-- Preflight: confirm the live posts_status_check constraint permits exactly
-- draft/pending/approved/rejected before rrg_submit_post (below) is defined
-- against that assumption. This checks the deployed constraint's actual
-- definition rather than trusting any status vocabulary invented in this
-- repo (an earlier draft of this migration wrongly assumed 'returned' and
-- 'revision_requested' were valid statuses; they are not live values).
do $$
declare
  v_condef text;
begin
  select pg_get_constraintdef(oid) into v_condef
  from pg_constraint
  where conname = 'posts_status_check' and conrelid = 'public.posts'::regclass;

  if v_condef is null then
    raise exception 'expected CHECK constraint posts_status_check on public.posts was not found; confirm the live status vocabulary before applying this migration';
  end if;

  if not (
    v_condef like '%draft%' and v_condef like '%pending%'
    and v_condef like '%approved%' and v_condef like '%rejected%'
  ) then
    raise exception 'posts_status_check does not match the expected live status set (draft, pending, approved, rejected): %', v_condef;
  end if;

  if v_condef like '%returned%' or v_condef like '%revision_requested%' then
    raise exception 'posts_status_check unexpectedly permits a status this migration does not use (returned/revision_requested): %', v_condef;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. portal_accounts.forwarding_email
-- ---------------------------------------------------------------------------

alter table public.portal_accounts add column if not exists forwarding_email text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'portal_accounts_forwarding_email_check'
  ) then
    alter table public.portal_accounts
      add constraint portal_accounts_forwarding_email_check
      check (forwarding_email is null or forwarding_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
  end if;
end
$$;

comment on column public.portal_accounts.forwarding_email is
  'Private forwarding destination for a chapter master. Never public. Readable/writable only via rrg_get_my_forwarding_email/rrg_set_my_forwarding_email (self) and rrg_admin_get/set_forwarding_email (admin) — never exposed through a raw table policy from this migration.';

-- ---------------------------------------------------------------------------
-- 2. Chapter-account management RPCs (admin-only)
-- ---------------------------------------------------------------------------

-- Server-side paginated, filtered, sorted — never fetches all chapter
-- accounts into the browser and hides the excess client-side. p_page_size
-- is hard-clamped to [1, 100] regardless of what is requested.
create or replace function public.rrg_admin_list_chapter_accounts(
  p_search text default null,
  p_county_id bigint default null,
  p_state text default null,
  p_sort text default 'county',
  p_sort_direction text default 'asc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  user_id uuid,
  county_id bigint,
  county_name text,
  login_email text,
  forwarding_email text,
  status text,
  review_required boolean,
  created_at timestamptz,
  password_rotated_at timestamptz,
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
      account.user_id,
      account.county_id,
      county.name,
      auth_user.email,
      account.forwarding_email,
      account.status,
      account.review_required,
      account.created_at,
      account.password_rotated_at,
      count(*) over() as total_count
    from public.portal_accounts as account
    left join public.counties as county on county.id = account.county_id
    left join auth.users as auth_user on auth_user.id = account.user_id
    where account.role = 'chapter_master'
      and (p_county_id is null or account.county_id = p_county_id)
      and (
        p_state is null
        or (p_state = 'trusted' and account.status = 'active' and account.review_required = false)
        or (p_state = 'restricted' and account.status = 'active' and account.review_required = true)
        or (p_state = 'suspended' and account.status = 'suspended')
      )
      and (
        v_search is null
        or county.name ilike '%' || v_search || '%'
        or auth_user.email ilike '%' || v_search || '%'
        or account.forwarding_email ilike '%' || v_search || '%'
      )
    order by
      case when p_sort = 'county' and p_sort_direction = 'asc' then county.name end asc,
      case when p_sort = 'county' and p_sort_direction = 'desc' then county.name end desc,
      case when p_sort = 'login_alias' and p_sort_direction = 'asc' then auth_user.email end asc,
      case when p_sort = 'login_alias' and p_sort_direction = 'desc' then auth_user.email end desc,
      case when p_sort = 'created_at' and p_sort_direction = 'asc' then account.created_at end asc,
      case when p_sort = 'created_at' and p_sort_direction = 'desc' then account.created_at end desc,
      case when p_sort = 'state' and p_sort_direction = 'asc'
        then (case when account.status = 'suspended' then 2 when account.review_required then 1 else 0 end)
      end asc,
      case when p_sort = 'state' and p_sort_direction = 'desc'
        then (case when account.status = 'suspended' then 2 when account.review_required then 1 else 0 end)
      end desc,
      county.name asc
    limit v_page_size
    offset (v_page - 1) * v_page_size;
end;
$$;

comment on function public.rrg_admin_list_chapter_accounts(text, bigint, text, text, text, integer, integer) is
  'Admin-only. Server-side paginated (hard max 100/page), filtered, sorted list of chapter-master accounts with their login email (resolved from auth.users, never exposed directly) and forwarding_email. Never returns password hashes, provider tokens, identities, or any other auth.users column. total_count reflects the full filtered result set, not just the returned page.';

-- ---------------------------------------------------------------------------
-- 3. Forwarding-email RPCs (self and admin)
-- ---------------------------------------------------------------------------

-- A suspended account with an unexpired JWT must not read its own
-- forwarding email — the explicit status = 'active' check is the
-- enforcement point, since a valid auth.uid() alone is not sufficient.
create or replace function public.rrg_get_my_forwarding_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select account.forwarding_email
  from public.portal_accounts as account
  where account.user_id = auth.uid()
    and account.status = 'active';
$$;

create or replace function public.rrg_set_my_forwarding_email(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_normalized text;
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

  v_normalized := lower(trim(p_email));

  if v_normalized = '' or v_normalized !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid forwarding email address is required.' using errcode = '22023';
  end if;

  update public.portal_accounts
  set forwarding_email = v_normalized
  where user_id = v_uid and status = 'active';

  if not found then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return v_normalized;
end;
$$;

create or replace function public.rrg_admin_set_forwarding_email(p_user_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized text;
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

  v_normalized := lower(trim(p_email));

  if v_normalized = '' or v_normalized !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid forwarding email address is required.' using errcode = '22023';
  end if;

  update public.portal_accounts
  set forwarding_email = v_normalized
  where user_id = p_user_id;

  if not found then
    raise exception 'Target account not found.' using errcode = 'P0002';
  end if;

  return v_normalized;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Trusted/restricted and account-status RPCs (admin-only)
-- ---------------------------------------------------------------------------

create or replace function public.rrg_admin_set_review_required(p_user_id uuid, p_review_required boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target public.portal_accounts%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.portal_accounts as admin_account
    where admin_account.user_id = v_uid
      and admin_account.role = 'admin'
      and admin_account.status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_target from public.portal_accounts where user_id = p_user_id;
  if not found then
    raise exception 'Target account not found.' using errcode = 'P0002';
  end if;

  if v_target.role <> 'chapter_master' then
    raise exception 'Only chapter-master accounts have a trusted/restricted state.' using errcode = '42501';
  end if;

  update public.portal_accounts
  set review_required = p_review_required
  where user_id = p_user_id;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid,
    v_target.county_id,
    case when p_review_required then 'chapter_master_marked_restricted' else 'chapter_master_marked_trusted' end,
    'portal_accounts',
    p_user_id::text,
    jsonb_build_object('previous_review_required', v_target.review_required, 'new_review_required', p_review_required)
  );
end;
$$;

-- DB-only half of suspend/restore. Never called directly by the frontend —
-- see the header comment and admin-account-action Edge Function.
create or replace function public.rrg_admin_set_account_status(p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target public.portal_accounts%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if p_status not in ('active', 'suspended') then
    raise exception 'Unsupported account status.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.portal_accounts as admin_account
    where admin_account.user_id = v_uid
      and admin_account.role = 'admin'
      and admin_account.status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_target from public.portal_accounts where user_id = p_user_id;
  if not found then
    raise exception 'Target account not found.' using errcode = 'P0002';
  end if;

  if v_target.role = 'admin' and p_status = 'suspended' then
    raise exception 'Administrator accounts cannot be suspended through this function.' using errcode = '42501';
  end if;

  update public.portal_accounts
  set status = p_status
  where user_id = p_user_id;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_uid,
    v_target.county_id,
    case when p_status = 'suspended' then 'chapter_master_suspended' else 'chapter_master_restored' end,
    'portal_accounts',
    p_user_id::text,
    jsonb_build_object('previous_status', v_target.status, 'new_status', p_status)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Post-submission RPC
-- ---------------------------------------------------------------------------

create or replace function public.rrg_submit_post(p_post_id bigint)
returns public.posts
language plpgsql
security definer
set search_path = ''
as $$
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

  select * into v_actor from public.portal_accounts where user_id = v_uid;
  if not found or v_actor.status <> 'active' then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'Post not found.' using errcode = 'P0002';
  end if;
  v_previous_status := v_post.status;

  -- Live posts_status_check permits exactly draft/pending/approved/rejected
  -- (confirmed against the deployed constraint; see the preflight assertion
  -- in section 0 above). The chapter-master-facing UI may show a friendlier
  -- label for a 'rejected' post, but the stored column value is always
  -- exactly 'rejected'.
  if v_actor.role = 'admin' then
    if v_previous_status not in ('draft', 'pending', 'rejected') then
      raise exception 'This post cannot be published from its current status.' using errcode = '42501';
    end if;
    v_target_status := 'approved';
  elsif v_actor.role = 'chapter_master' then
    if v_post.author_user_id is distinct from v_uid then
      raise exception 'Not authorized.' using errcode = '42501';
    end if;
    if v_post.county_id is null or v_post.county_id is distinct from v_actor.county_id then
      raise exception 'Not authorized.' using errcode = '42501';
    end if;
    if v_previous_status not in ('draft', 'rejected') then
      raise exception 'This post cannot be submitted from its current status.' using errcode = '42501';
    end if;
    v_target_status := case when v_actor.review_required then 'pending' else 'approved' end;
  else
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  update public.posts
  set
    status = v_target_status,
    submitted_at = now(),
    approved_at = case when v_target_status = 'approved' then now() else null end,
    approved_by = case when v_target_status = 'approved' then v_uid else null end,
    rejected_at = null
  where id = p_post_id
  returning * into v_post;

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
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants (defense in depth: revoke first, grant only what's needed)
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.rrg_admin_list_chapter_accounts(text, bigint, text, text, text, integer, integer)',
    'public.rrg_get_my_forwarding_email()',
    'public.rrg_set_my_forwarding_email(text)',
    'public.rrg_admin_set_forwarding_email(uuid, text)',
    'public.rrg_admin_set_review_required(uuid, boolean)',
    'public.rrg_admin_set_account_status(uuid, text)',
    'public.rrg_submit_post(bigint)'
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
-- 7. One-result Supabase verification
-- ---------------------------------------------------------------------------

select jsonb_build_object(
  'forwarding_email_column_exists', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'portal_accounts' and column_name = 'forwarding_email'
  ),
  'rrg_submit_post_exists', to_regprocedure('public.rrg_submit_post(bigint)') is not null,
  'rrg_admin_set_account_status_exists', to_regprocedure('public.rrg_admin_set_account_status(uuid, text)') is not null
) as chapter_master_accounts_and_posts_migration;
