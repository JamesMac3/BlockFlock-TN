import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import migrationSql from "../../../supabase/migrations/20260821234022_document_management_county_statistics_and_archive_gate.sql?raw";

function extractFunction(signature: string): string {
  const start = migrationSql.indexOf(signature);
  if (start === -1) return "";
  const end = migrationSql.indexOf("\n$$;", start);
  return end === -1 ? "" : migrationSql.slice(start, end + 4);
}

describe("document management migration contract", () => {
  for (const signature of [
    "create or replace function public.rrg_list_documents(",
    "create or replace function public.rrg_admin_list_orphaned_documents(",
    "create or replace function public.rrg_update_document_metadata(",
    "create or replace function public.rrg_move_document_to_goal(",
    "create or replace function public.rrg_disassociate_document(",
    "create or replace function public.rrg_get_document_for_portal(",
  ]) {
    it(`${signature} is security-definer with a fixed search path`, () => {
      const fn = extractFunction(signature);
      expect(fn).not.toBe("");
      expect(fn).toMatch(/security definer/);
      expect(fn).toMatch(/set search_path = ''/);
    });
  }

  it("forces chapter masters to their account county rather than trusting p_county_id", () => {
    const fn = extractFunction("create or replace function public.rrg_list_documents(");
    expect(fn).toMatch(/if v_account\.role = 'chapter_master' then/);
    expect(fn).toMatch(/v_county_id := v_account\.county_id;/);
  });

  it("disassociation deletes only the link and explicitly audits preservation", () => {
    const fn = extractFunction("create or replace function public.rrg_disassociate_document(");
    expect(fn).toMatch(/delete from public\.records_request_goal_links/);
    expect(fn).not.toMatch(/delete from public\.evidence_objects/);
    expect(fn).not.toMatch(/storage\.objects/);
    expect(fn).toMatch(/'stored_object_preserved', true/);
  });

  it("rejects cross-county document moves, including evidence/county mismatches", () => {
    const fn = extractFunction("create or replace function public.rrg_move_document_to_goal(");
    expect(fn).toMatch(/v_source_goal\.county_id is distinct from v_target_goal\.county_id/);
    expect(fn).toMatch(/v_evidence\.county_id is distinct from v_target_goal\.county_id/);
  });

  it("does not grant operator document functions to anon", () => {
    expect(migrationSql).toMatch(/revoke all on function public\.rrg_list_documents[\s\S]*?from public, anon;/);
    const grantLines = migrationSql
      .split("\n")
      .filter((line) => line.startsWith("grant execute on function public.rrg_list_documents"));
    expect(grantLines).toEqual([
      "grant execute on function public.rrg_list_documents(text, bigint, text, text, integer, integer) to authenticated;",
    ]);
  });
});

describe("county statistics migration contract", () => {
  it("returns only a distinct aggregate of nonblank emails", () => {
    const fn = extractFunction("create or replace function public.rrg_get_county_statistics(");
    expect(fn).toMatch(/count\(distinct lower\(trim\(contact\.email\)\)\)/);
    const returnShape = fn.match(/returns table \([\s\S]*?\)\nlanguage/)?.[0] ?? "";
    expect(returnShape).not.toBe("");
    expect(returnShape).not.toMatch(/\bemail\b/);
  });

  it("authorizes both reads and writes with the existing county helper", () => {
    expect(extractFunction("create or replace function public.rrg_get_county_statistics(")).toMatch(
      /rrg_can_manage_county\(p_county_id\)/,
    );
    expect(extractFunction("create or replace function public.rrg_update_county_statistics(")).toMatch(
      /rrg_can_manage_county\(p_county_id\)/,
    );
  });

  it("enforces the same 0 through 100000 bounds as the UI", () => {
    const fn = extractFunction("create or replace function public.rrg_update_county_statistics(");
    expect(fn).toMatch(/p_camera_count < 0 or p_camera_count > 100000/);
    expect(fn).toMatch(/p_drone_count < 0 or p_drone_count > 100000/);
  });
});

describe("public archive gate", () => {
  it("includes unlocked ready/received/published goals without requiring a resource", () => {
    const fn = extractFunction("create or replace function public.get_public_archive_goals()");
    expect(fn).toMatch(/left join qualifying_links/);
    expect(fn).toMatch(/goal\.locked = false/);
    expect(fn).toMatch(/goal\.status in \('ready', 'received', 'published'\)/);
  });

  it("keeps hosted resources independently public and published", () => {
    const fn = extractFunction("create or replace function public.get_public_archive_goal(");
    expect(fn).toMatch(/evidence\.visibility = 'public'/);
    expect(fn).toMatch(/evidence\.status = 'published'/);
    expect(fn).toMatch(/link\.external_url ~ '\^https:\/\/'/);
  });
});
