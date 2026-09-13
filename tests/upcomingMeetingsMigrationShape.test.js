import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Codex applied this migration as 20260913051334_... (renamed from an
// earlier unapplied draft at 20260912110000_...). Verified live as an
// anonymous visitor: statewide selection, county-plus-pinned filtering,
// limit handling, and Nashville's comment fields all work against the
// real database — these tests only check the applied SQL's shape.
const sql = await readFile(
  new URL("../supabase/migrations/20260913051334_upcoming_meetings_list_and_public_comment_fields.sql", import.meta.url),
  "utf8"
);

test("adds the four public-comment columns as nullable, so a meeting with none of them is unaffected", () => {
  assert.match(sql, /add column if not exists comment_speaking_limit text/);
  assert.match(sql, /add column if not exists comment_signup_instructions text/);
  assert.match(sql, /add column if not exists comment_signup_deadline timestamptz/);
  assert.match(sql, /add column if not exists comment_source_url text/);
  assert.doesNotMatch(sql, /comment_speaking_limit text not null/);
  assert.doesNotMatch(sql, /comment_signup_deadline timestamptz not null/);
});

test("comment_signup_deadline has no default tying it to starts_at — it is its own independent, optional instant", () => {
  const column = sql.match(/add column if not exists comment_signup_deadline timestamptz[^,]*/)?.[0] ?? "";
  assert.doesNotMatch(column, /default/);
  assert.doesNotMatch(column, /starts_at/);
});

test("comment_source_url is constrained to HTTPS when present", () => {
  assert.match(sql, /comment_source_url ~ '\^https:\/\//);
});

test("rrg_get_upcoming_meetings excludes cancelled, expired, and already-started meetings", () => {
  const body = sql.match(/create or replace function public\.rrg_get_upcoming_meetings[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /where m\.status = 'scheduled'/);
  assert.match(body, /and m\.starts_at > now\(\)/);
});

test("rrg_get_upcoming_meetings sorts strictly by starts_at ascending — no pinned-first priority case", () => {
  const body = sql.match(/create or replace function public\.rrg_get_upcoming_meetings[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /order by m\.starts_at asc, m\.id asc/);
  assert.doesNotMatch(body, /case when.*is_pinned_statewide/);
});

test("rrg_get_upcoming_meetings: a null p_county_id (statewide homepage) matches every county's meetings, pinned or not", () => {
  const body = sql.match(/create or replace function public\.rrg_get_upcoming_meetings[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /\(p_county_id is null or m\.county_id = p_county_id or m\.is_pinned_statewide\)/);
});

test("rrg_get_upcoming_meetings limit is clamped between 1 and 10, defaulting to 3", () => {
  assert.match(sql, /p_limit integer default 3/);
  const body = sql.match(/create or replace function public\.rrg_get_upcoming_meetings[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /limit least\(greatest\(coalesce\(p_limit, 3\), 1\), 10\)/);
});

test("rrg_get_upcoming_meetings is granted to anon and authenticated — a public read, like rrg_get_next_meeting_for_county", () => {
  assert.match(sql, /revoke all on function public\.rrg_get_upcoming_meetings\(bigint, integer\) from public;/);
  assert.match(sql, /grant execute on function public\.rrg_get_upcoming_meetings\(bigint, integer\) to anon, authenticated;/);
});

test("has a precondition check for public.meetings before altering it", () => {
  assert.match(sql, /if to_regclass\('public\.meetings'\) is null then/);
});

test("backfills the existing September 15 Nashville meeting's comment fields by exact identity (county, instant, and title), not a blanket update", () => {
  // Non-greedy-to-first-";" would stop inside comment_speaking_limit's own
  // string value ("...per speaker; 20 minutes total...") — this statement
  // is the last one in the file, so match through to the end instead.
  const updateBlock = sql.match(/update public\.meetings set[\s\S]*$/)?.[0] ?? "";
  assert.match(updateBlock, /comment_speaking_limit='Up to 2 minutes per speaker/);
  assert.match(updateBlock, /comment_signup_deadline=timestamptz '2026-09-15 18:00:00-05'/);
  assert.match(updateBlock, /comment_source_url='https:\/\/www\.nashville\.gov\/departments\/council\/public-comment-period'/);
  assert.match(updateBlock, /where county_id=\(select id from public\.counties where name='Davidson County'\)/);
  assert.match(updateBlock, /and starts_at=timestamptz '2026-09-15 18:30:00-05'/);
  assert.match(updateBlock, /and title='Nashville Metro Council public comments \(sign up 5-6 PM\)'/);
});

test("the backfilled signup deadline (6:00 PM) is a distinct instant from the meeting start (6:30 PM)", () => {
  const updateBlock = sql.match(/update public\.meetings set[\s\S]*$/)?.[0] ?? "";
  const deadline = updateBlock.match(/comment_signup_deadline=timestamptz '([^']+)'/)?.[1];
  const startsAt = updateBlock.match(/and starts_at=timestamptz '([^']+)'/)?.[1];
  assert.ok(deadline && startsAt);
  assert.notEqual(deadline, startsAt);
});
