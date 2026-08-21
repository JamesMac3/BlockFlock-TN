# Migration history drift — notes for Codex

This is a report, not a fix. It does not touch `supabase_migrations.schema_migrations`
and it is not itself a migration (a leading `#`/non-numeric filename means the
Supabase CLI ignores it). Nothing here has been applied; no migration in this
repo has been applied and no Edge Function has been deployed as part of this
pass.

## Why this exists

The live migration history table has been reported to record only
`configure_education_and_archive_storage`, yet several objects that local
migration files in this repo also define (or assume) already exist live —
e.g. `county_records_request_goals`, `records_request_goal_links`,
`portal_accounts`, `posts`, `evidence_objects`, `rrg_can_manage_county`,
`posts_status_check`. That gap means a meaningful amount of schema was
applied outside the history-tracked mechanism (most plausibly: run by hand
through the SQL editor, or through a process that didn't register with
`supabase_migrations`). Blindly running `supabase db push` / `migration up`
against that state is unsafe: the CLI's own idea of "what's applied" does
not match reality.

## Classification of the seven local migration files

| File | Status | Basis |
|---|---|---|
| `001_request_profiles_v1.sql` | **Already applied live** | `request_profiles` and its columns (`field_schema`, `template_schema`, `validation_schema`, `output_options`, `status`, etc.) have been read from and written to as live tables throughout this session's work (operator preview, document generation) without this migration ever being run in this session. |
| `20260803_admin_post_composer_foundation.sql` | **Already applied live** | `posts` and `post_media` are used live by `PostComposer.jsx`/`AdminPostDashboard.jsx`, and this session's Codex-supplied correction gave the live `posts_status_check` constraint's exact values — that constraint can only be inspected if the table (and presumably this migration) is already live. |
| `20260814_records_request_goals.sql` | **Already applied live** | `county_records_request_goals`, `records_request_goal_links`, `rrg_can_manage_county`, `rrg_goal_is_public`, and their RLS policies were pinned by exact-text regression tests against this file's own SQL earlier in this session specifically *because* they were confirmed live and already governing real authorization — not merely a local draft. |
| `20260820193724_murfreesboro_profile_field_mapping_fix.sql` | **Status unconfirmed — verify before doing anything with it** | This is a data-shape patch to two specific `request_profiles` rows (Murfreesboro), not a schema-defining migration, so its application state can't be inferred the way the three files above can (their effects are structural and independently observable; this one's effects are two rows' JSON contents). Do not assume either way — check directly (query below) before applying or skipping it. |
| `20260821032341_operator_draft_request_preview.sql` | **Not applied** | Built and tested against this session's assumptions with the explicit instruction to leave it unapplied; nothing in this session observed its objects (`get_draft_request_preview_bundle` etc.) live. |
| `20260821060801_chapter_master_accounts_and_posts.sql` | **Not applied** | Same — built this session, corrected in this pass, left unapplied throughout. |
| `20260821060804_goal_completion_and_public_archive.sql` | **Not applied** | Same — built this session, corrected in this pass, left unapplied throughout. |

**Do not treat the "already applied live" classification above as certain.**
It is inferred from how this session used the objects, not from a direct
read of `supabase_migrations.schema_migrations` or `information_schema`.
Confirm with the queries below before acting on it.

## Safe application order (once confirmed against the queries below)

1. Reconcile migration history first — before applying anything, mark the
   three already-live files as applied in `supabase_migrations.schema_migrations`
   (e.g. `supabase migration repair --status applied <version>` for each of
   `001_request_profiles_v1`, `20260803_admin_post_composer_foundation`,
   `20260814_records_request_goals`), so the CLI's state matches reality.
   Do this **without** re-running their SQL bodies.
2. Confirm `20260820193724_murfreesboro_profile_field_mapping_fix.sql`'s
   status (query below) and either mark it applied (if the two Murfreesboro
   profile rows already show its intended field_schema shape) or apply it
   normally (if they don't).
3. Apply `20260821032341_operator_draft_request_preview.sql`.
4. Apply `20260821060801_chapter_master_accounts_and_posts.sql` — depends on
   `posts`/`portal_accounts` (from step 1) but not on step 3.
5. Apply `20260821060804_goal_completion_and_public_archive.sql` — depends
   on `20260814_records_request_goals.sql`'s `rrg_can_manage_county` (step 1)
   and on the live storage buckets/policies named in its section 0
   precondition block; it does **not** depend on steps 2–4.

Steps 4 and 5 are independent of each other and could apply in either order;
step 3 is independent of both.

## Files that must NOT be blindly reapplied

- `001_request_profiles_v1.sql`, `20260803_admin_post_composer_foundation.sql`,
  `20260814_records_request_goals.sql` — running these against the live
  database via a naive `supabase db push` that assumes an empty history
  could either fail loudly (if they use plain `create table`/`create type`
  without existence guards) or, worse, silently no-op in a way that masks a
  real drift if they do use guards inconsistently. Reconcile history first
  (step 1 above); never "fix" the drift by re-running their bodies against
  already-live objects.
- `20260820193724_murfreesboro_profile_field_mapping_fix.sql` — a data
  patch; reapplying it against rows already carrying its intended shape may
  be harmless (if idempotent) or may clobber manual edits made directly to
  those two profile rows since. Check first.

## Post-application verification queries

Run these after applying (or reconciling) each file. Each is read-only.

```sql
-- 1. Confirm migration history matches reality (no gaps beyond what's expected)
select version from supabase_migrations.schema_migrations order by version;

-- 2. Confirm the live posts_status_check constraint (must be exactly
--    draft/pending/approved/rejected — this is also asserted as a fail-fast
--    preflight inside 20260821060801_chapter_master_accounts_and_posts.sql
--    itself, so a successful apply of that file already proves this).
select pg_get_constraintdef(oid)
from pg_constraint
where conname = 'posts_status_check' and conrelid = 'public.posts'::regclass;

-- 3. Confirm the Murfreesboro profile-mapping fix's current state before
--    deciding whether to apply/skip/reconcile step 2 above.
select id, government_entity_id, version, status, field_schema
from public.request_profiles
where government_entity_id in (
  select id from public.government_entities where legal_name ilike '%Murfreesboro%'
);

-- 4. Confirm the new objects from this pass exist after applying the two
--    2026-08-21T06:xx migrations (each migration also runs an equivalent
--    one-result verification select at the end of its own transaction).
select
  to_regprocedure('public.rrg_submit_post(bigint)') is not null as rrg_submit_post_exists,
  to_regprocedure('public.rrg_set_goal_completion(bigint, boolean)') is not null as rrg_set_goal_completion_exists,
  to_regprocedure('public.get_public_archive_goals()') is not null as get_public_archive_goals_exists,
  exists (
    select 1 from pg_constraint
    where conname = 'county_records_request_goals_locked_reason_check'
  ) as locked_reason_check_exists;

-- 5. Confirm the archive gate actually excludes a public goal with no
--    qualifying resources (replace 123 with a real goal id, or construct
--    a throwaway test goal first) — should return zero rows for any goal
--    that is public but has no external/hosted qualifying resource.
select * from public.get_public_archive_goals() where goal_id = 123;
```
