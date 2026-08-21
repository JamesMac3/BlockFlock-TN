import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import migrationSql from "../../../../supabase/migrations/20260821032341_operator_draft_request_preview.sql?raw";

/**
 * Static assertions against the unapplied operator-draft-preview
 * migration's actual SQL text. This cannot be run against a live database
 * (no live Supabase access in this environment), so these checks are the
 * closest available proof that the security requirements the task called
 * for are actually present in the file that would be applied.
 *
 * public.security_audit_events already exists live with its own schema
 * (id, actor_user_id, county_id, event_type, target_table, target_id,
 * event_data, created_at) — this migration must never create, alter, or
 * re-grant it, only insert through its existing shape.
 */

describe("operator draft-preview migration: authorization", () => {
  it("reuses the existing rrg_can_manage_goal helper rather than reinventing authorization", () => {
    expect(migrationSql).toMatch(/rrg_can_manage_goal\(p_goal_id\)/);
  });

  it("takes only a goal ID — never a county ID, entity ID, or profile ID from the caller", () => {
    const signatureMatch = migrationSql.match(/create or replace function public\.get_draft_request_preview_bundle\(([^)]*)\)/);
    expect(signatureMatch).not.toBeNull();
    expect(signatureMatch?.[1].trim()).toBe("p_goal_id bigint");
  });

  it("derives county_id and government_entity_id from the goal row, never from a parameter", () => {
    expect(migrationSql).toMatch(/v_goal\.county_id/);
    expect(migrationSql).toMatch(/v_goal\.government_entity_id/);
    expect(migrationSql).not.toMatch(/p_county_id/i);
    expect(migrationSql).not.toMatch(/p_entity_id/i);
  });

  it("cross-checks the profile's and entity's own foreign keys against the goal before returning anything", () => {
    expect(migrationSql).toMatch(/v_profile\.government_entity_id is distinct from v_goal\.government_entity_id/);
    expect(migrationSql).toMatch(/v_entity\.county_id is distinct from v_goal\.county_id/);
  });

  it("rejects a locked goal before returning any data", () => {
    expect(migrationSql).toMatch(/if v_goal\.locked then/);
  });
});

describe("operator draft-preview migration: SECURITY DEFINER hardening", () => {
  it("is a security definer function", () => {
    expect(migrationSql).toMatch(/security definer/i);
  });

  it("includes an explicit auth.uid() check", () => {
    expect(migrationSql).toMatch(/v_uid uuid := auth\.uid\(\)/);
    expect(migrationSql).toMatch(/if v_uid is null then/);
  });

  it("sets an empty, explicit search_path", () => {
    expect(migrationSql).toMatch(/set search_path = ''/);
  });

  it("fully qualifies referenced tables with the public schema", () => {
    for (const table of [
      "public.county_records_request_goals",
      "public.request_profiles",
      "public.government_entities",
      "public.evidence_objects",
      "public.security_audit_events",
      "public.portal_accounts",
    ]) {
      expect(migrationSql).toContain(table);
    }
  });

  it("revokes EXECUTE from public and anon, and grants only to authenticated", () => {
    expect(migrationSql).toMatch(/revoke all on function public\.get_draft_request_preview_bundle\(bigint\) from public;/);
    expect(migrationSql).toMatch(/revoke all on function public\.get_draft_request_preview_bundle\(bigint\) from anon;/);
    expect(migrationSql).toMatch(/grant execute on function public\.get_draft_request_preview_bundle\(bigint\) to authenticated;/);
    expect(migrationSql).not.toMatch(/grant execute on function public\.get_draft_request_preview_bundle\(bigint\) to (public|anon)/i);
  });
});

