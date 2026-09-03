create or replace function public.rrg_delete_post(p_post_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_account public.portal_accounts%rowtype;
  v_post public.posts%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_account
  from public.portal_accounts
  where user_id = v_actor;

  if not found or v_account.status <> 'active'
     or v_account.role <> 'chapter_master'
     or v_account.review_required then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_post
  from public.posts
  where id = p_post_id
  for update;

  if not found then
    raise exception 'Post not found.' using errcode = 'P0002';
  end if;

  if v_post.scope <> 'county'
     or v_post.county_id is null
     or v_post.county_id is distinct from v_account.county_id then
    raise exception 'Chapter masters may delete only posts from their own county.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.email_campaigns where post_id = v_post.id
  ) then
    raise exception 'Posts with an email campaign cannot be deleted because delivery history must be retained.'
      using errcode = '23503';
  end if;

  delete from public.posts where id = v_post.id;

  insert into public.security_audit_events (
    actor_user_id, county_id, event_type, target_table, target_id, event_data
  ) values (
    v_actor,
    v_post.county_id,
    'post_deleted',
    'posts',
    v_post.id::text,
    jsonb_build_object(
      'title', v_post.title,
      'scope', v_post.scope,
      'status', v_post.status,
      'author_user_id', v_post.author_user_id
    )
  );

  return jsonb_build_object('deleted', true, 'post_id', v_post.id);
end;
$function$;

revoke all on function public.rrg_delete_post(bigint) from public, anon;
grant execute on function public.rrg_delete_post(bigint) to authenticated;
