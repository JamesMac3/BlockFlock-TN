import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import migrationSql from "../../../supabase/migrations/20260821233037_decentralize_request_profile_authority.sql?raw";

/**
 * Static assertions against the unapplied request-profile-authority
 * migration's actual SQL text — the closest available proof of its
 * behavior since there is no live database in this environment.
 */

function extractFunction(sql: string, signature: string): string {
  const start = sql.indexOf(signature);
  if (start === -1) return "";
  const end = sql.indexOf("\n$$;", start);
  return end === -1 ? "" : sql.slice(start, end + 4);
}

describe("profile authority migration: never touches schema or RLS", () => {
  it("creates no table and adds no column", () => {
    expect(migrationSql).not.toMatch(/create table/i);
    expect(migrationSql).not.toMatch(/alter table[\s\S]*?add column/i);
  });

  it("never alters row level security", () => {
    expect(migrationSql).not.toMatch(/alter table.*row level security/i);
    expect(migrationSql).not.toMatch(/create policy/i);
  });

  it("checks foundation objects exist before proceeding, never creates them", () => {
    expect(migrationSql).toMatch(/if to_regclass\('public\.request_profiles'\) is null then/);
    expect(migrationSql).toMatch(/if to_regclass\('public\.government_entities'\) is null then/);
    expect(migrationSql).toMatch(/if to_regprocedure\('public\.rrg_can_manage_county\(bigint\)'\) is null then/);
  });
});

describe("profile authority migration: county authority is resolved server-side, never trusted from the client", () => {
  const helperFn = extractFunction(migrationSql, "create or replace function public.rrg_can_manage_profile_entity(");

  it("resolves the entity's own county_id and delegates to the existing rrg_can_manage_county helper", () => {
    expect(helperFn).toMatch(/select public\.rrg_can_manage_county\(entity\.county_id\)/);
    expect(helperFn).toMatch(/from public\.government_entities as entity/);
  });

  it("never accepts a caller-supplied county id as a parameter — only the entity id, whose county is looked up server-side", () => {
    expect(migrationSql).toMatch(/rrg_can_manage_profile_entity\(p_government_entity_id bigint\)/);
    expect(migrationSql).not.toMatch(/rrg_can_manage_profile_entity\([^)]*county_id/);
  });

  it("returns false, never null or an exception, for an unknown entity id", () => {
    expect(helperFn).toMatch(/select coalesce\(/);
    expect(helperFn).toMatch(/false\s*\n\s*\);/);
  });
});