describe("operator draft-preview migration: no broad exposure of draft profiles", () => {
  it("never grants a broad SELECT policy on request_profiles for drafts", () => {
    expect(migrationSql).not.toMatch(/create policy[^;]*request_profiles/is);
    expect(migrationSql).not.toMatch(/alter table public\.request_profiles/i);
  });

  it("never touches the existing public verified-profile RLS policy", () => {
    expect(migrationSql).not.toMatch(/request_profiles_read_current_verified/);
  });

  it("never weakens RLS on any table (no disable/force-off statements)", () => {
    expect(migrationSql).not.toMatch(/disable row level security/i);
  });

  it("requires the linked request profile to be status = 'draft', rejecting in_review/verified/retired", () => {
    expect(migrationSql).toMatch(/if v_profile\.status is distinct from 'draft' then/);
  });

  it("never grants any privilege on security_audit_events (RLS/grants there are preserved exactly as they exist live)", () => {
    expect(migrationSql).not.toMatch(/grant [^;]*on table public\.security_audit_events/i);
    expect(migrationSql).not.toMatch(/alter table public\.security_audit_events/i);
  });
});

describe("operator draft-preview migration: does not create or alter the existing audit table", () => {
  it("never creates public.security_audit_events — it is required to already exist live", () => {
    expect(migrationSql).not.toMatch(/create table[^;]*security_audit_events/i);
  });

  it("never alters public.security_audit_events (no RLS enable/force/revoke statements against it)", () => {
    expect(migrationSql).not.toMatch(/alter table (if exists )?public\.security_audit_events/i);
  });

  it("fails fast at migration-apply time if the existing table is missing or missing an expected column, instead of creating one", () => {
    expect(migrationSql).toMatch(/if to_regclass\('public\.security_audit_events'\) is null then/);
    expect(migrationSql).toMatch(
      /perform actor_user_id, county_id, event_type, target_table, target_id, event_data\s*\n\s*from public\.security_audit_events\s*\n\s*where false;/,
    );
  });
});

describe("operator draft-preview migration: audit insert matches the existing live schema", () => {
  it("inserts into the existing columns only: actor_user_id, county_id, event_type, target_table, target_id, event_data", () => {
    const insertMatch = migrationSql.match(/insert into public\.security_audit_events \(([\s\S]*?)\) values/);
    expect(insertMatch).not.toBeNull();
    const insertColumns = insertMatch![1].replace(/\s+/g, " ").trim();
    expect(insertColumns).toBe("actor_user_id, county_id, event_type, target_table, target_id, event_data");
  });

  it("uses actor_user_id = auth.uid() and county_id = v_goal.county_id, matching the existing audit convention", () => {
    const insertBlock = migrationSql.match(/insert into public\.security_audit_events \([\s\S]*?\);/)?.[0] ?? "";
    expect(insertBlock).toContain("v_uid,");
    expect(insertBlock).toContain("v_goal.county_id,");
  });

  it("logs the successful bundle access with 'request_profile_preview_bundle_accessed', never a false 'generated' claim", () => {
    expect(migrationSql).toContain("'request_profile_preview_bundle_accessed'");
    expect(migrationSql).not.toContain("'request_profile_preview_generated'");
  });

  it("sets target_table = 'request_profiles' and target_id = v_profile.id::text", () => {
    const insertBlock = migrationSql.match(/insert into public\.security_audit_events \([\s\S]*?\);/)?.[0] ?? "";
    expect(insertBlock).toContain("'request_profiles',");
    expect(insertBlock).toContain("v_profile.id::text,");
  });

  it("populates event_data with only goal_id, government_entity_id, and profile_status", () => {
    const insertBlock = migrationSql.match(/insert into public\.security_audit_events \([\s\S]*?\);/)?.[0] ?? "";
    const eventDataMatch = insertBlock.match(/jsonb_build_object\(([\s\S]*?)\)\s*\);/);
    expect(eventDataMatch).not.toBeNull();
    const keys = [...eventDataMatch![1].matchAll(/'([a-z_]+)',/g)].map((match) => match[1]);
    expect(keys.sort()).toEqual(["goal_id", "government_entity_id", "profile_status"]);
  });

  it("never stores generated PDF bytes, request language, fill_payload, email, requester identity, signature, or citizenship data in the audit event", () => {
    const insertBlock = migrationSql.match(/insert into public\.security_audit_events \([\s\S]*?\);/)?.[0] ?? "";
    const lower = insertBlock.toLowerCase();
    for (const forbidden of [
      "pdf_bytes",
      "pdfbytes",
      "fill_payload",
      "requester",
      "email",
      "signature",
      "citizenship",
      "phone",
      "goal_language",
      "records_description",
    ]) {
      expect(lower).not.toContain(forbidden);
    }
  });
});

