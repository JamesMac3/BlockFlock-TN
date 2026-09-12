create table public.county_chapter_links (
 county_id bigint not null references public.counties(id) on update cascade on delete cascade,
 slot smallint not null check (slot between 1 and 3),
 label text not null check (label = btrim(label) and char_length(label) between 1 and 60 and label !~ '[[:cntrl:]]'),
 url text not null check (
  char_length(url) between 9 and 2048 and url = btrim(url)
  and url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
  and url !~ '[[:cntrl:][:space:]]' and position(chr(92) in url) = 0
 ),
 color text not null default 'light_blue' check (color in ('light_blue','navy','red')),
 primary key (county_id,slot)
);
comment on table public.county_chapter_links is 'Optional public chapter social/site buttons; absent slots are hidden. At most three per county.';
alter table public.county_chapter_links enable row level security;
grant select on public.county_chapter_links to anon, authenticated;
grant insert, update, delete on public.county_chapter_links to authenticated;
create policy chapter_links_public_read on public.county_chapter_links for select to anon, authenticated using (true);
create policy chapter_links_manage_insert on public.county_chapter_links for insert to authenticated with check (public.rrg_can_manage_county(county_id));
create policy chapter_links_manage_update on public.county_chapter_links for update to authenticated using (public.rrg_can_manage_county(county_id)) with check (public.rrg_can_manage_county(county_id));
create policy chapter_links_manage_delete on public.county_chapter_links for delete to authenticated using (public.rrg_can_manage_county(county_id));

create function public.save_county_chapter_links(p_county_id bigint, p_links jsonb)
returns setof public.county_chapter_links
language plpgsql security invoker set search_path = ''
as $$
begin
 if auth.uid() is null or not public.rrg_can_manage_county(p_county_id) then
  raise exception 'Not authorized to edit links for this county.' using errcode='42501';
 end if;
 if p_links is null or jsonb_typeof(p_links) <> 'array' then
  raise exception 'Links must be an array.' using errcode='22023';
 end if;
 if jsonb_array_length(p_links) > 3 then
  raise exception 'A county can have at most three links.' using errcode='22023';
 end if;
 -- Serialize saves for a county; replacement is all-or-nothing.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('county_chapter_links:' || p_county_id::text,0));
 delete from public.county_chapter_links where county_id=p_county_id;
 insert into public.county_chapter_links(county_id,slot,label,url,color)
 select p_county_id,x.slot,btrim(x.label),btrim(x.url),coalesce(x.color,'light_blue')
 from jsonb_to_recordset(p_links) as x(slot smallint,label text,url text,color text);
 return query select l.* from public.county_chapter_links l where l.county_id=p_county_id order by l.slot;
end;
$$;
revoke all on function public.save_county_chapter_links(bigint,jsonb) from public, anon;
grant execute on function public.save_county_chapter_links(bigint,jsonb) to authenticated;