for (const [name, signature, hasProfileIdParam] of [
  ["rrg_create_request_profile", "create or replace function public.rrg_create_request_profile(", false],
  ["rrg_update_request_profile", "create or replace function public.rrg_update_request_profile(", true],
  ["rrg_activate_request_profile", "create or replace function public.rrg_activate_request_profile(", true],
  ["rrg_retire_request_profile", "create or replace function public.rrg_retire_request_profile(", true],
  ["rrg_replace_request_profile", "create or replace function public.rrg_replace_request_profile(", true],
] as const) {
  describe(`profile authority migration: ${name} authorization`, () => {
    const fn = extractFunction(migrationSql, signature);

    it("exists with SECURITY DEFINER and an empty search_path", () => {
      expect(fn).not.toBe("");
      expect(fn).toMatch(/security definer/);
      expect(fn).toMatch(/set search_path = ''/);
    });

    it("requires authentication before anything else", () => {
      expect(fn).toMatch(/if v_uid is null then\s*\n\s*raise exception 'Authentication required\.'/);
    });

    it("requires an active portal account — suspended accounts are denied", () => {
      expect(fn).toMatch(/account\.status = 'active'/);
    });

    it("checks county authority via rrg_can_manage_profile_entity before any mutation", () => {
      expect(fn).toMatch(/if not public\.rrg_can_manage_profile_entity\(/);
    });

    it("audits the mutation via the existing security_audit_events shape only", () => {
      expect(fn).toMatch(
        /insert into public\.security_audit_events \(\s*\n\s*actor_user_id, county_id, event_type, target_table, target_id, event_data\s*\n\s*\)/,
      );
    });

    if (hasProfileIdParam) {
      it("locks the target profile row before authorizing/mutating it", () => {
        expect(fn).toMatch(/for update;/);
      });
    }
  });
}

describe("profile authority migration: immutability once activated or retired", () => {
  it("rrg_update_request_profile rejects editing a non-draft profile", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.rrg_update_request_profile(");
    expect(fn).toMatch(/if v_profile\.status <> 'draft' then/);
    expect(fn).toMatch(/Activated and retired profiles are immutable/);
  });

  it("rrg_activate_request_profile only activates a draft — never re-activates or activates a retired profile", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.rrg_activate_request_profile(");
    expect(fn).toMatch(/if v_profile\.status <> 'draft' then/);
    expect(fn).toMatch(/Only a draft request profile can be activated\./);
  });

  it("rrg_retire_request_profile refuses to re-retire an already-retired profile", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.rrg_retire_request_profile(");
    expect(fn).toMatch(/if v_profile\.status = 'retired' then/);
  });

  it("rrg_replace_request_profile is only for a verified or retired profile, not a draft (which should use update instead)", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.rrg_replace_request_profile(");
    expect(fn).toMatch(/if v_source\.status = 'draft' then/);
    expect(fn).toMatch(/replace is only for a verified or retired profile/);
  });

  it("rrg_replace_request_profile retires the source profile only if it was verified, and always creates a new draft version", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.rrg_replace_request_profile(");
    expect(fn).toMatch(/if v_source\.status = 'verified' then\s*\n\s*update public\.request_profiles set status = 'retired'/);
    expect(fn).toMatch(/insert into public\.request_profiles/);
  });
});

describe("profile authority migration: activation validates every server-checkable prerequisite", () => {
  const fn = extractFunction(migrationSql, "create or replace function public.rrg_activate_request_profile(");

  it("validates the government entity and county relationship", () => {
    expect(fn).toMatch(/select \* into v_entity from public\.government_entities where id = v_profile\.government_entity_id;/);
    expect(fn).toMatch(/if v_entity\.county_id is null then/);
  });

  it("validates base-template evidence for acroform/overlay renderers — real, public, published, correctly bucketed", () => {
    expect(fn).toMatch(/if v_profile\.renderer_type in \('acroform', 'overlay'\) then/);
    expect(fn).toMatch(/evidence\.visibility = 'public'/);
    expect(fn).toMatch(/evidence\.status = 'published'/);
    expect(fn).toMatch(/evidence\.mime_type = 'application\/pdf'/);
    expect(fn).toMatch(/evidence\.storage_bucket = 'request-templates'/);
  });

  it("validates the field_schema's renderer_type matches the profile's own renderer_type", () => {
    expect(fn).toMatch(/field_schema ->> 'renderer_type'/);
  });

  it("validates effective-date ordering", () => {
    expect(fn).toMatch(/if v_profile\.effective_to is not null/);
    expect(fn).toMatch(/The effective date range is inverted\./);
  });

  it("sets status, verified_by, and verified_at on success", () => {
    expect(fn).toMatch(/status = 'verified',/);
    expect(fn).toMatch(/verified_by = v_uid,/);
    expect(fn).toMatch(/verified_at = now\(\),/);
  });

  it("does not itself run PDF generation — that is a client-side gate, documented as such", () => {
    expect(migrationSql).toMatch(/cannot[\s\S]{0,10}itself run the PDF rendering pipeline/);
  });
});

describe("profile authority migration: review_required (trusted/restricted) never gates profile authority", () => {
  it("the header comment explicitly documents that review_required is deliberately never read here", () => {
    expect(migrationSql).toMatch(/review_required[\s\S]{0,80}posts-only concept/);
  });

  it("no function body actually references review_required — only account.status gates anything", () => {
    for (const signature of [
      "create or replace function public.rrg_create_request_profile(",
      "create or replace function public.rrg_update_request_profile(",
      "create or replace function public.rrg_activate_request_profile(",
      "create or replace function public.rrg_retire_request_profile(",
      "create or replace function public.rrg_replace_request_profile(",
    ]) {
      const fn = extractFunction(migrationSql, signature);
      expect(fn).not.toMatch(/review_required/);
    }
  });
});

describe("profile authority migration: grants", () => {
  it("grants every new function to authenticated only, never anon or public", () => {
    for (const signature of [
      "public.rrg_can_manage_profile_entity(bigint)",
      "public.rrg_activate_request_profile(uuid)",
      "public.rrg_retire_request_profile(uuid)",
      "public.rrg_replace_request_profile(uuid)",
    ]) {
      expect(migrationSql).toContain(signature);
    }
    expect(migrationSql).toMatch(/revoke all on function %s from public;/);
    expect(migrationSql).toMatch(/revoke all on function %s from anon;/);
    expect(migrationSql).toMatch(/grant execute on function %s to authenticated;/);
    expect(migrationSql).not.toMatch(/grant execute on function [^;]*to (public|anon)\b/i);
  });
});

describe("profile authority migration: transaction safety", () => {
  it("wraps writes in a single transaction", () => {
    const beginIndex = migrationSql.indexOf("begin;");
    const commitIndex = migrationSql.indexOf("commit;");
    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(commitIndex).toBeGreaterThan(beginIndex);
  });
});
