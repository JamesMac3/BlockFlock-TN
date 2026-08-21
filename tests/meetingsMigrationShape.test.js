import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// These assertions are static-shape checks against the SQL text of the
// meetings migrations Codex has already applied live (per the reconciled
// contract this pass was built against). They prove the SQL as written
// contains the expected clauses/structure — they cannot execute against a
// real Postgres instance and so cannot themselves prove runtime
// authorization, RLS enforcement, or transaction/rollback behavior. See the
// "Mandatory Codex pre-application checklist" style verification notes in
// this session's completion report for the runtime-only claims.

const schemaSql = await readFile(
  new URL("../supabase/migrations/20260821225913_meetings_schema_and_selection.sql", import.meta.url),
  "utf8",
);
const seedSql = await readFile(
  new URL("../supabase/migrations/20260821225925_seed_statewide_pinned_meeting.sql", import.meta.url),
  "utf8",
);
// This file's create-or-replace of rrg_save_post_with_meeting supersedes
// the one in the schema migration above — it is the authoritative, final
// live definition (pending/approved both closed to chapter-master edits).
const lockSql = await readFile(
  new URL("../supabase/migrations/20260821230207_lock_chapter_meeting_post_after_submission.sql", import.meta.url),
  "utf8",
);

test("meetings table has RLS enabled and forced, with no direct grants to anon/authenticated", () => {
  assert.match(schemaSql, /alter table public\.meetings enable row level security;/);
  assert.match(schemaSql, /alter table public\.meetings force row level security;/);
  assert.match(schemaSql, /revoke all on table public\.meetings from public, anon, authenticated;/);
});

test("the meeting/county pinned constraint is a full biconditional", () => {
  assert.match(
    schemaSql,
    /check \(\s*\(is_pinned_statewide and county_id is null\)\s*or \(not is_pinned_statewide and county_id is not null\)\s*\)/,
  );
});

test("timezone is constrained to a single supported value", () => {
  assert.match(schemaSql, /check \(timezone = 'America\/Chicago'\)/);
});

test("source_post_id clears on post deletion via ON DELETE SET NULL, not a trigger", () => {
  assert.match(schemaSql, /source_post_id bigint references public\.posts\(id\) on delete set null/);
  assert.doesNotMatch(schemaSql, /create (or replace )?trigger/i);
});

test("every local-calendar-date comparison uses (now() at time zone 'America/Chicago')::date, never current_date at time zone", () => {
  const dateComparisons = schemaSql.match(/\(now\(\) at time zone 'America\/Chicago'\)::date/g) ?? [];
  assert.ok(dateComparisons.length >= 3, "expected the fixed-zone 'now' comparison in upsert, save-with-meeting, and the selector");
  assert.doesNotMatch(schemaSql, /current_date at time zone/i);
});

