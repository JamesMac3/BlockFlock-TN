import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import migrationSql from "../../../supabase/migrations/20260814_records_request_goals.sql?raw";

/**
 * Regression coverage proving goal creation/editing is authorized
 * server-side, not only by the frontend's county selector — the goal-edit
 * popout has no way to bypass this, since Supabase RLS runs regardless of
 * what the client sends. This is the pre-existing (already-applied)
 * migration; these assertions document and pin the exact policy text
 * being relied on rather than re-deriving it from memory.
 */

describe("county_records_request_goals: server-side authorization for create/edit", () => {
  it("INSERT is gated on rrg_can_manage_county(county_id) — an administrator may create for any county, a chapter master only their own", () => {
    expect(migrationSql).toMatch(
      /create policy "Operators can insert managed county goals"\s*\non public\.county_records_request_goals\s*\nfor insert\s*\nto authenticated\s*\nwith check \(\s*\n\s*created_by = auth\.uid\(\)\s*\n\s*and public\.rrg_can_manage_county\(county_id\)\s*\n\)/,
    );
  });

  it("UPDATE is gated the same way, so a chapter master cannot retarget an existing goal to another county's id and keep editing it", () => {
    expect(migrationSql).toMatch(
      /create policy "Operators can update managed county goals"\s*\non public\.county_records_request_goals\s*\nfor update\s*\nto authenticated\s*\nusing \(public\.rrg_can_manage_county\(county_id\)\)\s*\nwith check \(public\.rrg_can_manage_county\(county_id\)\)/,
    );
  });

  it("rrg_can_manage_county requires status = 'active' and (admin, or chapter_master matching the requested county) — never trusts a client-supplied role", () => {
    const fn = migrationSql.match(/create or replace function public\.rrg_can_manage_county\(requested_county_id bigint\)[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(fn).toMatch(/account\.status = 'active'/);
    expect(fn).toMatch(/account\.role = 'admin'/);
    expect(fn).toMatch(/account\.role = 'chapter_master'\s*\n\s*and account\.county_id = requested_county_id/);
    expect(fn).toMatch(/where account\.user_id = auth\.uid\(\)/);
  });

  it("is a SECURITY DEFINER function with an empty search_path (defense in depth, not just an RLS-only guarantee)", () => {
    const fn = migrationSql.match(/create or replace function public\.rrg_can_manage_county\(requested_county_id bigint\)[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(fn).toMatch(/security definer/);
    expect(fn).toMatch(/set search_path = ''/);
  });
});
