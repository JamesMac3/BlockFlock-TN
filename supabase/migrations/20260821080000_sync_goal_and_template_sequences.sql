-- Flock Block Tennessee
-- Reproducible sequence synchronization for county_records_request_goals
-- and records_request_goal_templates.
--
-- Codex has already repaired both sequences live (their current value now
-- matches each table's current max id). This migration exists so that
-- repair is reproducible from source control rather than only having
-- happened as an untracked manual fix — it recomputes each table's actual
-- current max(id) at apply time and never hardcodes a specific id value.
-- Running it more than once is safe: setval() simply recomputes the same
-- (or a newer, still-correct) target each time.
--
-- This migration is INTENTIONALLY LEFT UNAPPLIED per this task's
-- instructions — Codex will decide when to apply it.

begin;

do $$
begin
  if to_regclass('public.county_records_request_goals') is null then
    raise exception 'public.county_records_request_goals does not exist';
  end if;

  if to_regclass('public.records_request_goal_templates') is null then
    raise exception 'public.records_request_goal_templates does not exist';
  end if;

  if to_regclass('public.county_records_request_goals_id_seq') is null then
    raise exception 'public.county_records_request_goals_id_seq does not exist';
  end if;

  if to_regclass('public.records_request_goal_templates_id_seq') is null then
    raise exception 'public.records_request_goal_templates_id_seq does not exist';
  end if;
end
$$;

-- A genuinely empty table (max(id) is null) and a populated table need
-- different setval() calls, not just a different value:
--   - populated: setval(seq, max_id, true)  -- next nextval() returns max_id + 1
--   - empty:     setval(seq, 1, false)      -- next nextval() returns 1 (not 2)
-- Using is_called = true with a coalesced value of 1 on an empty table
-- would make the next nextval() skip id 1 entirely, which is wrong even
-- though it isn't unsafe — this computes and branches on each table's
-- actual max(id) explicitly instead.
do $$
declare
  v_max_goal_id bigint;
  v_max_template_id bigint;
begin
  select max(id) into v_max_goal_id from public.county_records_request_goals;
  if v_max_goal_id is null then
    perform setval('public.county_records_request_goals_id_seq', 1, false);
  else
    perform setval('public.county_records_request_goals_id_seq', v_max_goal_id, true);
  end if;

  select max(id) into v_max_template_id from public.records_request_goal_templates;
  if v_max_template_id is null then
    perform setval('public.records_request_goal_templates_id_seq', 1, false);
  else
    perform setval('public.records_request_goal_templates_id_seq', v_max_template_id, true);
  end if;
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- One-result Supabase verification
-- ---------------------------------------------------------------------------

select jsonb_build_object(
  'county_records_request_goals_id_seq_synced',
  (select last_value from public.county_records_request_goals_id_seq)
    >= coalesce((select max(id) from public.county_records_request_goals), 0),
  'records_request_goal_templates_id_seq_synced',
  (select last_value from public.records_request_goal_templates_id_seq)
    >= coalesce((select max(id) from public.records_request_goal_templates), 0)
) as sync_goal_and_template_sequences_migration;