describe("operator draft-preview migration: evidence uses the real evidence_objects columns", () => {
  it("selects from the real storage_bucket/storage_path columns, never nonexistent bucket_id/object_path raw columns", () => {
    expect(migrationSql).toMatch(/select \* into v_evidence\s*\n\s*from public\.evidence_objects/);
    expect(migrationSql).not.toMatch(/evidence\.bucket_id/);
    expect(migrationSql).not.toMatch(/evidence\.object_path/);
  });

  it("requires object_kind in ('base_pdf', 'continuation_pdf') before returning evidence", () => {
    expect(migrationSql).toMatch(/v_evidence\.object_kind not in \('base_pdf', 'continuation_pdf'\)/);
  });

  it("requires storage_bucket = 'request-templates' before returning evidence", () => {
    expect(migrationSql).toMatch(/v_evidence\.storage_bucket is distinct from 'request-templates'/);
  });

  it("requires mime_type = 'application/pdf' before returning evidence", () => {
    expect(migrationSql).toMatch(/v_evidence\.mime_type is distinct from 'application\/pdf'/);
  });

  it("requires visibility = 'public' before returning evidence", () => {
    expect(migrationSql).toMatch(/v_evidence\.visibility is distinct from 'public'/);
  });

  it("requires status = 'published' before returning evidence", () => {
    expect(migrationSql).toMatch(/v_evidence\.status is distinct from 'published'/);
  });

  it("aliases storage_bucket/storage_path to the client contract's bucket_id/object_path only in the returned jsonb, not as source column names", () => {
    expect(migrationSql).toMatch(/'bucket_id', v_evidence\.storage_bucket/);
    expect(migrationSql).toMatch(/'object_path', v_evidence\.storage_path/);
  });
});

describe("operator draft-preview migration: preview bundle allowlisted columns", () => {
  it("never returns county_contacts or subscription data", () => {
    expect(migrationSql).not.toMatch(/county_contacts/);
  });

  it("returns evidence metadata shaped for the existing template-verification loader", () => {
    for (const column of ["bucket_id", "object_path", "mime_type", "size_bytes", "sha256_hex"]) {
      expect(migrationSql).toContain(column);
    }
  });

  it("preserves the goal's fill_payload verbatim in the bundle rather than omitting or rewriting it", () => {
    expect(migrationSql).toMatch(/'fill_payload', v_goal\.fill_payload/);
  });
});

describe("operator draft-preview migration: transaction and precondition safety", () => {
  it("wraps every write in a single transaction", () => {
    const beginIndex = migrationSql.indexOf("begin;");
    const commitIndex = migrationSql.indexOf("commit;");
    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(commitIndex).toBeGreaterThan(beginIndex);
  });

  it("checks the required foundation objects exist before proceeding", () => {
    expect(migrationSql).toMatch(/if to_regclass\('public\.portal_accounts'\) is null then/);
    expect(migrationSql).toMatch(/if to_regprocedure\('public\.rrg_can_manage_goal\(bigint\)'\) is null then/);
  });

  it("never applies anything to live Supabase from this repository (this is a checked-in, unapplied file only)", () => {
    // This is a static/textual sanity check, not a live-connectivity check:
    // the file contains no reference to a live project host or service-role
    // credential, which would be a sign someone tried to script an apply
    // step into the migration file itself.
    expect(migrationSql).not.toMatch(/supabase\.co/);
    expect(migrationSql).not.toMatch(/service_role/i);
  });
});