test("rrg_expire_past_meetings never deletes rows — only flips status to expired — and preserves audit history", () => {
  const fn = schemaSql.match(/create or replace function public\.rrg_expire_past_meetings\(\)[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.ok(fn, "rrg_expire_past_meetings function body not found");
  assert.doesNotMatch(fn, /delete from/i);
  assert.match(fn, /set status = 'expired'/);
  assert.match(fn, /insert into public\.security_audit_events/);
  assert.match(fn, /<= \(now\(\) at time zone 'America\/Chicago'\)::date - 2/);
});

test("rrg_expire_past_meetings is granted only to service_role, never to anon/authenticated", () => {
  assert.match(
    schemaSql,
    /revoke all on function public\.rrg_expire_past_meetings\(\) from public, anon, authenticated;/,
  );
  assert.match(schemaSql, /grant execute on function public\.rrg_expire_past_meetings\(\) to service_role;/);
});

test("rrg_admin_expire_past_meetings requires an active admin and delegates to the service-role cleanup function", () => {
  const fn = schemaSql.match(/create or replace function public\.rrg_admin_expire_past_meetings\(\)[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.ok(fn, "rrg_admin_expire_past_meetings function body not found");
  assert.match(fn, /role = 'admin' and status = 'active'/);
  assert.match(fn, /return public\.rrg_expire_past_meetings\(\);/);
});

test("rrg_get_next_meeting_for_county prefers a county-specific meeting over the statewide pinned fallback", () => {
  const fn = schemaSql.match(/create or replace function public\.rrg_get_next_meeting_for_county[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(fn, /status = 'scheduled'/);
  assert.match(fn, /p_county_id is not null and m\.county_id = p_county_id.*then 0 else 1 end/s);
  assert.match(schemaSql, /grant execute on function public\.rrg_get_next_meeting_for_county\(bigint\) to anon, authenticated;/);
});

test("rrg_upsert_meeting forces a chapter master's county server-side and rejects a pinned statewide request from one", () => {
  const fn = schemaSql.match(/create or replace function public\.rrg_upsert_meeting[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(fn, /if v_actor\.role = 'chapter_master' then\s*\n\s*v_county_id := v_actor\.county_id;\s*\n\s*v_pinned := false;/);
});

test("rrg_save_post_with_meeting (final, superseding definition) takes p_submit, never a caller-controlled status field", () => {
  assert.doesNotMatch(lockSql, /p_status\s+text/);
  assert.match(lockSql, /p_submit\s+boolean/);
});

test("the final rrg_save_post_with_meeting closes both pending and approved posts to chapter-master edits", () => {
  const fn = lockSql.match(/create or replace function public\.rrg_save_post_with_meeting[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(fn, /if v_post\.status = 'pending' then\s*\n\s*raise exception 'This post is awaiting review/);
  assert.match(fn, /elsif v_post\.status = 'approved' then\s*\n\s*raise exception 'This post has already been approved/);
});

test("the final rrg_save_post_with_meeting allows a chapter master to edit and resubmit a rejected post", () => {
  const fn = lockSql.match(/create or replace function public\.rrg_save_post_with_meeting[\s\S]*?\n\$\$;/)?.[0] ?? "";
  // A rejected post is not blocked by the pending/approved checks above,
  // so it falls through to the ordinary update — and resubmission is
  // allowed because v_starting_status is included in the submit gate.
  assert.doesNotMatch(fn, /status = 'rejected'.{0,40}raise exception/s);
  assert.match(fn, /v_starting_status in \('draft', 'rejected'\)/);
});

test("the post and its linked meeting are written in one function body (single transaction), not two separate RPC calls", () => {
  const fn = lockSql.match(/create or replace function public\.rrg_save_post_with_meeting[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(fn, /insert into public\.posts|update public\.posts/);
  assert.match(fn, /insert into public\.meetings|update public\.meetings/);
  // Both mutations occur before the function's single closing $$; — no
  // intermediate commit boundary, no second RPC round-trip required.
  const postIndex = fn.search(/(insert into public\.posts|update public\.posts)/);
  const meetingIndex = fn.search(/(insert into public\.meetings|update public\.meetings)/);
  assert.ok(postIndex >= 0 && meetingIndex > postIndex);
});

test("the meetings selection RPC never returns rows for cancelled or expired meetings — only status='scheduled'", () => {
  const fn = schemaSql.match(/create or replace function public\.rrg_get_next_meeting_for_county[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(fn, /where m\.status = 'scheduled'/);
});

test("seed migration is idempotent — the insert is guarded by a not-exists check keyed on the pinned meeting's exact instant", () => {
  assert.match(seedSql, /where not exists \(\s*\n\s*select 1 from public\.meetings\s*\n\s*where is_pinned_statewide = true\s*\n\s*and starts_at = timestamptz '2026-09-01T22:00:00Z'\s*\n\);/);
});

test("seed migration inserts only the exact supplied facts — no inferred postal code, statewide pinned (no county)", () => {
  assert.match(seedSql, /timestamptz '2026-09-01T22:00:00Z'/);
  assert.match(seedSql, /'200 North Castle Heights Ave'/);
  assert.match(seedSql, /'Lebanon'/);
  assert.match(seedSql, /'TN'/);
  assert.match(seedSql, /\n {2}null,\n {2}true,/); // postal_code (null), is_pinned_statewide (true)
});
