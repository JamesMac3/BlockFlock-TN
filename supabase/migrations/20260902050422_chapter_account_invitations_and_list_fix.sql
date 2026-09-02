-- Fix the admin chapter-account list and provide the authenticated database
-- half of the invitation/setup-link workflow. Auth user creation and email
-- delivery remain in the admin-account-action Edge Function.

begin;

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
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if auth.uid() is null or not exists (
    select 1 from public.portal_accounts a
    where a.user_id = auth.uid() and a.role = 'admin' and a.status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if p_state is not null and p_state not in ('trusted', 'restricted', 'suspended') then
    raise exception 'Unsupported account state.' using errcode = '22023';
  end if;

  return query
  select
    account.user_id,
    account.county_id,
    county.name,
    auth_user.email::text,
    account.forwarding_email,
    account.status,
    account.review_required,
    account.created_at,
    account.password_rotated_at,
    count(*) over()
  from public.portal_accounts account
  left join public.counties county on county.id = account.county_id
  left join auth.users auth_user on auth_user.id = account.user_id
  where account.role = 'chapter_master'
    and (p_county_id is null or account.county_id = p_county_id)
    and (
      p_state is null
      or (p_state = 'trusted' and account.status = 'active' and not account.review_required)
      or (p_state = 'restricted' and account.status = 'active' and account.review_required)
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
      then case when account.status = 'suspended' then 2 when account.review_required then 1 else 0 end end asc,
    case when p_sort = 'state' and p_sort_direction = 'desc'
      then case when account.status = 'suspended' then 2 when account.review_required then 1 else 0 end end desc,
    county.name asc
  limit v_page_size
  offset (v_page - 1) * v_page_size;
end;
$$;

create or replace function public.rrg_admin_list_available_chapter_counties()
returns table (county_id bigint, county_name text, login_email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.portal_accounts a
    where a.user_id = auth.uid() and a.role = 'admin' and a.status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.name,
    (regexp_replace(c.slug, '-county$', '') || '@flockblocktn.org')::text
  from public.counties c
  where not exists (
    select 1 from public.portal_accounts pa
    where pa.role = 'chapter_master' and pa.county_id = c.id
  )
  order by c.name;
end;
$$;

create or replace function public.rrg_admin_get_chapter_invite_context(p_county_id bigint)
returns table (county_name text, login_email text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.portal_accounts a
    where a.user_id = auth.uid() and a.role = 'admin' and a.status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.portal_accounts pa
    where pa.role = 'chapter_master' and pa.county_id = p_county_id
  ) then
    raise exception 'This county already has a chapter account.' using errcode = '23505';
  end if;

  return query
  select c.name, (regexp_replace(c.slug, '-county$', '') || '@flockblocktn.org')::text
  from public.counties c
  where c.id = p_county_id;

  if not found then
    raise exception 'County not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.rrg_admin_register_chapter_account(
  p_user_id uuid,
  p_county_id bigint,
  p_forwarding_email text,
  p_initial_state text default 'restricted'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_forwarding text := lower(btrim(coalesce(p_forwarding_email, '')));
  v_login_email text;
  v_auth_email text;
begin
  if v_actor is null or not exists (
    select 1 from public.portal_accounts a
    where a.user_id = v_actor and a.role = 'admin' and a.status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if p_initial_state not in ('trusted', 'restricted', 'suspended') then
    raise exception 'Unsupported initial account state.' using errcode = '22023';
  end if;
  if char_length(v_forwarding) > 320
     or v_forwarding !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid forwarding email address is required.' using errcode = '22023';
  end if;

  select (regexp_replace(c.slug, '-county$', '') || '@flockblocktn.org')::text
  into v_login_email
  from public.counties c
  where c.id = p_county_id
  for update;
  if not found then
    raise exception 'County not found.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.portal_accounts pa
    where pa.role = 'chapter_master' and pa.county_id = p_county_id
  ) then
    raise exception 'This county already has a chapter account.' using errcode = '23505';
  end if;

  select lower(u.email)::text into v_auth_email from auth.users u where u.id = p_user_id;
  if v_auth_email is distinct from v_login_email then
    raise exception 'The Auth login alias does not match this county.' using errcode = '22023';
  end if;

  insert into public.portal_accounts (
    user_id, role, county_id, status, review_required, forwarding_email
  ) values (
    p_user_id,
    'chapter_master',
    p_county_id,
    case when p_initial_state = 'suspended' then 'suspended' else 'active' end,
    p_initial_state <> 'trusted',
    v_forwarding
  );

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_actor, p_county_id, 'chapter_master_invited', 'portal_accounts', p_user_id::text,
    jsonb_build_object('initial_state', p_initial_state, 'login_alias', v_login_email)
  );
end;
$$;

create or replace function public.rrg_admin_get_chapter_setup_context(p_user_id uuid)
returns table (
  county_name text,
  login_email text,
  forwarding_email text,
  account_status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.portal_accounts a
    where a.user_id = auth.uid() and a.role = 'admin' and a.status = 'active'
  ) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
  select c.name, u.email::text, pa.forwarding_email, pa.status
  from public.portal_accounts pa
  join public.counties c on c.id = pa.county_id
  join auth.users u on u.id = pa.user_id
  where pa.user_id = p_user_id and pa.role = 'chapter_master';

  if not found then
    raise exception 'Chapter account not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.rrg_admin_list_chapter_accounts(text,bigint,text,text,text,integer,integer) from public, anon;
revoke all on function public.rrg_admin_list_available_chapter_counties() from public, anon;
revoke all on function public.rrg_admin_get_chapter_invite_context(bigint) from public, anon;
revoke all on function public.rrg_admin_register_chapter_account(uuid,bigint,text,text) from public, anon;
revoke all on function public.rrg_admin_get_chapter_setup_context(uuid) from public, anon;

grant execute on function public.rrg_admin_list_chapter_accounts(text,bigint,text,text,text,integer,integer) to authenticated;
grant execute on function public.rrg_admin_list_available_chapter_counties() to authenticated;
grant execute on function public.rrg_admin_get_chapter_invite_context(bigint) to authenticated;
grant execute on function public.rrg_admin_register_chapter_account(uuid,bigint,text,text) to authenticated;
grant execute on function public.rrg_admin_get_chapter_setup_context(uuid) to authenticated;

commit;
