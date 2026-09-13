import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Codex reworked this file with live database access: it now imports only
// the one Nashville date (September 15) with a confirmed actionable
// agenda, holds October 6/20 and November 5 pending individual agenda
// verification, and performs a real content-aware duplicate check (by
// date + title pattern, not just exact starts_at) rather than the
// simpler not-exists-by-instant guard an earlier draft of this file used.
const sql = await readFile(
  new URL("../supabase/migrations/20260913024837_import_confirmed_upcoming_meetings.sql", import.meta.url),
  "utf8"
);

test("imports exactly one meeting — only the Nashville date with a confirmed actionable agenda", () => {
  const insertCount = (sql.match(/insert into public\.meetings/g) ?? []).length;
  assert.equal(insertCount, 1);
});

test("does not import Rutherford Planning Commission or the Murfreesboro candidate, and documents why", () => {
  assert.doesNotMatch(sql, /Rutherford County Planning Commission/);
  assert.doesNotMatch(sql, /Murfreesboro City Council/);
  assert.match(sql, /excluded:\s*\n-- suitable general-comment opportunity not confirmed/);
});

test("holds October 6, October 20, and November 5 pending individual agenda verification rather than importing them speculatively", () => {
  assert.match(sql, /October 6, October 20, November 5 held pending agenda verification\./);
  assert.doesNotMatch(sql, /'2026-10-06/);
  assert.doesNotMatch(sql, /'2026-10-20/);
  assert.doesNotMatch(sql, /'2026-11-05/);
});

test("resolves the county by name via a live lookup (select ... into strict), using the corrected 'Davidson County' name", () => {
  assert.match(sql, /select id into strict target_county from public\.counties where name = 'Davidson County';/);
});

test("performs a real content-aware duplicate check against live data — same date plus a council-like title or the exact instant — not just an exact-instant guard", () => {
  const existsBlock = sql.match(/if exists \([\s\S]*?\) then/)?.[0] ?? "";
  assert.match(existsBlock, /\(starts_at at time zone 'America\/Chicago'\)::date = date '2026-09-15'/);
  assert.match(existsBlock, /title ilike '%council%'/);
  assert.match(existsBlock, /starts_at = timestamptz '2026-09-15 18:30:00-05'/);
});

test("locks the table for the duration of the check-then-insert, avoiding a race with a concurrent insert", () => {
  assert.match(sql, /lock table public\.meetings in share row exclusive mode;/);
});

// This file is already applied — Codex restored its original 11-column
// insert (title, county_id, starts_at, timezone, location_name,
// street_address, city, state, postal_code, is_pinned_statewide, status)
// and it must not be edited or replayed to add the comment_* columns.
// Those are populated instead by a separate, exact-identity UPDATE in
// 20260913051334_upcoming_meetings_list_and_public_comment_fields.sql —
// see upcomingMeetingsMigrationShape.test.js for that.
test("does not itself write any comment_* column — population happens via a separate, later backfill migration", () => {
  assert.doesNotMatch(sql, /comment_speaking_limit/);
  assert.doesNotMatch(sql, /comment_signup_instructions/);
  assert.doesNotMatch(sql, /comment_signup_deadline/);
  assert.doesNotMatch(sql, /comment_source_url/);
});

test("inserts exactly the original 11 columns, in the original order", () => {
  assert.match(
    sql,
    /insert into public\.meetings\s*\n\s*\(title,county_id,starts_at,timezone,location_name,street_address,city,state,postal_code,is_pinned_statewide,status\)/
  );
});
